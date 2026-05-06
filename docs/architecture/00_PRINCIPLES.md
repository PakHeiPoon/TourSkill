# TourSkill Architecture Principles

> *"做未来的产品，不贪图当下方便。"* — north star, 2026-04-29

This document is the canonical reference every other architecture doc points
back to. When two docs disagree, the principles win. When a future PR feels
"convenient but wrong", check it against this list first.

---

## Principle 1 — Standards-first, no forks

We adopt published specifications **as-is** and integrate against them.

- **ERC-8004** for on-chain agent identity / reputation / validation registries.
- **A2A Agent Card** for the off-chain JSON descriptor that bridges chain identity to a callable agent endpoint.
- **x402** for HTTP-native payment handshakes (Coinbase, Base-native) — used **only as Coinbase published it**: stateless per-call micropayments via EIP-3009 `transferWithAuthorization`. We do not extend its wire format with custom escrow or hold/release semantics.
- **EIP-712** for typed-data signatures when (and if) we build BookingEscrow — Seaport-style, **not** layered on x402.
- **EIP-191** for off-chain signature verification (already in production for our auth).
- **OpenAI tool-call wire format** for the agent ↔ skill protocol (every major LLM provider supports it).

We do **not** fork these specs to "improve" them. If we hit a real limitation,
we propose the change upstream or use the standard's own extension hooks
(e.g. `extensions` field in agent-card.json).

**Corollary — don't conflate handshake protocols with settlement
instruments.** An earlier draft of `05_X402_PAYMENT_FLOW.md` packaged
x402 as a payment rail for booking-level escrow. That violated this
principle in spirit (non-standard usage of a standard handshake) even
though we hadn't formally forked. Rule: **one wire format, one purpose.**
x402 is per-call micropayment. Hold-and-release is its own thing,
designed independently.

**Why this matters.** A registry whose entries can be discovered and consumed
by clients we never wrote — by Coinbase wallets, by erc8004.org indexers, by
any future agent — is what makes us a *protocol*, not a *platform*. The
moment we fork, we become another walled garden.

---

## Principle 2 — Decouple identity from state

Two layers, two storage tiers, one cryptographic bridge.

```
┌────────────────────────────────────────────────┐
│  IDENTITY (immutable, infrequent)              │
│  → On-chain (Base Sepolia / mainnet)           │
│  → ERC-8004 registries                         │
│  → Holds: agent address, agent_card_uri,       │
│    profile_hash, registration timestamp        │
└────────────────────┬───────────────────────────┘
                     │  SHA-256(profile.json) committed on-chain
                     ▼
┌────────────────────────────────────────────────┐
│  STATE (mutable, high-frequency)               │
│  → Off-chain (each merchant-agent's own DB)    │
│  → agent-card.json + skills + inventory        │
│  → Anything that changes daily lives here      │
└────────────────────────────────────────────────┘
```

**The off-chain Supabase database we run is a cache + indexer, not a source
of truth.** If our Supabase dies tomorrow, every merchant-agent still owns
their full state, and the on-chain hash still proves their identity. Anyone
can rebuild our indexer by replaying chain events.

**Implication:** any TourSkill backend feature that depends on our central
DB to function (rather than just for performance) is a smell.

---

## Principle 3 — No mock execution

Every skill the registry advertises must trace to a real merchant-agent
endpoint that owns its own data.

Our current `skill_service.py` (with 12 fabricating handlers) is on the
chopping block. After Phase A:

- The TourSkill backend **does not execute merchant skills**.
- It **discovers** (registry indexer), **authenticates** (challenge-response),
  and **routes** (turn an `agentURI` into an HTTP call). That's the whole job.
- A skill call goes from user-agent → directly to merchant-agent — without
  passing through our backend's business logic. Our backend may sit in the
  network path for managed-hosted merchants, but it forwards bytes; it does
  not synthesize them.

**Why this matters.** "Centralized backend executes mocks on behalf of fake
merchants" is exactly what we accuse OTAs of. The instant we keep that
shortcut, we are them with extra steps.

---

## Principle 4 — Clean slate over backward-compat

When the existing shape is wrong, we delete it. We do not preserve mistakes
out of inertia.

Concrete application (2026-04-29):

- The 28 seeded merchants on the legacy `MerchantRegistry.sol` (0G testnet)
  are fake. They will **not** be migrated to ERC-8004. We re-register a
  smaller set of *real* reference agents on Base Sepolia from scratch.
- The legacy contract address stays on chain — chain history is immutable —
  but our app stops reading from it. We mark it deprecated in docs.
- Supabase rows for the 28 merchants stay (useful as deterministic test
  fixtures during development of the new merchant-agent template), tagged
  with a `legacy_seed: true` flag. They are **never** exposed to public
  discovery once the new system is live.

**Why this matters.** "Migration scripts to bring the old data into the new
shape" sound responsible but cost more engineering than starting clean —
especially when the old data was wrong by construction. We get to design for
the future without the gravity of the past.

---

## Principle 5 — One protocol, two chains

Identity and payment have different access patterns. Forcing them onto one
chain is a tax for no benefit.

| Layer | Chain | Why |
|-------|-------|-----|
| Identity (ERC-8004) | **Base Sepolia → Base mainnet** | erc8004 indexers/wallets/tools cluster on Base; Coinbase pushed the standard there; same chain as x402 |
| Payment (x402 + escrow) | **Base Sepolia → Base mainnet** | Native USDC, mature Smart Wallet, x402 SDKs are TS-native |
| AI inference billing | **0G Network** | We keep the existing `use0gCompute` path; 0G is purpose-built for this; orthogonal to merchant identity |
| AI storage (future) | **0G Storage** | For agent training data, model weights, large profile blobs |

Note: identity + payment landing on the same chain (Base) is a happy
accident for *this* moment in the ecosystem. The principle is not "always
two chains" — it's "right tool, right place, accept the operational cost
when it's worth it."

**Implication.** TourSkill doesn't try to push everything onto 0G to keep
the "0G project" story tidy. Our 0G use case is **inference + storage**,
which is what 0G is actually best at. Identity and payment go where their
ecosystems live.

---

## Principle 6 — Two-track hosting, one external surface

Merchants come in two flavors:

- **Self-hosted** — fork the `merchant-agent-template` repo, run it on their
  own infra, control their own keys, pay their own server bill. Maximum
  sovereignty, maximum technical bar.
- **Platform-hosted** — TourSkill runs the agent for them, multi-tenant,
  paid as a SaaS subscription. Maximum convenience, requires trust in us.

**The hard rule: from the outside, both look identical.**

- Both serve agent-card.json at the same canonical path.
- Both register on ERC-8004 with their own wallet (we never custody keys).
- Both expose identical skill endpoints with identical wire format.
- Both authenticate user-agents with identical challenge-response.

This is what keeps us honest: a self-hosted merchant should never feel
"second-class" relative to a platform-hosted one. If a feature only works on
the platform side, it belongs in upstream Hono/middleware, not in our
proprietary fork.

---

## Principle 7 — User confirmation gates irreversibility

No agent — neither user-side nor merchant-side — completes an irreversible
action without explicit human confirmation.

- **Bookings, payments, listing changes, profile edits** all require the
  affected human to see the diff and click "yes" before signing.
- For agents acting on behalf of an absent owner (the "Sign Once, Govern
  Forever" pattern), we cap the blast radius via short-lived bearer tokens
  (30-day TTL today; revocable; future SIWE-bound).
- Hallucination is treated as a **first-class threat model**, not a bug.

**Implication.** Anywhere the agent could autonomously "just do it"
(transfer funds, sign a contract, post a public review), the architecture
forces a human-readable confirmation step in the path.

---

## Principle 8 — Sustainability over speed

We are not building for next week's demo. We are building for next year's
production. When a shortcut would create technical debt that compounds, we
take the slower path.

Concrete tells:
- Every external API we depend on (chain RPC, LLM provider, Supabase, …) is
  swappable by config; no provider is hard-coded into business logic.
- Every state mutation is reproducible from chain events + agent-card
  snapshots.
- Every feature has a "what breaks if this provider disappears tomorrow"
  answer. If the answer is "everything", we redesign.
- Every migration is one-way forward. We do not ship "version flags" that
  preserve old behavior — when the new shape lands, the old one is deleted.

---

## Anti-principles (what we explicitly are NOT)

- **Not an OTA.** We don't take a cut of bookings. Merchants charge what they
  charge, keep what they earn, minus the optional managed-hosting fee.
- **Not a wallet.** We never custody user keys, merchant keys, or USDC.
- **Not a SaaS for inventory management.** The merchant-agent template
  ships with a default inventory module, but inventory is each merchant's
  problem, not our database.
- **Not a closed ecosystem.** Any agent client (Claude, ChatGPT, Cursor,
  custom) can install our SKILL.md and reach the registry without asking
  us for an API key.

---

## How to use this document

When you're about to make a non-trivial decision (new endpoint, new contract
field, new dependency, new exception to an existing rule), reread the
principles. If your change conflicts with one, **explicitly justify the
exception in the PR description** with the form:

> "Violates Principle N because <reason>. Acceptable here because <argument>.
> Mitigation: <how this doesn't compound into the next decision>."

Most violations should fail this self-check and result in a different
design. The handful that pass become known exceptions documented in
`08_OPEN_QUESTIONS.md`.
