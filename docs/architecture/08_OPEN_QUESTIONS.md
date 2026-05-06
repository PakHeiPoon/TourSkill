# Open Questions

> Reference: all other docs in `docs/architecture/`.

This is the catalog of things I haven't decided / can't decide alone /
need user input on. Each entry has the question, the trade-off as I see
it, my current default answer, and what triggers a revisit.

These are listed in the order they need to be answered (earliest blocker
first).

---

## Q1. Indexer: in-process or external service?

**Question.** The new ERC-8004 indexer (which replays AgentRegistered /
AgentUpdated events and populates the `agents` table) — does it run as a
background task in the existing FastAPI process, or as a separate
long-running service?

**Trade-off.**
- **In-process** (background asyncio task in FastAPI): one deploy, simpler
  ops, free piggyback on Vercel's Fluid Compute. Risk: Vercel kills idle
  functions; we'd need to replay from last block on every cold start. On
  a busy chain that's wasteful.
- **External**: a small Node service running on Fly.io / Railway / a tiny
  VPS, persistent connection to Base RPC, writes to Supabase. More moving
  parts, but the right shape for an indexer.

**My default:** External Node service (~50 LOC + Drizzle), $7/mo Fly.io.
Indexers are long-lived watchers; serverless functions aren't.

**Revisit when:** if external indexer turns out to be a per-merchant cost
problem at scale (it shouldn't, single global indexer for all merchants),
or if we move chain primary to a chain that doesn't support log filters.

---

## Q2. Single global indexer vs decentralized indexer?

**Question.** Should there be exactly one TourSkill-run indexer, or do we
encourage / require multiple independent indexers for resilience?

**Trade-off.**
- **One global**: simpler, lower cost, easier to debug. Single point of
  failure for *discovery*; chain still works without us.
- **Multiple**: anyone can run an indexer, clients pick which to query
  (or query several and merge). More robust, more complex.

**My default:** One global indexer in v1. Document the schema + indexer
code so anyone can run their own (the Node service is open source). Move
toward multi-indexer in v2 if a real need emerges (e.g., enterprise
customer wants a private indexer).

**Revisit when:** TourSkill's indexer goes down for >1 day OR an
ecosystem partner asks for the data feed.

---

## Q3. Do we need agent-card hash or just URI?

**Question.** [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md) §2.1 stores both `agentCardURI` and
`agentCardHash` in IdentityRegistry. Is the hash worth the storage cost?

**Trade-off.**
- **With hash:** clients can't be tricked by a poisoned URI (the merchant's
  CDN serving altered content). 1 extra slot per agent (~$0.001 on Base).
- **Without hash:** save the slot, trust the merchant to serve consistent
  JSON. If their CDN is compromised, every consumer is at risk.

**My default:** Keep the hash. The cost is trivial; the security gain is
real (think DNS hijacking, expired domain takeovers, malicious CDN).

**Revisit when:** never. This one's settled — hash stays.

---

## Q4. Cancellation policy: encoded on-chain too?

**Question.** Cancellation policy currently lives in
agent-card.json (off-chain). Should we ALSO encode it on-chain so the
escrow contract can enforce partial refunds programmatically?

**Trade-off.**
- **On-chain**: contract-enforced refund tiers; no need to trust the
  merchant-agent to honor its own policy; more deterministic.
- **Off-chain only**: simpler escrow contract; merchant-agent runs the
  refund logic and calls `escrow.refund()` itself; merchant could
  technically violate their own policy but their reputation tanks.

**My default:** Off-chain only in v1. Reasoning: (a) escrow contract
stays minimal and auditable, (b) policy rules are complex (tiered times,
free-cancel windows, partial refunds with fees) and encoding them on chain
adds a lot of state, (c) merchants violating their own published policies
gets caught by reputation system + future on-chain dispute.

**Revisit when:** we see a pattern of policy violations not getting
caught by reputation, OR a major partner (city tourism board, large
chain) requires it for compliance.

---

## Q5. Multi-property support — single agent or one-agent-per-property?

**Question.** A hotel chain with 50 properties — does it run **one**
merchant-agent that exposes 50 sets of inventory (multi-property), or
**50** separate merchant-agents (each registered separately on chain)?

**Trade-off.**
- **One agent, many properties:** simpler ops for the chain, one
  agent-card with `properties[]` extension; on-chain footprint = 1 agent
  fee. But conceptually messy: which property is the agent? Different
  cities → different reputation.
- **One agent per property:** cleaner conceptually, each property has own
  reputation, own agent-card; chain pays 50× registration. Roll-up
  dashboard handled by managed-hosting tier on the platform side.

**My default:** One-agent-per-property. Forces clean separation and
matches user intuition ("I'm reviewing this Marriott in Tokyo, not the
brand"). The chain pays N×$0.005 in registration gas, peanuts.

**Revisit when:** a Tier 3 enterprise customer pushes back hard. Maybe
add a "brand attestation" via ValidationRegistry where the chain attests
"these 50 agents are all me".

---

## Q6. Idempotency window — how long?

**Question.** When `create_booking` is called with `Idempotency-Key`,
how long does the merchant-agent remember the result and return cached
on retry?

**Trade-off.**
- **Long window (24h+):** safe against any retry pattern; eats DB space.
- **Short window (5m):** small footprint; user-agent retry beyond window
  could double-book.

**My default:** 24 hours. Storage cost is negligible. Retries on real
flaky networks happen up to hours later.

**Revisit when:** a load test reveals the idempotency table is bloating.

---

## Q7. Skills: how many and what's mandatory?

**Question.** Should every hotel-type merchant be required to expose all
the standard skills (`check_availability`, `get_rates`, `create_booking`,
`get_cancellation_policy`)? What if a merchant wants to be discovery-only
without booking support?

**Trade-off.**
- **Mandatory full set:** consistent UX for user-agents, no surprises
  ("this merchant says they're a hotel but you can't book").
- **Optional:** more flexibility; some merchants want directory-only
  presence; agent-card declares what's available.

**My default:** Optional. The agent-card lists what skills the agent
supports; the user-agent's discovery query can filter by required skills
(`/v1/discover?skills=create_booking`). This matches how the rest of the
spec works.

**Revisit when:** UX testing shows users get confused by "browse" vs
"book" merchants in the same list. Maybe add a discoverability badge
("bookable").

---

## Q8. Dispute arbitration — who in v1?

**Question.** [05_X402_PAYMENT_FLOW.md](./05_X402_PAYMENT_FLOW.md) §3 says we (TourSkill) are the
arbitrator in v1. How do we structure that?

**Trade-off.**
- **Single admin EOA:** simplest. One person decides. Risk: that person
  could be socially engineered or coerced.
- **Multisig (2-of-3 or 3-of-5):** decentralized within the team,
  attack-resistant. Slower decisions.
- **External arbitration service** (Kleros / Reality.eth) from day 1:
  hardest to set up; most legitimate.

**My default:** 2-of-3 multisig with the founders as signers. We aim for
disputed-resolution-time SLA of 7 days. Explicit roadmap to migrate to
Kleros / similar by v2.

**Revisit when:** we resolve our 10th dispute; pattern data on what's
hard.

---

## Q9. 0G integration depth?

**Question.** We use 0G Compute as an inference provider in AgentDemo
(optional). Should we also use 0G Storage for agent-card hosting? For
booking tx archival? For reputation feedback storage?

**Trade-off.**
- **Heavy 0G integration:** strengthens the "0G ecosystem" narrative;
  technical bet on 0G's longevity.
- **Light integration:** less coupling; if 0G's product/team trajectory
  changes, we're fine.

**My default:** Light. 0G Compute remains an optional inference provider
(merchants can choose any OpenAI-compatible). 0G Storage is on roadmap
for "permanent reputation archive" (Tier 2+ feature) but not in v1.
Other touch points stay vendor-agnostic.

**Revisit when:** 0G Storage matures with stable client libraries AND
we hit Supabase pricing pain on feedback archive.

---

## Q10. Multi-tenant agent runtime — how isolated?

**Question.** When TourSkill platform-hosts merchant-agents, how strong
is tenant isolation? Same Hono process with row-level Postgres filter?
Separate process per tenant? Separate VM per tenant?

**Trade-off.**
- **Process-level isolation:** simplest scaling, lowest cost. Vulnerable
  to one tenant's bug taking down the process for all tenants.
- **Per-tenant process:** stronger isolation, but cost scales linearly with tenant count. Vercel doesn't make this cheap.
- **Per-tenant VM:** strongest isolation, very expensive, only justified
  for Tier 3 enterprise customers anyway.

**My default:** Tier 0 + Tier 1 + Tier 2 share a process pool with row-
level Postgres filter. Tier 3 gets dedicated VM. The same code runs in
both modes; the difference is the orchestrator.

**Revisit when:** a tenant bug or RCE incident; first audit; or first
Tier 3 customer demands SOC 2 evidence.

---

## Q11. Custom skills — sandboxed or vetted?

**Question.** Tier 2+ feature: merchants can write custom skill code
(TypeScript callbacks). Do we run this code in a sandbox (Cloudflare
Workers / Deno permission gates) or vet/audit each merchant's code?

**Trade-off.**
- **Sandbox:** scales to N merchants without per-merchant review work.
  Misses sophisticated attacks the sandbox doesn't anticipate.
- **Vetted:** every merchant submission goes through a code review.
  Doesn't scale; biases against small merchants who can't afford the wait.
- **Both:** sandbox first, with a higher tier for "trusted, audited"
  custom code.

**My default:** v1 has NO custom-code feature; the no-code form is
sufficient for Tier 1/2. Custom-code is Tier 3 only and goes through
manual review before deployment.

**Revisit when:** Tier 2 churn data shows merchants leaving because they
can't customize; OR Cloudflare Workers' permission model improves.

---

## Q12. The "what if Coinbase deprecates x402?" question

**Question.** x402 is currently a Coinbase-led standard. If Coinbase loses
interest or pivots, what's our continuity plan?

**Trade-off.**
- **Bet on x402:** simplest now; aligns with the biggest payments player
  in crypto.
- **Build a generic payment-method abstraction:** more code, future-proof
  but premature.

**My default:** Bet on x402, but write our payment integration behind a
clean interface (`PaymentMethod` trait in merchant-agent template) so a
future "x402-replacement" is a swap of one module. The interface mirrors
the 402 wire format; if HTTP 402 itself ever standardizes around a
different shape, we adapt the wire format and keep the interface.

**Revisit when:** Coinbase publicly steps back from x402, OR an
EIP-equivalent for payment-required emerges and gains traction.

---

## Q13. Currency in v2: USDT, EURC, native ETH?

**Question.** Per [05_X402_PAYMENT_FLOW.md](./05_X402_PAYMENT_FLOW.md) §6, v1 supports USDC on Base only.
What's the order of priority for v2?

**Trade-off.**
- **USDT first:** most-used stablecoin globally, especially in Asia (our
  initial market).
- **EURC first:** complements USDC, Coinbase native, smaller market but
  cleaner regulatory picture in EU.
- **Native ETH:** simpler integration, matches "pay-per-call" patterns in
  the broader crypto ecosystem; but volatility is bad for booking quotes
  ("3640 ETH today, 3580 ETH tomorrow").

**My default:** USDT next. Asia market matters; we're based in Macau /
HK / Mainland.

**Revisit when:** v1 ships and we have actual booking data showing
where the friction is.

---

## Q14. Geographic reach: chain-only, or KYC for fiat ramps?

**Question.** Eventually we want fiat on-ramps (Visa → USDC → escrow) to
reach non-crypto-native customers. Does that pull us into KYC / AML
territory and break "TourSkill never custodies"?

**Trade-off.**
- **Stay crypto-only:** never custody, never need KYC. Limits TAM to
  crypto-fluent users.
- **Partner with on-ramp providers (Coinbase Onramp, MoonPay):** they
  do KYC; user lands with USDC, we don't touch. Expand TAM significantly.
- **Build our own ramp:** never. Don't.

**My default:** Partner-based on-ramps (Coinbase Onramp) once the rest
of the stack works. We don't custody. The partner is the ramp; we just
embed their widget in user-agent UX.

**Revisit when:** v1 ships and product-market fit suggests TAM expansion
is the bottleneck.

---

## Q15. The boring one: do we use Foundry or Hardhat?

**Question.** Smart contract framework.

**Trade-off.** Foundry is faster, native Solidity, modern toolchain.
Hardhat is more familiar to many devs, more JS-tooling integration.

**My default:** Foundry. Faster tests = better tests. Slim toolchain.

**Revisit when:** never. Foundry is the right choice in 2026.

---

## How to use this list

Each question has a default. The defaults are intended to be **good
enough to start building**. As we hit each one in execution:

- If we agree with the default, no decision is needed; the code reflects it.
- If a default needs to change, we update this doc with the new decision
  + reasoning, and note which other docs need follow-up edits.
- New questions that emerge during build go in this same file with the
  same structure.

The file is alive, not a one-shot checklist. Updates are version-
controlled; review every quarter or when a major decision lands.
