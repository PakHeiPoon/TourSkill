# Concourse — A Decentralized A2A Registry for Intelligent Tourism Agents

> **Source document for NotebookLM.** Upload this file (plus the SKILL.md
> files and the existing `docs/tourskill-briefing.md`) as sources in a
> single NotebookLM notebook, then ask it to generate a briefing doc, a
> study guide, an FAQ, and a slide deck for a 20-minute academic
> presentation on "Intelligent Agents". The content below is deliberately
> organized into sections NotebookLM can index and cite.

---

## 1. Course framing — why this project matters for Intelligent Agents

**Thesis in one sentence.** If autonomous agents are going to act on
behalf of users across the economy, they need a protocol layer for
*discovery*, *identity*, and *authorized action* that is not owned by
any single platform. Concourse is a concrete instance of that protocol
layer, applied to a vertical (tourism) where the platform tax is
visible and the A2A use case is intuitive.

**Why tourism is a good testbed for agent research.**

- **Multi-modal service bundle.** A single trip query ("7 days in
  Hangzhou for two people") touches restaurants, hotels, attractions,
  shops, transport. Each category is a different agent interaction
  pattern (query / book / pay / confirm).
- **Rich natural-language queries.** Users describe travel needs in
  ambiguous prose, which makes the agent's *understand → plan →
  delegate* loop non-trivial — unlike structured domains (e.g. "buy
  1000 shares of AAPL") where planning is shallow.
- **Today's walled gardens are visible rent extractors.** OTAs (online
  travel agencies) are a textbook example of centralized platforms
  sitting between supply and demand. That makes the *disintermediation
  by agents* argument easy to motivate — something a flight-booking API
  demo can't do.

**Intelligent-agent research dimensions this project exercises.**

| Dimension | How Concourse exercises it |
|-----------|----------------------------|
| **Perception** | Agents parse user intent into structured discover queries |
| **Knowledge representation** | `SKILL.md` as machine-readable service contract; DID + on-chain hash as verifiable identity |
| **Decision-making** | Rank merchants by match quality, personalization, reputation |
| **Action** | Invoke merchant skills via REST; sign transactions via wallet |
| **Learning** | (Future) reputation feedback loop based on invocation outcomes |
| **Multi-agent coordination** | A2A — consumer agent ↔ merchant agent negotiation |
| **Trust & verification** | On-chain anchor prevents impersonation; bearer tokens prevent replay |

## 2. The problem (one paragraph for the "motivation" slide)

Today's travel bookings flow through a small number of centralized
OTAs that extract rents through ranking algorithms, opaque coupon
mechanics, and API gatekeeping. A hotel listed at ¥800 is shown to the
user at ¥1,200 with a "¥200 coupon" — the merchant nets ¥900, the
user pays ¥1,000, and the platform takes ¥100 for being the middleman.
AI agents don't fix this by default — they inherit the same API-key-
gated closed ecosystem. The invariant to break: **an agent representing
a user and an agent representing a merchant should be able to find and
transact with each other without asking a third party for permission.**

## 3. System architecture — three layers

```
┌────────────────────────────────────────────────────────────┐
│  Layer 3: Agent-Facing Protocol                            │
│    • SKILL.md (install URL for any AI agent)               │
│    • Consumer-side verbs:  discover / personalize / invoke │
│    • Merchant-side verbs:  onboard / update / pause / …    │
└────────────────────────────────────────────────────────────┘
              ▲                               ▲
              │ HTTPS (FastAPI)               │ HTTPS (FastAPI)
              ▼                               ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 2: Off-Chain Mutable Profile (Supabase Postgres)    │
│    • Rich JSON profile (hours, menu, tags, i18n)           │
│    • SHA-256 profile_hash committed on-chain               │
│    • Owner mutates via PATCH → re-hashes → (future) re-anchor │
└────────────────────────────────────────────────────────────┘
                              ▲
                              │ keccak256(profile_hash)
                              ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 1: On-Chain Identity Anchor (0G Galileo, chainId 16602) │
│    • MerchantRegistry.sol                                  │
│    • struct: owner, did, type, profileHash, URI, endpoint  │
│    • Event: MerchantRegistered(did, owner, type)           │
│    • Address: 0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543   │
└────────────────────────────────────────────────────────────┘
```

**Why three layers, not one.** A naive design would put everything on
chain. Tourism profiles change daily (hours, menu, seasonal prices) —
on-chain mutation is too expensive and too slow. The separation lets
us:

- keep identity **verifiable and immutable** (on-chain anchor)
- keep the profile **mutable and cheap** (off-chain PATCH)
- keep the agent interface **portable** (SKILL.md is a single URL, not
  an SDK)

## 4. The SKILL.md protocol (the agent-facing contract)

Two specs served over HTTPS at:

- `https://api.tourskill.paking.xyz/skills/user-client/SKILL.md`
- `https://api.tourskill.paking.xyz/skills/merchant-client/SKILL.md`

**What they are.** Plain-text Markdown documents that any AI agent
(Claude, Cursor, ChatGPT with web-fetch, a bespoke LangChain agent) can
install at a single URL. The document specifies:

- the verbs the agent supports (discover / invoke / update / pause)
- the exact HTTP contracts for each verb
- the wallet-binding and auth protocol
- hard rules the agent must never violate ("never sign on behalf of the
  user without showing them the draft")
- bilingual prompts (EN / 中) the agent should render to the user

**Why Markdown, not OpenAPI/JSON.** Because LLM-based agents read
Markdown natively. OpenAPI was designed for codegen — SKILL.md is
designed for in-context-learning by an LLM. We get the same function-
calling rigor, plus human-friendly onboarding.

**Installability.** An end user types *"install Concourse from
https://api.tourskill.paking.xyz/skills/user-client/SKILL.md"* into
their chat agent. The agent reads the URL, loads the contract, and
starts answering travel queries by invoking the registry.

## 5. Trust model and security architecture

This is where the project has most to say about **intelligent-agent
security research**.

### 5.1 The "agent shouldn't hold private keys" constraint

A merchant agent that stores the owner's wallet private key is a
non-starter: wallet compromise leaks funds, and no real merchant would
hand their seed phrase to an AI. But the agent still needs to *act* on
the wallet's behalf (pause listings, update hours).

### 5.2 Our answer: Sign Once, Govern Forever (with a real cryptographic handoff)

Onboarding asks the owner to produce **exactly two signatures, once**:

1. An on-chain transaction (`MerchantRegistry.register`) — permanent
   identity anchor. Costs gas.
2. A free EIP-191 `personal_sign` on a server-issued challenge —
   mints an opaque 30-day bearer token.

After that the agent holds only the bearer token, not the private key.
Every subsequent mutation (update / pause / resume) uses
`Authorization: Bearer ${MERCHANT_TOKEN}`.

### 5.3 Why naive "use the wallet address as the token" was a real vulnerability

Earlier in this project we used `X-Wallet-Address: 0x…` as the PATCH
auth. Wallet addresses are **public on-chain data** — the explorer
publishes them. Anyone reading the explorer could forge the header and
modify anyone else's merchant. This was reproduced against our own
production: a single `curl` with a known wallet changed another
merchant's email + status.

The fix is a textbook challenge-response:

```
POST /v1/auth/challenge  { wallet }      →  { nonce, message, TTL=5min }
Owner signs message with MetaMask (EIP-191, no gas)
POST /v1/auth/verify  { wallet, nonce, signature }
  server does ecrecover(message, sig) and checks it equals the claimed wallet
  → mints opaque 32-byte token, stores SHA-256(token) only, TTL=30 days
PATCH /v1/merchants/{id}  Authorization: Bearer <token>
  server resolves token → wallet → owner check → 200/401/403
```

**Attacker defeat matrix (verified in production):**

| Attack | Pre-fix | Post-fix |
|--------|---------|----------|
| Forge `X-Wallet-Address: <victim>` | 200 OK, changes applied | 401 Not authenticated |
| Sign another wallet's nonce | n/a (no crypto) | 403 Signature does not recover |
| Replay a consumed nonce | n/a | 400 Invalid or expired |
| Random bearer token | n/a | 401 |
| Attacker's own valid token on victim's merchant | n/a | 403 Wallet does not own |

This is the single most important security takeaway from the project,
and a useful case study for the course: **public identifiers are not
auth secrets.**

## 6. Onboarding ceremony — the agent-to-browser handoff pattern

Key research question: *how does an agent that cannot hold keys
bootstrap the first credential from an owner who never met it?*

Concourse's answer is a draft-URL handoff pattern, analogous to GitHub
Personal Access Tokens or Claude Code's OAuth flow:

```
 1. Merchant agent (no wallet yet)
        │ POST /v1/drafts { payload }
        ▼
    Backend stores draft, returns { draft_id, sign_url }
        │
 2. Agent to human owner:
        "Open this URL in your browser and sign: <sign_url>"
        │
 3. Owner opens URL → sees profile preview → connects MetaMask
        │ (1) contract.register()       ← on-chain, costs gas
        │ (2) personal_sign(challenge)  ← off-chain, mints token
        │ POST /v1/drafts/{id}/complete { merchant, wallet, tx, token }
        ▼
 4. Agent polls:
        GET /v1/drafts/{id} → { status: "signed", auth_token, ... }
        └─ persists auth_token locally → can now PATCH
```

This is a generalizable design: any future agent-facing service that
needs wallet-bound actions can copy this pattern. It cleanly separates
the *private-key-holding surface* (browser with MetaMask) from the
*action-taking surface* (agent with bearer token).

## 7. Current state — what works right now

- **Deployed on prod:** `tourskill.paking.xyz` (frontend) and
  `api.tourskill.paking.xyz` (backend), both on Vercel with Fluid
  Compute.
- **On-chain:** `MerchantRegistry.sol` deployed on 0G Galileo
  testnet (chainId 16602) at
  `0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543`.
- **Seed corpus:** 28 merchants (hotels / restaurants / attractions /
  shops) live on both chain and off-chain, concentrated in Hangzhou
  with a long tail across Shanghai / Suzhou / Beijing.
- **Two SKILL.md specs:** consumer-side (discover / invoke) and
  merchant-side (onboard / update / pause). Each is one URL any AI
  agent can install.
- **Frontend pages:** Home (with install card + AgentLoopDemo),
  Explorer (browse merchants with on-chain badge popover), Merchant
  Detail (full profile + chainscan deep link), Register Portal
  (manual onboard), Profile (owner's listings + install-to-agent
  card), Merchant Sign (the agent-initiated handoff page).
- **Auth:** Challenge-response EIP-191 → 30-day bearer token, verified
  against production with attack reproductions.
- **Bilingual:** Every page is EN/中 switchable via a zero-dependency
  i18n runtime (`~300 keys`).
- **E2E smoke:** A Python script runs 11 assertions against prod,
  including three attacker-model negative tests, each green.

## 8. Future roadmap — the research agenda

Grouped by horizon.

### 8.1 Next — reputation & payments
- **Reputation system.** Every skill invocation leaves an on-chain
  review (signed by the consumer wallet). Consumer agents weight
  discovery by reputation score. Research question: *how do we
  Sybil-resist reviews when review issuance is cheap?* Options: proof
  of booking via payment receipt; bonded reviews; zk-attested
  receipts from centralized aggregators.
- **x402 payments.** HTTP 402 Payment Required + micropayment rails
  so merchant skills can charge per call. Unlocks the business
  model: merchants publish paid skills; consumer agents pay on
  behalf of users; merchants earn without an OTA in the middle.

### 8.2 Soon — protocol interoperability
- **MCP (Model Context Protocol) bridge.** Expose the Concourse
  registry as an MCP server so any MCP-compliant agent (Claude
  Desktop, IDE agents, etc.) can list skills and call them without
  reading SKILL.md separately.
- **SIWE (Sign-In With Ethereum).** Replace our custom challenge
  message with the EIP-4361 canonical format so any wallet that
  supports SIWE plugs in without custom prompts.
- **Persistent draft store.** Current in-memory draft dict doesn't
  survive across Vercel Fluid Compute instances → move to Supabase
  so multi-region traffic is safe.

### 8.3 Later — governance & research directions
- **Multi-tenant / DAO governance.** Let city tourism boards run
  *sub-registries* on top of the global one, with their own
  moderation and promotion rules — not controlled by us.
- **Agent negotiation.** Consumer agent ↔ merchant agent bargaining
  loops (price, cancellation, bundling). Research angle:
  *game-theoretic equilibria when both sides are LLM agents with
  bounded honesty.*
- **Verifiable profile updates.** Re-anchor the profile_hash
  on-chain after each PATCH so the off-chain row's integrity is
  always provable. Trade-off: gas cost vs. freshness guarantees.

## 9. Key technical innovations to highlight

For a course audience, these are the "why this is interesting"
points:

1. **SKILL.md as an installable agent contract** — a single URL that
   turns any LLM into a domain-specific user agent. Language-model-
   native, platform-agnostic.
2. **Identity / state bifurcation** — on-chain immutable anchor +
   off-chain mutable profile linked by a commit hash. The architecture
   is reusable for any A2A registry (beyond tourism).
3. **Sign-once handoff** — the draft + challenge-response pattern
   lets an agent bootstrap wallet-bound auth without ever touching
   the private key. It generalizes to any agent that needs to act
   on behalf of a human.
4. **Public-identifier-is-not-secret** — the captured-and-fixed
   `X-Wallet-Address` vulnerability is a reusable case study for
   any course unit on agent authorization.
5. **Bilingual + LLM-readable** profiles (name, description stored as
   `{en, zh}`) — agents serve the user in the user's language without
   a separate translation step.

## 10. Related work & citations

- **Bitcoin white paper** (Nakamoto, 2008) — origin of "peer-to-peer
  with no trusted third party"; inspiration for Concourse's founding
  thesis.
- **ERC-8004** — proposed Ethereum standard for merchant / agent
  identity; Concourse's `MerchantIdentity` struct is directly inspired
  by it.
- **Google A2A protocol** (2024) — proposal for agent-to-agent
  interoperability; our SKILL.md is a concrete dialect.
- **Model Context Protocol (MCP)** (Anthropic, 2024) — a bridge on our
  roadmap; solves the *tool-discovery* problem for IDE-resident
  agents.
- **SIWE / EIP-4361** — canonical off-chain auth message format, which
  we plan to adopt.
- **0G Network** — the modular AI-native chain we deploy to; relevant
  because it provides decentralized storage + compute in addition to
  EVM, supporting future roadmap items (on-chain inference receipts).

## 11. Live demo resources

- **Home:** https://tourskill.paking.xyz
- **Contract:** https://chainscan-galileo.0g.ai/address/0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543
- **User SKILL.md:** https://api.tourskill.paking.xyz/skills/user-client/SKILL.md
- **Merchant SKILL.md:** https://api.tourskill.paking.xyz/skills/merchant-client/SKILL.md
- **Repo:** https://github.com/PakHeiPoon/Concourse

## 12. Suggested presentation arc

A ~20-minute slot for an Intelligent-Agent course should cover, in
order:

1. Why agents need an open registry (2 min)
2. What Concourse is and what it does (2 min)
3. Architecture — three layers (3 min)
4. Demo — Home page + Explorer + AgentDemo chat + MerchantSign (4 min)
5. Deep dive — SKILL.md protocol (2 min)
6. Security case study — the `X-Wallet-Address` hole and how we
   closed it with challenge-response (3 min)
7. Roadmap + research questions (2 min)
8. Q&A (2 min)

Leave the security case study as the "intellectual peak" of the talk —
it's where the course's security / verification / trust themes land
most concretely.
