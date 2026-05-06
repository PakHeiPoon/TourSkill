# Merchant-Agent Reference Template

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md), [01_TARGET_ARCHITECTURE.md](./01_TARGET_ARCHITECTURE.md), [03_AGENT_CARD_SPEC.md](./03_AGENT_CARD_SPEC.md).

Open-source TypeScript template every merchant uses (self-hosted) or that
TourSkill runs multi-tenant (platform-hosted). Same code, two deployment
modes. The external surface is **byte-identical** between the two
modes — Principle 6.

---

## 1. Repo layout

```
merchant-agent-template/
├── apps/
│   └── agent/                     # the actual agent runtime
│       ├── src/
│       │   ├── index.ts           # Hono app entry
│       │   ├── routes/
│       │   │   ├── agent-card.ts  # GET /.well-known/agent-card.json
│       │   │   ├── auth.ts        # /auth/challenge + /auth/verify
│       │   │   ├── skills/        # one file per skill, auto-registered
│       │   │   │   ├── check_availability.ts
│       │   │   │   ├── get_rates.ts
│       │   │   │   ├── create_booking.ts
│       │   │   │   └── ...
│       │   │   ├── admin/         # merchant-facing admin API
│       │   │   └── health.ts
│       │   ├── core/
│       │   │   ├── store.ts       # MerchantStore interface
│       │   │   ├── llm.ts         # LLMClient interface
│       │   │   ├── x402.ts        # x402 middleware wrapper
│       │   │   ├── auth.ts        # bearer + EIP-191 verification
│       │   │   └── card.ts        # agent-card builder + hash
│       │   ├── stores/
│       │   │   ├── sqlite.ts      # default for solo / dev
│       │   │   └── postgres.ts    # for production / multi-tenant
│       │   ├── llm/
│       │   │   ├── openai.ts      # works with OpenAI, Qiniu, 0G, ...
│       │   │   └── anthropic.ts
│       │   └── domain/
│       │       ├── hotel.ts       # type-specific skill defaults
│       │       ├── restaurant.ts
│       │       ├── attraction.ts
│       │       └── shop.ts
│       ├── tests/                 # vitest
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared-types/              # types shared with TourSkill backend
│   └── eslint-config/
├── examples/
│   ├── self-hosted-vercel/        # one-click deploy template
│   ├── self-hosted-fly/
│   ├── self-hosted-docker/
│   └── platform-tenant/           # for TourSkill's multi-tenant runtime
├── docs/
│   ├── DEPLOY.md                  # quickstart for each platform
│   ├── CUSTOMIZE.md               # how to add a custom skill
│   └── MIGRATE.md                 # platform-hosted ↔ self-hosted
├── .env.example
├── README.md
└── LICENSE  (MIT)
```

**Why monorepo:** the template ships with multiple deploy targets (Vercel,
Fly, Docker, Cloudflare Workers eventually) plus shared types. Single
repo + workspaces (pnpm) keeps it tight.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| HTTP framework | **Hono** | Runs on Vercel Edge / Cloudflare / Bun / Node — same code; tiny dep footprint; best Hono adapter for x402 exists |
| Validation | **Zod** | Native to Hono, generates the JSON Schemas we expose in agent-card |
| ORM | **Drizzle** | TS-native, supports SQLite + Postgres + libSQL with the same query API |
| Auth crypto | **viem** | EIP-191 verification, future on-chain reads |
| LLM client | **OpenAI SDK** (provider-agnostic via `baseURL`) | Works with OpenAI, Qiniu, 0G Compute, DeepSeek direct, etc. |
| x402 middleware | **`x402-hono`** (Coinbase official) | Standard adapter for Hono apps |
| Build / test | **Vite + Vitest** | Same family as the front-end repo, low cognitive load |
| Lint / format | **ESLint + Biome** | Biome handles formatting; ESLint catches Hono-specific issues |
| CI | GitHub Actions | matrix on Node 20 / Bun latest / Cloudflare Workers runtime |

**Why not Next.js**: agent runtime ≠ web app. Hono's mental model
(HTTP-handler, no SSR) matches what we're building. Less to fight.

**Why not Python/FastAPI**: x402 SDK is TS-first; Hono is more deployable
(works on every edge platform); team already speaks TS for frontend.
Python template will follow as a separate repo once we have someone owning it.

---

## 3. Core interfaces

### 3.1 `MerchantStore`

```typescript
// Abstracts the merchant's data so SQLite / Postgres / a merchant's own
// PMS can be swapped in.
export interface MerchantStore {
  // Inventory
  listItems(filter?: ItemFilter): Promise<InventoryItem[]>;
  getItem(itemId: string): Promise<InventoryItem | null>;
  upsertItem(item: InventoryItem): Promise<void>;

  // Calendar (per item × date availability)
  getAvailability(itemId: string, range: DateRange): Promise<DailyAvailability[]>;
  setAvailability(itemId: string, date: string, count: number): Promise<void>;

  // Bookings
  createBooking(b: BookingDraft): Promise<Booking>;
  getBooking(bookingId: string): Promise<Booking | null>;
  listBookings(filter: BookingFilter): Promise<Booking[]>;

  // Settings (cancellation policy, opening hours, etc.)
  getSettings(): Promise<MerchantSettings>;
  setSettings(s: Partial<MerchantSettings>): Promise<void>;
}
```

Two reference implementations ship: `SQLiteStore` (single-file DB, default
for solo merchants) and `PostgresStore` (for multi-tenant platform
deployment, with `tenantId` as an implicit query filter).

### 3.2 `LLMClient`

```typescript
export interface LLMClient {
  chat(opts: {
    system?: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    toolChoice?: 'auto' | 'none' | { name: string };
    maxTokens?: number;
  }): Promise<ChatResponse>;
}
```

The merchant-agent uses an LLM **only** for skills that need natural
language reasoning (e.g., a "concierge" skill that takes free-text
questions). Most skills (`check_availability`, `create_booking`,
`get_rates`) are deterministic and don't touch the LLM at all — they go
straight from request → store → response.

This is critical for cost. A merchant doing 1000 bookings/day shouldn't
be paying 1000 LLM calls when 990 of them are pure CRUD.

### 3.3 Skill registration

Each file in `src/routes/skills/` exports a default object:

```typescript
import { defineSkill } from '../../core/skill.js';
import { z } from 'zod';

export default defineSkill({
  name: 'check_availability',
  description: 'Check room availability for a date range and room type.',
  inputSchema: z.object({
    check_in:  z.string().date(),
    check_out: z.string().date(),
    room_type: z.string(),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    nights: z.number().int().positive(),
    total_usdc: z.number(),
  }),
  // x402 hint: this skill is free (read-only)
  pricing: { free: true },
  // Pure handler — no LLM
  async handle({ input, ctx }) {
    const { check_in, check_out, room_type } = input;
    const range = daysBetween(check_in, check_out);
    const availability = await ctx.store.getAvailability(room_type, { from: check_in, to: check_out });
    const allAvailable = availability.every(d => d.count > 0);
    if (!allAvailable) return { available: false, nights: range, total_usdc: 0 };
    const settings = await ctx.store.getSettings();
    const nightly = settings.nightlyRates[room_type] ?? 0;
    return { available: true, nights: range, total_usdc: nightly * range };
  },
});
```

Skills are auto-discovered at boot — drop a file in `routes/skills/`,
restart, it shows up in agent-card.json. No manual registration.

### 3.4 x402 middleware integration

> **Boundary** (revised — see [`05_X402_PAYMENT_FLOW.md` § Scope](./05_X402_PAYMENT_FLOW.md)):
> x402 in TourSkill is for **stateless per-call micropayments only**
> (paid metadata skills like `get_rates_premium`). It is **not** the
> payment rail for `create_booking` — booking-level held funds use a
> separate `BookingEscrow` instrument (Phase C, deferred).

**Block 1 — paid metadata skill** (Phase B-min target):

```typescript
export default defineSkill({
  name: 'get_rates_premium',
  // ...
  pricing: {
    type: 'flat',
    flatUsdc: 10_000,            // $0.01 USDC, paid once per call
  },
  async handle({ input, ctx, payment }) {
    // payment is set by x402 middleware after EIP-3009 transfer lands.
    // No escrow, no hold, no release — direct USDC into merchant wallet.
    return premiumRateMatrix(input);
  },
});
```

The middleware (Coinbase `x402-hono`) handles 402 → verify → 200; the
skill handler stays oblivious. **One HTTP round-trip, one USDC transfer,
no contract on the merchant side.**

**Block 2 — BookingEscrow (deferred to Phase C)**: when (and if) we
ship hold-and-release semantics for `create_booking`, the wire format
will be **separate** from x402: the user signs an EIP-712 typed message,
the client calls `BookingEscrow.lock(intentId, amount, payee, releaseAt)`
directly, and the booking endpoint accepts a Seaport-style order
reference, not an x402 payment proof. Block 2 will get its own document
(`05B_BOOKING_ESCROW.md`) when scoped.

In Phase A/B-min, `create_booking` stays free (creates a `pending`
booking; payment flow TBD per merchant policy — many merchants will
prefer auth-and-capture via direct USDC transfer over true escrow).

The middleware handles the 402 response, polling escrow contract for
deposit confirmation, retrying the request, and adding the `payment`
proof to the handler context.

---

## 4. Boot sequence

```
1. Read .env (provider keys, store URL, registry addr, agent's wallet, ...)
2. Build agent-card.json from settings + auto-discovered skills
3. Compute SHA-256 of agent-card → cache for /.well-known endpoint
4. (Production only) Verify hash matches IdentityRegistry — if mismatch,
   log loudly and refuse to serve. The merchant must run `npm run sync-card`
   to update on-chain hash before the agent will boot.
5. Initialize MerchantStore (run migrations if SQLite)
6. Mount routes: /.well-known/agent-card.json, /auth/*, /skills/*, /admin/*, /health
7. Start Hono on PORT
```

The `sync-card` script reads the local agent-card, computes the hash, and
writes a transaction to `IdentityRegistry.update(agentId, uri, newHash)`.
The merchant signs once with their wallet (their own MetaMask, hardware
wallet, etc.) — TourSkill never touches their key.

---

## 5. Required environment variables

```bash
# Identity
AGENT_ID=42                                 # ERC-8004 agent ID
AGENT_OWNER_ADDRESS=0x5A0Ccd...44E7         # for display only; chain is source of truth

# Hosting
PUBLIC_URL=https://wumingchu.example.com    # base URL served at top-level "url"
PORT=8787

# Store
STORE_DRIVER=sqlite                         # sqlite | postgres
STORE_URL=file:./data/agent.db              # OR postgres://user:pass@host/db

# LLM (optional — only needed if any skill uses it)
LLM_PROVIDER=qiniu                          # openai | qiniu | zerog | anthropic
LLM_BASE_URL=https://api.qnaigc.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek/deepseek-v3.2

# Chain
CHAIN_ID=84532                              # base-sepolia
RPC_URL=https://sepolia.base.org
IDENTITY_REGISTRY=0xIDENT...
REPUTATION_REGISTRY=0xREP...
BOOKING_ESCROW=0xESCROW...
USDC_ADDRESS=0x036CbD53...                  # Base Sepolia USDC

# Payment routing
PAYOUT_ADDRESS=0xMERCHANT_PAYOUT...

# Optional — multi-tenant runtime only
TENANT_ID=                                  # set when running on TourSkill platform
```

---

## 6. Multi-tenant mode (platform-hosted)

When `TENANT_ID` is set, the agent runs in multi-tenant mode:

- All store queries are scoped by `tenantId` (Postgres row-level filter or schema-per-tenant; v1 = row-level filter for simplicity)
- The `/admin/*` routes require a TourSkill-issued JWT identifying the tenant + their authorized actions
- The agent-card URL is `https://api.tourskill.paking.xyz/agents/<slug>/.well-known/agent-card.json` instead of a custom domain (custom domain is a Tier 2+ feature)
- Outbound HTTP from one tenant cannot reach another tenant's storage — enforced by Postgres RLS

**A merchant migrating from platform → self-hosted does:**
1. Click "Export" in our admin UI → downloads SQLite dump + .env starter
2. `git clone tourskill/merchant-agent-template`
3. Drop SQLite file into `apps/agent/data/agent.db`, copy .env values
4. Deploy to their preferred platform
5. Update DNS for their custom domain
6. Run `npm run sync-card` to (optionally) rotate to a new agentCardURI
7. The on-chain `agentId` is unchanged — same wallet, same identity

Migration takes ~10 minutes. We facilitate, we don't fight.

---

## 7. Security boundaries

- **Wallet keys**: never present in the merchant-agent process. Skills
  that need on-chain writes use a **session signer** that the merchant
  authorizes once via their wallet UI (sign a "this agent can transfer
  from BookingEscrow up to N USDC for booking-IDs prefix M" attestation).
  In v1 we keep it simpler: x402 settlement is initiated by the *user*
  signing, not the merchant — the merchant never needs to sign anything
  during normal booking flow. Their key is only used at registration and
  card-update times.
- **LLM keys**: in env. Multi-tenant mode rotates per-tenant.
- **Inbound auth**: bearer or EIP-191 (see [03_AGENT_CARD_SPEC.md](./03_AGENT_CARD_SPEC.md) §4).
- **Skill input**: strict Zod validation. Excess fields = 400. No exceptions.
- **Skill output**: schema-validated before send. If a handler returns
  malformed data, the request fails server-side rather than confusing the
  caller.
- **CORS**: `Access-Control-Allow-Origin: *` for public read endpoints
  (agent-card, public skills). Restricted for `/admin/*`.

---

## 8. Observability

Built-in:
- `GET /health` — basic liveness
- `GET /admin/metrics` — Prometheus-style metrics (request counts,
  latencies, x402 settlement counts, error rates) — bearer-token-gated
- Structured JSON logs to stdout (Vercel / Fly / Railway all aggregate
  these natively)

External hookups (optional):
- Sentry SDK for unhandled errors
- OpenTelemetry exporter for traces

We do **not** ship a built-in dashboard in v1. Merchants on managed
hosting get our dashboard; self-hosted merchants point Prometheus + Grafana
at `/admin/metrics` themselves. Lean.

---

## 9. Quickstart from a merchant's POV

```bash
# 1. Fork the template repo
gh repo fork tourskill/merchant-agent-template --clone

# 2. Configure
cp apps/agent/.env.example apps/agent/.env
$EDITOR apps/agent/.env       # set PUBLIC_URL, AGENT_ID (omit for now), payout, ...

# 3. Initialize store + seed default skills
pnpm install
pnpm --filter agent setup     # creates SQLite, seeds default settings

# 4. Run locally
pnpm --filter agent dev

# 5. Customize agent-card via merchant settings UI
open http://localhost:8787/admin/setup

# 6. Deploy
vercel deploy --prod          # OR fly deploy / railway up / docker push

# 7. Register on ERC-8004
pnpm --filter agent register-onchain  # opens wallet, signs IdentityRegistry.register

# 8. Profit
echo "live at https://your-domain.com/.well-known/agent-card.json"
```

End-to-end: ~30 minutes from `gh repo fork` to first booking accepted, if
the merchant has Vercel + a Base Sepolia wallet ready.
