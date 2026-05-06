# Target Architecture

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md). When this doc and the
> principles disagree, the principles win.

This is the system as it should be once Phase A + B are done. It is **not**
the current system. It is what every decision in the next 6–8 weeks aims at.

---

## 1. The picture

```
                ┌─────────────────────────────────────────────────┐
                │                  USER (human)                   │
                └────────────────────────┬────────────────────────┘
                                         │ natural language
                                         ▼
                ┌─────────────────────────────────────────────────┐
                │              USER AGENT (LLM brain)             │
                │  Installed once via SKILL.md @ tourskill domain │
                │  Runs anywhere: Claude Code, Cursor, ChatGPT,   │
                │  custom — we don't host it                      │
                └────┬───────────────────────────────────┬────────┘
                     │                                   │
                     │ 1. Discover                       │ 4. Pay (x402)
                     ▼                                   │
        ┌────────────────────────────┐                   │
        │   ERC-8004 Registries      │                   │
        │   (Base Sepolia → mainnet) │                   │
        │                            │                   │
        │   IdentityRegistry         │                   │
        │   ReputationRegistry       │                   │
        │   ValidationRegistry       │                   │
        │                            │                   │
        │   Returns: agent address   │                   │
        │   + agent_card_uri         │                   │
        └─────────────┬──────────────┘                   │
                      │ 2. Fetch agent-card.json         │
                      ▼                                   │
        ┌────────────────────────────┐                   │
        │   agent-card.json (HTTPS)  │                   │
        │   Served by merchant-agent │                   │
        │   Contains: skills, auth,  │                   │
        │   payment hints, version   │                   │
        └─────────────┬──────────────┘                   │
                      │ 3. Direct HTTP call              │
                      ▼                                   │
                ┌──────────────────────────────────────┐ │
                │       MERCHANT AGENT (LLM brain)     │ │
                │                                       │ │
                │  ┌──────────────────────────────────┐│ │
                │  │ Self-hosted (商家自己部 Vercel) ││ │
                │  │ OR Platform-hosted (我们多租户) ││ │
                │  │ External surface IDENTICAL       ││ │
                │  └──────────────────────────────────┘│ │
                │                                       │ │
                │  Reads its own SKILL.md → tools       │ │
                │  Owns: inventory, calendar, menu      │ │
                │  Returns 402 if skill costs money ────┘ │
                │                                          │
                │  After payment: returns real result      │
                └──────────────────────────────────────────┘

                                                          │
                                                          ▼ on payment
                                              ┌───────────────────────┐
                                              │  BookingEscrow.sol    │
                                              │  (Base Sepolia)       │
                                              │  USDC time-lock       │
                                              │  + dispute window     │
                                              └───────────────────────┘
                                                          │
                                                          ▼ on settlement
                                              ┌───────────────────────┐
                                              │  ReputationRegistry   │
                                              │  (Base, ERC-8004)     │
                                              │  Sybil-resistant via  │
                                              │  proof-of-payment     │
                                              └───────────────────────┘
```

Side channels (deliberately not in the critical path):

```
┌─────────────────────────────────────────┐
│  TOURSKILL BACKEND (FastAPI on Vercel)  │
│                                         │
│  • Auth (challenge → bearer token)      │
│  • Draft URL minting (sign ceremony)    │
│  • Indexer cache over ERC-8004 events   │
│  • Multi-tenant agent runtime           │
│    (only for platform-hosted merchants) │
│                                         │
│  Does NOT execute merchant skills.      │
│  Does NOT custody any wallet.           │
│  Stateless modulo Supabase cache.       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  0G COMPUTE NETWORK                     │
│  Optional inference provider for any    │
│  agent (user-side or merchant-side)     │
│  Wallet-paid. Orthogonal to identity.   │
└─────────────────────────────────────────┘
```

---

## 2. Component-by-component contract

### 2.1 ERC-8004 Registries (Base Sepolia → mainnet)

**Source of truth for "this agent exists and is owned by this address".**

- **IdentityRegistry**: maps `agent_id (uint256) → { address owner, string agentCardURI }`. Anyone can `register(agentCardURI)`; only owner can `update(...)` or `setAgentCardURI(...)`.
- **ReputationRegistry**: stateless feedback authorization. Owner of agent A pre-authorizes wallet B to leave feedback (typically by reference to a settled escrow tx); off-chain feedback indexed by clients.
- **ValidationRegistry**: stateless work-validation authorization. Out of scope for v1, scaffolded for future.

**Storage cost discipline.** Only invariants live on-chain. Everything else lives in agent-card.json (off-chain, hash-committed). Updates to agent-card require a new SHA-256 commit on-chain — small writes, infrequent.

### 2.2 agent-card.json (off-chain, served by every merchant-agent)

The bridge document. Format follows the A2A standard with TourSkill-specific extensions in the `extensions` field. Every merchant-agent MUST serve this at a stable canonical URL (typically `https://<merchant-host>/.well-known/agent-card.json`).

Detailed schema → [03_AGENT_CARD_SPEC.md](./03_AGENT_CARD_SPEC.md).

### 2.3 Merchant-agent runtime

**Reference implementation in TypeScript / Hono.** One repo, one Dockerfile, deployable to Vercel / Cloudflare Workers / Render / Railway / Fly. Stack:

- **Framework**: Hono (works on Vercel Edge Runtime, Cloudflare Workers, Bun, Node)
- **Storage**: SQLite (local dev) → Postgres (production); abstracted behind a `MerchantStore` interface so a merchant could swap in their own DB
- **LLM client**: provider-agnostic; reads `LLM_PROVIDER` env var; defaults to OpenAI-compatible endpoints (works with 0G Compute, Qiniu, OpenAI, Anthropic-via-proxy)
- **x402 middleware**: official `@coinbase/x402-hono` (or wrap `x402-fetch`)
- **Auth**: incoming requests verified against either bearer-token-from-tourskill OR direct EIP-191 signature (when called by another agent in a P2P scenario)

Detailed spec → [04_MERCHANT_AGENT_TEMPLATE.md](./04_MERCHANT_AGENT_TEMPLATE.md).

### 2.4 BookingEscrow.sol (Base Sepolia)

Time-locked USDC escrow with dispute window. Triggered by user payments via x402; released to merchant after the booking's stated end-date + 24h dispute window unless the user files dispute.

Detailed spec → [05_X402_PAYMENT_FLOW.md](./05_X402_PAYMENT_FLOW.md).

### 2.5 TourSkill backend (FastAPI on Vercel)

After Phase A, the backend's job shrinks dramatically. It keeps:

- **Auth endpoints**: `/v1/auth/challenge`, `/v1/auth/verify` — unchanged from current
- **Draft endpoints**: `/v1/drafts/*` — for the sign-ceremony URL hand-off
- **Indexer cache**: read-only API over chain events (`/v1/discover` — same shape, but populated from chain reads instead of fabricated rows)
- **Managed runtime** (new, optional): for platform-hosted merchants, we run their merchant-agent process; URLs follow `https://api.tourskill.paking.xyz/agents/{merchant_slug}/...`

What it loses:
- ❌ `skill_service.py` and all 12 mock handlers — **deleted**
- ❌ `/mcp/tools/execute` — **deleted** (the user-agent calls merchant-agent directly now)
- ❌ Any `merchant_type`-specific business logic in the gateway

### 2.6 Frontend (Vite SPA)

What changes:

- **Sign page** (`/merchant/sign/:draftId`): adapts to ERC-8004's `IdentityRegistry.register(agentCardURI)` instead of the legacy `MerchantRegistry.register(...)`.
- **Profile page**: instead of editing fields directly, edits the merchant's `agent-card.json` (either through our managed UI for platform-hosted merchants, or via a "fetch + diff" flow for self-hosted).
- **Explorer**: reads from indexer cache, but the cache backs to chain reads.
- **Agent demo**: `invoke_merchant_skill` tool changes its implementation — no longer hits `/mcp/tools/execute` on our backend; instead, it does a registry lookup, fetches agent-card, makes a direct HTTPS call to the merchant-agent's URL.

What stays:

- All routing (BrowserRouter), all i18n, all wallet UX, all auth flow.

---

## 3. Network call flow — full path of one booking

For a hotel booking on a future "real" merchant agent:

```
Step 1 — User: "Book me a king room at Wuming Chu Huangshan Sept 1-3."

Step 2 — User-agent calls our discover endpoint
         GET /v1/discover?type=hotel&keyword=huangshan
         → backend reads from indexer cache (which mirrors IdentityRegistry events)
         → returns list incl. agent_id + agent_card_uri for the matching merchant

Step 3 — User-agent fetches agent-card directly
         GET https://wumingchu.example.com/.well-known/agent-card.json
         → returns: skills[], pricing hints, payout chain (Base), auth method

Step 4 — User-agent calls check_availability skill on merchant-agent directly
         POST https://wumingchu.example.com/skills/check_availability
         body: { check_in: "2026-09-01", check_out: "2026-09-03", room_type: "king" }
         → merchant-agent reads its own calendar, returns { available: true, nightly: 1820 USDC }

Step 5 — User-agent calls create_booking skill
         POST https://wumingchu.example.com/skills/create_booking
         body: { check_in, check_out, room_type, guest_email }
         → merchant-agent returns 402 Payment Required with body:
           { quote: 3640 USDC, escrow: "0xABC...", booking_intent_id: "..." }

Step 6 — User-agent surfaces the payment to the human ("MetaMask popup")
         Human signs USDC.transfer(escrow, 3640) on Base Sepolia
         The x402 middleware on merchant-agent confirms tx by checking escrow contract

Step 7 — Merchant-agent retries the same call automatically (per x402 spec)
         Now the payment proof is in the request → merchant-agent returns:
         { booking_id, confirmation_code, calendar_locked: true }

Step 8 — Day after check-out + 24h dispute window passes
         Anyone (including the merchant) calls escrow.release(booking_id)
         USDC moves from escrow → merchant's payout address
         ReputationRegistry now allows the user to leave feedback for this booking
```

Notice what's NOT in this flow:
- TourSkill backend never executes a skill — it indexes and discovers only.
- TourSkill backend never holds USDC — escrow is between user and merchant.
- The user-agent talks to the merchant-agent **directly** over HTTPS.

---

## 4. Trust boundaries

| Actor | Trusted with | Not trusted with |
|-------|--------------|-------------------|
| TourSkill backend | indexing chain events; minting drafts; auth tokens | wallet keys; USDC custody; skill execution |
| User-agent | reading user intent; planning tool calls; surfacing payments to human | signing without confirmation; storing wallet keys |
| Merchant-agent | own inventory, own pricing rules, own LLM | other merchants' data |
| Platform-hosted runtime | hosting the merchant-agent process | the merchant's wallet keys (the merchant signs registration themselves) |
| ERC-8004 contracts | identity ownership invariant; reputation feedback authorization | execution; payment custody |
| BookingEscrow | USDC custody during dispute window | identity attestations |

The recurring rule: **no single component can both authenticate the merchant and hold their funds.** The key custody lives with the merchant, always.

---

## 5. What this architecture enables (and what it costs)

**Enables:**

- A user-agent built by a third party (Cursor, Claude, custom Python script) can install our SKILL.md, discover merchants from our registry on Base, and transact directly — without our backend in the middle, without us knowing it happened.
- A merchant who outgrows platform-hosted can `git pull` the template, deploy to their own infra, change one DNS record, and the rest of the network sees no difference.
- The full booking lifecycle (discover → quote → pay → settle → review) is verifiable on-chain by anyone — no "trust us, the booking happened" required.

**Costs:**

- More moving parts. Two chains, three contracts, agent-card.json, a separate merchant-agent runtime, x402 middleware. Not as simple to demo as "one backend with mocks".
- We give up control over execution. A buggy merchant-agent will be the merchant's problem — we can flag it via our indexer ("this merchant's agent is failing 80% of skill calls"), but we can't fix it for them.
- Merchant onboarding is harder than "fill a form on our website" — it's "deploy an agent OR sign up for managed hosting". This is mitigated by the managed-hosting tier.

We accept these costs because the alternative — a centralized OTA with extra steps — does not match the manifesto.

---

## 6. Migration sequencing (high level)

This doc only sketches order; details in [07_MIGRATION_PLAN.md](./07_MIGRATION_PLAN.md).

```
Phase A.2 (1 week)  → ERC-8004 contracts written + deployed to Base Sepolia
Phase A.3 (2 weeks) → Reference merchant-agent template + deploy 1 reference instance
Phase A.4 (3 days)  → Frontend rewires to talk to ERC-8004 + delete mock skill layer
Phase B   (2 weeks) → BookingEscrow + x402 wired up end-to-end
Phase C   (1 week)  → Reputation registry usage from settled bookings
                       
total: ~6 weeks of focused work, with a "real first booking" closing Phase B.
```
