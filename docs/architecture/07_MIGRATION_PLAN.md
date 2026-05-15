# Migration Plan — Clean Slate

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md) Principle 4 ("Clean
> slate over backward-compat"), [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md), [04_MERCHANT_AGENT_TEMPLATE.md](./04_MERCHANT_AGENT_TEMPLATE.md).

This is the operational playbook for moving from the current
`MerchantRegistry.sol` + `skill_service.py` mocks to the ERC-8004 +
merchant-agent architecture. Order matters; some steps run in parallel,
some have hard dependencies.

---

## 0. Execution status (2026-05-09)

Phase A is **closed**. The plan below describes intent; this section
describes reality. When the two diverge, this section is authoritative.

### Phase A — shipped

| Sub-phase | What landed | Commit / proof |
|---|---|---|
| **A.2 Contracts** | `IdentityRegistry`, `ReputationRegistry`, `ValidationRegistry` deployed + verified on Base Sepolia | `d9957ee` · [Basescan](https://sepolia.basescan.org/address/0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f#code) |
| **A.3 Template** | `merchant-agent-template/` — Hono + Drizzle + better-sqlite3, 5 skills, 36 vitest tests | `721aee2` |
| **A.4 sync-card** | viem-based register/update/no-op script with `--dry-run` and `--from-local` flags. **Live-URL-first**: hashes the bytes the URL actually serves, not the local store | `3f3dbef` + later fix (see §0.3) |
| **A.5 Live deploy** | `wumingchu.tourskill.paking.xyz` on Fly.io (Tokyo, single shared-CPU machine, 1GB persistent volume), LetsEncrypt cert, DNSPod CNAME | `04c41b9` |
| **A.6 On-chain register** | agentId=1 written to IdentityRegistry; `getAgent(1)` returns the real `(owner, URI, hash, ts, ts, true)` tuple | tx [`0x88cf1987…43f970`](https://sepolia.basescan.org/tx/0x88cf198724a8b57b2d99b9aa293ed91400539dfc18019fde0bed01a8b443f970) |
| **A.7 demo asset** | 17 s 1920×1080 MP4 walking the protocol round-trip (discovery → fetch → verify → call) with real on-chain + on-server data | `demos/protocol-flow/` |

### 0.1 Architecture corrections made mid-flight

- **x402 ≠ BookingEscrow.** Earlier drafts of `04` and `05` treated x402 as the booking payment rail. Wrong — x402 is a stateless per-call micropayment handshake; booking-level held funds belong to a separate Seaport-style instrument. The two blocks are now drawn in `05_X402_PAYMENT_FLOW.md § Scope`. BookingEscrow is deferred to Phase C, gated on real merchant demand.
- **Custom registry vs canonical registry.** We deployed our own `IdentityRegistry` at `0xBdE5A55D…A29f` on Base Sepolia. For Base **mainnet** we will use the canonical shared address `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` so that community indexers (e.g. [8004scan.io](https://8004scan.io)) auto-index Concourse agents. This is the spirit of Principle 1 — use the shared layer, do not fork. Phase B-min adds a Deploy.s.sol switch.
- **Multi-tenant runtime deferred.** The shipped template is the self-hosted shape. The platform-hosted multi-tenant runtime described in `09_BUSINESS_MODEL.md` is real but not built; ~5 % of merchants will self-host long-term anyway.

### 0.2 Deviations from the planned sequence

- **Skipped** the Supabase auth_tokens table migration (prereq 1) — Phase A merchant-agent uses an in-memory token map, no Supabase dependency. The auth_tokens DDL still applies to the **frontend/indexer** repo, not the template.
- **Frontend refactor (§5) not done.** The existing `frontend/` still points at the deprecated 0G `MerchantRegistry`. Rewiring to Base + ERC-8004 IdentityRegistry is Phase C-1 (next sprint, this milestone).
- **Backend slimming (§6) not done.** Same reason — frontend work hasn't started, so the old FastAPI backend still serves the old frontend.

### 0.3 Gotchas captured (see also `merchant-agent-template/TROUBLESHOOTING.md`)

1. **pnpm 10 + native modules.** `pnpm install` skips install scripts by default. better-sqlite3's prebuild then never compiles, and the container crash-loops with `Could not locate the bindings file`. Root `package.json` must declare `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3"] }`.
2. **`vm.envUint` requires `0x` prefix.** Foundry's deploy script parses `DEPLOYER_PRIVATE_KEY` as a uint256; an unprefixed hex string reverts. `.env.example` must say so loudly.
3. **Fly HKG region deprecated.** Hong Kong is no longer offered for new volumes. Use `nrt` (Tokyo) or `sin` (Singapore).
4. **`??` does not catch empty strings.** `process.env.PAYOUT_ADDRESS ?? process.env.AGENT_OWNER_ADDRESS` keeps `""` from a partially-filled .env, silently breaking the agent-card hash invariant. Use `||` for env-string fallback chains. (Bug fixed in `setup.ts`.)
5. **Local-vs-live hash drift is silent.** Any divergence between local seed and deployed seed silently breaks the on-chain hash invariant. `sync-card` now fetches the live URL by default and only treats local as debug input.

### 0.4 Roadmap (post-A)

The shipped state lets any third party discover & call our first agent end-to-end on testnet. Real next abstractions:

| Tier | What | Trigger |
|---|---|---|
| **B-min** | mainnet canonical registry switch in `Deploy.s.sol` | want 8004scan visibility |
| **B-mcp** | MCP server route alongside REST skills on merchant-agent | want Claude Desktop / GPT to use the agent as a tool |
| **C-1** | Frontend rewire: `tourskill.paking.xyz/explorer` reads Base IdentityRegistry; `/merchant/sign` writes to it | want real merchants onboarding via web UI |
| **C-2** | x402 paid-skill MVP (separate from booking escrow) | want to test per-call micropayment plumbing |
| **C-3** | Independent `@concourse/cli` package on npm | want easy SDK adoption |
| **D** | BookingEscrow.sol + ReputationRegistry feedback flow | first real paying merchant asks for held-funds semantics |
| **E** | Multi-tenant platform-hosted runtime + SaaS billing | sustained inbound merchant interest |

---

## 1. What we keep, what we cut

| Asset | Decision |
|---|---|
| Legacy `MerchantRegistry.sol` on 0G testnet | **Stays deployed** (chain history is immutable) but **deprecated**. App stops reading from it. |
| 28 fake merchants registered on legacy contract | **Not migrated**. They were always fake. |
| Supabase `merchants` table data for those 28 | **Kept** as test fixtures, tagged `legacy_seed: true`. Not exposed publicly. |
| Frontend pages | **Refactored**, not rebuilt. Routes stay the same; backing data changes. |
| `auth_service` / `draft_service` (Supabase persistence) | **Kept**. The auth flow is good. |
| `skill_service.py` (12 mock handlers) | **Deleted**. |
| `/mcp/tools/execute` endpoint | **Deleted**. User-agents talk to merchant-agents directly. |
| 0G Compute integration in AgentDemo | **Kept**. Optional inference provider for any agent. |
| Qiniu integration in AgentDemo | **Kept**. Optional inference provider. |
| `tourskill.paking.xyz` domain + Vercel deploy | **Kept**. Same hosting story for the indexer + sign-ceremony pages. |
| `api.tourskill.paking.xyz` FastAPI backend | **Kept** (slimmer). Auth + drafts + indexer cache + multi-tenant runtime. |

---

## 2. Sequencing (dependencies)

```
                        ┌─── prereq.1 (must finish before any new work)
                        │     └ User runs Supabase DDL (auth_tokens + drafts)
                        │     └ User rotates exposed sk- key
                        │
                        ▼
         ┌──── Phase A.2: ERC-8004 contracts (1 week)
         │     │
         │     ├─ Build IdentityRegistry / ReputationRegistry / ValidationRegistry
         │     ├─ Foundry tests, 100% coverage
         │     ├─ Deploy to Base Sepolia
         │     └─ Verify on Basescan
         │
         ▼
         ┌──── Phase A.3: Merchant-agent template (2 weeks)
         │     │
         │     ├─ Repo init: monorepo with Hono + Drizzle + Zod
         │     ├─ Build core interfaces (MerchantStore, LLMClient)
         │     ├─ Build x402 middleware integration
         │     ├─ Default skill set (hotel) + auto-discovery
         │     ├─ Deploy first reference instance (one of the 28 brands,
         │     │   re-onboarded as a real agent — pick "Wuming Chu" since
         │     │   it has rich profile data already)
         │     └─ Reference instance registers on Base Sepolia ERC-8004
         │
         ▼
         ┌──── Phase A.4: Frontend rewire + backend slim-down (3 days)
         │     │
         │     ├─ Indexer cache: replay IdentityRegistry events into Supabase
         │     │   (NEW table: agents, scope: ERC-8004 mirrors)
         │     ├─ /v1/discover reads from new agents table, not merchants
         │     ├─ MerchantSign page uses ERC-8004 register flow
         │     ├─ AgentDemo's invoke_merchant_skill talks to merchant-agent
         │     │   directly (resolved from agent-card)
         │     ├─ Profile page admin: manages agent-card content for
         │     │   platform-hosted; or just shows on-chain identity for
         │     │   self-hosted
         │     └─ DELETE skill_service.py + /mcp/tools/execute
         │
         ▼
         ┌──── Phase B: BookingEscrow + x402 (2 weeks)
         │
         ▼
         ┌──── Phase C: Reputation flow (1 week)
```

Total wall time ~6-8 weeks of focused work.

---

## 3. Database migrations

Two new Supabase tables; existing `merchants` table stays for legacy
seed.

### 3.1 NEW: `agents` (indexer mirror of ERC-8004)

```sql
create table if not exists agents (
  agent_id           bigint        primary key,    -- on-chain ERC-8004 ID
  owner_address      text          not null,
  agent_card_uri     text          not null,
  agent_card_hash    text          not null,       -- 0x-prefixed hex sha256
  registered_at      timestamptz   not null,
  updated_at         timestamptz   not null,
  active             boolean       not null,

  -- Cached card content (refreshed every 5 min via fetch + verify hash)
  card_cached_at     timestamptz,
  card_name          text,
  card_description   text,
  card_url           text,                          -- agent's base URL
  card_skills        jsonb,                         -- skill list for fast filter
  card_extensions    jsonb,                         -- Concourse extensions
  card_fetch_error   text                           -- last fetch error if any
);

create index agents_owner_idx       on agents (owner_address);
create index agents_active_idx      on agents (active);
create index agents_url_idx         on agents (card_url);
create index agents_card_skills_idx on agents using gin (card_skills);
create index agents_card_ext_idx    on agents using gin (card_extensions);
```

The indexer service (lives in our backend) replays
`AgentRegistered` / `AgentUpdated` / `AgentActiveChanged` events from
genesis on cold start, then keeps live via JSON-RPC subscription.

### 3.2 NEW: `feedback_index` (off-chain reviews)

```sql
create table if not exists feedback_index (
  id                 uuid          primary key default gen_random_uuid(),
  agent_id           bigint        not null,
  reviewer_address   text          not null,
  booking_tx_hash    text          not null,
  settlement_tx_hash text          not null,
  rating             smallint      not null check (rating between 1 and 5),
  title              text,
  body               text          not null,
  language           text          not null default 'en',
  media              jsonb,
  signature          text          not null,
  created_at         timestamptz   not null,
  source             text          not null default 'auto',  -- auto | manual
  verified_at        timestamptz                              -- when our indexer verified sig + auth
);

create unique index feedback_index_uniq on feedback_index (agent_id, reviewer_address, booking_tx_hash);
create index feedback_index_agent_idx   on feedback_index (agent_id, created_at desc);
```

### 3.3 KEEP: `merchants` (legacy + test fixtures)

Add a column to flag the legacy nature; don't delete the rows (they're
useful test data).

```sql
alter table merchants add column if not exists legacy_seed boolean not null default false;
update merchants set legacy_seed = true;  -- mark all existing 28 as legacy
```

The `/v1/discover` endpoint **stops reading** from this table once the
indexer is live. No public consumer ever sees `legacy_seed = true` rows.

---

## 4. Communication / breaking changes

The legacy contract is on a public chain. Anyone watching it sees the
"frozen" state. We communicate the deprecation:

1. README.md gets a top banner: "Concourse is migrating to ERC-8004 on Base. Legacy contract on 0G is deprecated as of <date>. New address: <addr>."
2. The legacy contract's address in chainscan-galileo gets a contract description update (`MerchantRegistry — DEPRECATED — see Base Sepolia ERC-8004 IdentityRegistry at <addr>`).
3. Frontend pages that referenced the legacy contract address switch to the new ERC-8004 IdentityRegistry address.
4. The 28 fake merchants disappear from the public Explorer (because the indexer no longer reads them); the Explorer is empty until real merchants come on board.

**The empty-explorer period** is intentional. We're showing what's real,
not making it look full with mocks.

---

## 5. Frontend changes

| Page | Current | After migration |
|---|---|---|
| `/` (Home) | Uses 28 merchants count from Supabase | Reads count from `agents` table; will show low number; OK |
| `/explorer` | Paginated list of 28 mocks | Paginated list from `agents` table; will be empty / few; renders "Be one of the first merchants on Concourse" empty state |
| `/merchant/:id` | Reads from Supabase merchants | Reads from `agents` table by agent_id |
| `/merchant/sign/:draftId` | Calls legacy MerchantRegistry.register() | Calls IdentityRegistry.register(agentCardURI, agentCardHash) |
| `/profile` | Lists owner's merchants from Supabase | Lists owner's agents from agents table |
| `/register` | Form → create merchant + register on legacy contract | **Repurposed**: walkthrough to install merchant-agent template (self-host) OR sign up for managed hosting |
| `/demo` | invoke_merchant_skill → /mcp/tools/execute | invoke_merchant_skill → resolve agent-card → direct HTTPS to merchant |

The single biggest UX change is `/register`: it's no longer "fill a form
and you're on chain". It's "deploy an agent (or pay us to host one) and
THEN you're on chain". This is the right friction; we're not hiding it.

---

## 6. Backend changes

```
api.tourskill.paking.xyz/
├── /health                                    [keep]
├── /v1/auth/challenge      [keep — flow unchanged]
├── /v1/auth/verify         [keep]
├── /v1/drafts              [keep — used by sign-ceremony]
├── /v1/drafts/{id}         [keep]
├── /v1/drafts/{id}/complete [adapt — calls IdentityRegistry.register on chain]
├── /v1/discover            [adapt — reads from agents table, not merchants]
├── /v1/agents/{agentId}    [NEW — replaces /v1/merchants/{id}]
├── /v1/reputation/feedback [NEW — feedback indexer]
├── /v1/agents/{slug}/...   [NEW — multi-tenant agent runtime for platform-hosted]
├── /skills/{name}/SKILL.md [keep — protocol install URL]
└── DELETE: /mcp/*           [GONE — agents talk directly]
```

The deletion of `/mcp/*` is a **public API break**. We bump major version:

```
Old: api.tourskill.paking.xyz/mcp/tools/execute
New: there isn't one — call the merchant-agent directly
```

The user-agent's `invoke_merchant_skill` tool implementation changes; we
ship a new SKILL.md (versioned, e.g.,
`/skills/user-client/SKILL.md` → still the same URL but contents updated)
that documents the new flow. Existing agents installed against the old
SKILL.md will fail; they re-fetch on next install.

---

## 7. Concurrency: running both for a transition window?

Tempting question: should we keep the old skill_service running in
parallel for a few weeks so we don't break demos?

**No.** Per Principle 4 (clean slate): we delete in one move. Keeping
both is exactly the kind of incidental backward-compat we promised
ourselves we wouldn't carry. The transition pain is small (no real
merchants depending on the old API; no real users, just our own demo
chat).

What we ship: the **last version of the old code** is tagged in git
(`legacy/skill-service-v1`) for reference. After that the working tree
is the new world only.

---

## 8. Step-by-step execution checklist

### Pre-work
- [ ] User runs `backend/sql/002_auth_tokens_and_drafts.sql` in Supabase SQL editor
- [ ] User rotates the exposed Qiniu sk- key on their portal

### Phase A.2 — ERC-8004 contracts (1 week)
- [ ] Init `contracts/erc8004/` Foundry project
- [ ] Implement IdentityRegistry per [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md) §2
- [ ] Implement ReputationRegistry per §3
- [ ] Implement ValidationRegistry per §4
- [ ] Foundry tests: line coverage 100%
- [ ] Foundry property tests: ownership invariants, ID monotonicity
- [ ] Deploy to Base Sepolia via `forge create` with hardware wallet
- [ ] Verify on Basescan
- [ ] Record addresses in `docs/architecture/DEPLOY_ADDRESSES.md`

### Phase A.3 — Merchant-agent template (2 weeks)
- [ ] Init `merchant-agent-template/` monorepo (separate repo OR `apps/` subdir)
- [ ] Implement core interfaces per [04_MERCHANT_AGENT_TEMPLATE.md](./04_MERCHANT_AGENT_TEMPLATE.md) §3
- [ ] Implement Hono app + routing
- [ ] Implement SQLite + Postgres stores
- [ ] Build agent-card builder + hash + sync-card script
- [ ] Build default hotel skill set (5 skills minimum)
- [ ] Build auth (bearer + EIP-191) + x402 middleware integration
- [ ] Vitest unit tests (per skill, per store)
- [ ] Deploy reference instance for "Wuming Chu" to Vercel
- [ ] Register reference instance on Base Sepolia IdentityRegistry
- [ ] Smoke test: fetch agent-card, verify hash, call check_availability

### Phase A.4 — Frontend + backend rewire (3 days)
- [ ] Add `agents` + `feedback_index` Supabase tables
- [ ] Build indexer service (Python or Node — TBD; lean toward Node since chain libs are richer)
- [ ] Backfill: indexer reads all IdentityRegistry events from genesis
- [ ] Slim backend: delete `skill_service.py`, delete `/mcp/*` routes
- [ ] Adapt `/v1/discover` to read from `agents` table
- [ ] Adapt frontend pages per §5 above
- [ ] Update SKILL.md (consumer-side) for direct-call flow
- [ ] Update SKILL.md (merchant-side) for new register-via-agent-card flow
- [ ] Verify end-to-end: AgentDemo discovers Wuming Chu, calls real check_availability, gets real (mock-data) availability response

### Phase B — BookingEscrow + x402 (2 weeks)
- [ ] Implement BookingEscrow.sol per [05_X402_PAYMENT_FLOW.md](./05_X402_PAYMENT_FLOW.md)
- [ ] Foundry coverage 100%, property tests, fork tests
- [ ] Deploy to Base Sepolia
- [ ] Add x402 middleware to merchant-agent template
- [ ] Add real `create_booking` skill that returns 402
- [ ] Add settlement keeper service
- [ ] Mint test USDC, run end-to-end booking through to settlement

### Phase C — Reputation (1 week)
- [ ] Update BookingEscrow to call ReputationRegistry on release
- [ ] Add `/v1/reputation/feedback` endpoint to indexer
- [ ] Add `/reputation/feedback` route to merchant-agent
- [ ] Add review submission UI in user-agent
- [ ] Add Wilson aggregation to discover ranking

---

## 9. Rollback plan

If Phase A.3 launches and we discover a fundamental flaw in the
merchant-agent template (e.g., x402 middleware has a critical bug):

- The legacy backend is still on git tag `legacy/skill-service-v1`.
- Deploying it back to Vercel is a `vercel rollback` away (~30 seconds).
- The Base Sepolia contracts stay deployed (no rollback needed; they're
  immutable).
- We fix forward: patch the template, not revert the architecture.

We accept some user-facing flakiness during Phase A.3 → A.4 transition.
Better to fix forward than to maintain dual stacks.

---

## 10. The honesty check

After migration, we should be able to answer "yes" to all of:

- ☑ Every merchant in `/v1/discover` corresponds to a real agent at a
  fetchable URL?
- ☑ Every skill in agent-card maps to actual code in a merchant-agent?
- ☑ Calling `check_availability` actually reads a calendar?
- ☑ Calling `create_booking` lock real USDC in a real escrow?
- ☑ Reviews can only be left after settled bookings?
- ☑ Self-hosted merchants are byte-identical from the outside to platform-hosted?
- ☑ Concourse backend never holds USDC, never executes skills?

If any answer is "no", we haven't actually migrated — we've just shipped
a different demo. The honesty check is the merge criterion.
