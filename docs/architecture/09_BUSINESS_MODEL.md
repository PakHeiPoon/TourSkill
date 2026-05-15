# Business Model — Protocol-Free, Hosting-Paid

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md), [01_TARGET_ARCHITECTURE.md](./01_TARGET_ARCHITECTURE.md).

This doc defines how Concourse makes money. The shape of the business model
is load-bearing on the architecture: it determines what the platform-hosted
runtime needs to do, what self-hosted users get for free, and what we'll
never charge for.

---

## 1. North star

**The protocol is free. Convenience is paid.**

We are explicitly not an OTA. We never take a cut of bookings. We never
custody user funds. We never put ourselves between a user-agent and a
merchant-agent in any flow that has economic weight.

What we sell: **the operational pain of running a merchant-agent**. Hosting,
upgrades, monitoring, support, scaling, key management UX, multi-property
roll-ups, custom skill development. This is SaaS pricing, billed per
merchant per month, **completely independent of their booking volume**.

This puts us in good company:

| Open standard | Free | Paid hosted product |
|---|---|---|
| HTTP / SMTP | RFCs | Cloudflare, Mailgun, Postmark |
| Postgres | postgresql.org | Supabase, Neon, Crunchy |
| Next.js / React | framework | Vercel, Netlify |
| Bitcoin / Ethereum | the chain | Coinbase, Alchemy, Infura |
| **A2A / ERC-8004 / x402** | the protocol | **Concourse (us)** |

The pattern is durable: open standards win adoption; convenience products
win revenue. We pick that side deliberately.

---

## 2. The two tracks (recap from Principle 6)

| | Self-hosted | Platform-hosted |
|---|---|---|
| Who runs the merchant-agent process | Merchant | Concourse |
| Hosting cost | Merchant pays their cloud bill (~$5-50/mo Vercel/Render/Fly) | Bundled in subscription |
| Wallet key custody | Merchant | Merchant *(we never custody)* |
| Inventory data location | Merchant's DB | Concourse multi-tenant Postgres, isolated per tenant |
| Updates / security patches | Merchant runs `git pull` | We push automatically |
| External API surface | Identical | Identical |
| ERC-8004 registration | Same flow | Same flow |
| Cost to merchant | $0 to Concourse | Subscription (see below) |

**The architectural rule is the killer feature for both sides:** a merchant
can start on platform-hosted, outgrow it, switch to self-hosted, and **none
of their customers (user-agents) notice**. Because the agent-card URL is
just a domain, and DNS makes it portable.

This is the bargain: we earn their subscription by being **better than
their alternative for as long as we are better**, not by lock-in.

---

## 3. Pricing tiers (proposed; subject to market validation)

All prices in **USDC equivalent** so settlement is on-chain when desired.
Merchants can pay in fiat too via standard rails — same headline price.

### Tier 0 — Solo (free)
- 1 merchant
- 1 location
- Up to 100 settled bookings/month
- Default skill set (no custom skills)
- Concourse subdomain (`<slug>.merchants.tourskill.paking.xyz`)
- Community support only

**Why free**: indie hosts, single-property B&Bs, the "show up at a hackathon" use case. Discovery surface for the network. We bear the cost; the network effect is the return.

### Tier 1 — Studio ($29 USDC/mo)
- Up to 3 locations
- Up to 1,000 settled bookings/month
- Custom skills via no-code form (calendar overrides, special dietary tags, custom cancellation policy windows)
- Custom domain support
- Email support, 48h SLA

**Target customer**: small B&B chains, single-restaurant groups, niche tour operators.

### Tier 2 — Studio Plus ($99 USDC/mo)
- Up to 10 locations
- Up to 10,000 settled bookings/month
- Custom skills via developer hooks (TypeScript callback functions, sandboxed)
- Multi-property roll-up dashboard ("show me occupancy across all 8 hotels")
- Webhook integrations (sync with merchant's PMS — Opera, Mews, Cloudbeds, etc.)
- Priority support, 24h SLA

**Target customer**: regional hotel groups, chain restaurants, multi-park attraction operators.

### Tier 3 — Enterprise (custom, starts $499/mo)
- Unlimited locations / bookings
- Dedicated infra (single-tenant deployment)
- Custom integrations with merchant's existing systems
- SOC 2 / ISO 27001 attestations
- Named CSM, 4h SLA, business-hours phone support
- Service-credit guarantees

**Target customer**: branded chains (Marriott franchise groups, attraction chains), city tourism boards running a sub-registry, large OTAs that want to migrate off legacy infra.

---

## 4. What's free *forever*, even on Tier 0

This is the hard bargain — these things stay zero-cost regardless of tier:

- **The protocol itself.** ERC-8004 contracts are public; agent-card.json
  spec is open; the merchant-agent template is MIT-licensed; SKILL.md is
  publicly served.
- **Self-hosting.** A merchant can always opt out of our hosting and run
  their own. We will never gate this with feature flags or "premium-only"
  protocol extensions.
- **Discovery via Concourse registry indexer.** Both self-hosted and
  platform-hosted merchants appear in the same `/v1/discover` results.
- **User-side agent install.** End users (and their user-agents) never pay
  Concourse anything. They pay the merchants directly via x402.
- **Migration off our platform.** A merchant on Tier 2 who wants to leave
  gets a one-click export of their inventory + agent-card. We facilitate
  the DNS cutover.

**This is enforced architecturally, not just by good intentions** — the
ERC-8004 registry is public chain state we don't own; the agent-card is
served by code the merchant runs; the user-agent is installed by the user
without our involvement. The "protocol-free" promise is a property of the
system, not a marketing claim.

---

## 5. Future revenue lines (roadmap, not v1)

These extend the same logic ("paid for *operational pain*, never for
*access to the protocol*"):

### 5.1 Verified merchant attestations
We act as one of (potentially many) attestors who sign "we've verified this
merchant exists at this address". Charged per attestation. Optional from
the merchant's perspective. Lives on-chain in `ValidationRegistry`.

### 5.2 Reputation oracles
We index reputation across multiple sources (settled bookings on chain,
plus optional out-of-band signals), expose paid API tiers for high-volume
agent operators (e.g., a travel-aggregator agent calling 10K
discover-and-rank queries/day).

### 5.3 Custom skill marketplace
Third-party developers publish reusable skill modules ("Stripe Refund
Handler", "Multi-language Concierge", "Loyalty Points Awarder"). We take a
flat listing fee per module. Merchants on Tier 2+ can mix-and-match.

### 5.4 Booking-data analytics (privacy-preserving)
Aggregate, anonymized booking data for tourism boards / market researchers.
Merchants opt in. Revenue split with opting-in merchants.

### 5.5 0G integrations bundling
Bundle 0G Compute credits and 0G Storage allocation into Tier 1+ — let
merchants run their LLM inference on the same chain ecosystem they're
identified on. Margin on top of 0G's wholesale.

---

## 6. What we will *never* do

These are non-negotiable architectural commitments, not just present-day
strategy:

- **Take a cut of merchant bookings.** Whether 0.1% or 25%, we don't.
  Subscription only.
- **Custody merchant or user funds.** All USDC settlement is escrow → merchant's
  own wallet. Period.
- **Hide self-hosted merchants from discovery.** Both tracks must always
  appear with equal visibility in `/v1/discover`.
- **Lock data behind paid tiers.** Even Tier 0 merchants own their
  inventory; we don't hold it hostage as a churn-prevention.
- **Sell merchant data without consent.** Anonymized aggregates require
  opt-in plus revenue share.

If a future board / investor / co-founder pushes any of these, the answer
is no, and the answer is on this page.

---

## 7. Open economic questions

These are flagged in [08_OPEN_QUESTIONS.md](./08_OPEN_QUESTIONS.md) for
later resolution. Listed here for completeness.

- **Network effects vs. subscription tension.** The more merchants on the
  network, the more valuable each merchant's listing — but only Tier 0 is
  free, which limits adoption. Should there be a "pay-when-you-earn"
  variant where Tier 0 → Tier 1 transition triggers above some booking
  count?
- **Payment-rail facilitator fees.** x402 facilitator nodes can charge a
  small fee for verifying payment proofs. If we run our own facilitator,
  there's a tiny revenue line per call. Worth it or noise?
- **Token / loyalty mechanics.** Many web3 marketplaces add a token. We
  reject this for v1 — tokens introduce regulatory complexity and align
  incentives with speculation, not service quality. Revisit only if
  product-market fit demands it.

---

## 8. North star, again

> "Open protocol, paid hosting." Every feature we ship is judged against
> whether it earns its place in *paid hosting* or whether it's actually
> protocol-level work that should be free. When in doubt, we err toward
> free.
