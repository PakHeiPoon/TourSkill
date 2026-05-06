# Reputation Design

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md), [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md), [05_X402_PAYMENT_FLOW.md](./05_X402_PAYMENT_FLOW.md).

The single hardest thing about an open registry is preventing review fraud.
This doc specifies how TourSkill makes review fraud expensive.

---

## 1. Threat model

| Attack | Cost in centralized OTAs | Cost in our naive design |
|---|---|---|
| Sock-puppet positive reviews | Fake account creation ($/account); some platforms detect via behavioral analysis | Free (just sign with a new wallet) |
| Negative-review extortion ("pay me or I 1-star you") | Possible but limited by platform moderation | Free until detected |
| Competitor sabotage | Possible at moderate cost | Free |
| "Buy reviews" services | $0.50–$5/review on grey markets | Same cost |

The honest truth: a registry with **no Sybil resistance** is worse than
useless because reviews are the *primary* discovery signal. We must make
each review carry a verifiable cost.

---

## 2. Core principle: feedback gated by settled bookings

**Only the wallet that paid for and settled a booking can leave reviews
for the merchant they paid.** This is enforced by the
`ReputationRegistry` contract on Base (see [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md) §3) via the
`autoAuthorizeFromBooking` hook:

```
BookingEscrow.release(intentId)
  └── Reputation.autoAuthorizeFromBooking(merchantAgentId, payer)
        └── Sets _feedbackAuth[merchantAgentId][payer] = true
```

Now `payer`'s wallet is on-chain authorized to leave one (or more)
feedback entries about `merchantAgentId`. Without this authorization, any
feedback they submit is rejected by every honest indexer.

**Cost to attacker** of writing one fake review:
1. Create a sock wallet with USDC
2. Make a real booking and pay (USDC → escrow)
3. Wait through the dispute window
4. Settlement releases USDC to merchant
5. *Now* the sock wallet can review

Step 4 is the killer: the attacker has now **paid the merchant they're
attacking** the full booking amount. Negative-review extortion now has a
floor cost equal to one full booking. Positive sock-puppetry costs the
attacker the same booking amount, with money flowing to the very
merchant they're trying to pump (which is fine, but unprofitable).

This is the exact pattern Booking.com uses — review only after a stay —
but enforced by smart contract instead of by their internal CRM.

---

## 3. Off-chain feedback storage

The chain stores **authorization**. The chain does **not** store the
review text. Why:
- Review content is ~500-2000 bytes; storing on Base costs cents but
  doesn't compose well (no efficient query)
- We want internationalization (zh + en + future others)
- We want media (photos)
- We want corrections / responses without immutability lock

So: feedback content lives off-chain, signed by the authorized wallet,
indexed by anyone.

### 3.1 Feedback message schema

```jsonc
{
  "schemaVersion": "tourskill.org/feedback/v1",
  "merchantAgentId": 42,
  "bookingTxHash": "0xPAY...",        // BookingEscrow.lock tx
  "settlementTxHash": "0xRELEASE...",  // BookingEscrow.release tx (proves settled)
  "rating": 4,                         // 1-5 stars
  "title": "Great views, mediocre breakfast",
  "body": "...up to 4000 chars...",
  "language": "en",
  "media": [                           // optional: IPFS hashes for photos
    { "type": "image/jpeg", "ipfs": "Qm..." }
  ],
  "createdAt": 1789200000,
  "address": "0xPAYER..."              // signer wallet
}
```

The reviewer signs the canonical SHA-256 of this JSON via EIP-191.
Indexers verify the signature recovers to `address` and that
`address` has `Reputation.isAuthorized(merchantAgentId, address) == true`.

### 3.2 Storage locations

Three places feedback can live, all valid:

1. **The merchant-agent's own storage** — the merchant exposes
   `GET /reputation/feedback?since=...`. They serve their own reviews.
   Conflict of interest? Yes, but mitigated by indexers (see #3) cross-
   referencing.
2. **TourSkill's central indexer** — `GET /v1/reputation/feedback?merchantAgentId=...`. The indexer publishes everything it sees. Anyone can run their own.
3. **IPFS / Arweave** — for permanence. Optional; merchants on Tier 2+
   can opt to mirror their feedback there.

User-agents reading reputation should query at least 2 of 3 sources and
flag discrepancies.

### 3.3 Replay & uniqueness

A wallet can leave **at most one feedback per `bookingTxHash`**. The
indexer enforces this — second submission with same `bookingTxHash` from
same `address` replaces the first (allows correction). Different bookings
from the same wallet can each have their own feedback.

A wallet that's done 10 bookings can leave 10 feedbacks. This is
intentional — it's "one review per stay", same as real platforms.

---

## 4. Aggregation algorithm

How do we turn a list of signed-and-settled feedbacks into a
"reputation score" agents use for ranking? The naive average has known
issues (1 perfect-5 review beats 100 thoughtful 4.5s by mean alone).

We use the **lower bound of Wilson confidence interval at 95%**, the same
metric Reddit's "best" sort uses:

```
score = ((p + z²/(2n)) - z·√((p(1-p)/n) + z²/(4n²))) / (1 + z²/n)
where p = positive_fraction (rating ≥ 4 / 5), n = total_reviews, z = 1.96
```

This penalizes low-volume merchants (high uncertainty → lower score) and
rewards consistency at high volume.

**Tie-breaking** when scores are equal: more recent feedback weighted
higher via a 6-month half-life decay applied to vote counts before
Wilson computation.

The aggregation is **not** on-chain. It's computed by indexers from the
signed feedback set. Different indexers may rank slightly differently;
that's fine and arguably healthy.

---

## 5. Disputed feedback

What if a merchant claims a review is fraudulent or coerced? We have two
mechanisms:

### 5.1 Right of reply (off-chain)
The merchant can publish a signed reply to any feedback. The reply is
linked to the original feedback by hash. Indexers display them together.
This is the simplest mechanism; doesn't require any contract changes.

### 5.2 Feedback nullification (on-chain, escalated)
For feedback that's clearly malicious (e.g., review of a stay the user
never actually had — the booking was disputed and refunded, not
settled), the merchant can call:

```solidity
// Hypothetical v2 function on ReputationRegistry — not v1
function disputeFeedback(uint256 agentId, address reviewer, bytes32 feedbackHash) external;
```

This emits an event indexers index. **Disputed feedbacks are NOT removed
from indexers' lists**, but they're shown with a "merchant disputes this"
flag. The user-agent can choose how to weight this in ranking.

In v1, we ship only the off-chain right-of-reply. v2 may add the on-chain
dispute primitive after we see how it goes.

---

## 6. Merchant onboarding score

A brand-new merchant has zero reviews. Pure Wilson scoring would put them
at the bottom of every search forever. To bootstrap:

- New merchants get an **"unverified" badge** in the UI (visible to user)
- Their score for ranking is set at the **median** of the merchant
  category (so they appear in the middle, not the bottom)
- The badge is removed and Wilson takes over after their **5th** settled
  feedback

This is a soft heuristic, not a contract feature. Lives in the indexer.

---

## 7. What we explicitly don't do

- **Star ratings on chain.** Stars are off-chain; the chain only stores
  authorization. This keeps schema flexibility.
- **Anonymous feedback.** Every review is tied to the wallet that paid.
  Identity-as-Sybil-resistance is the whole point.
- **Sentiment analysis on the merchant's behalf.** We don't summarize
  reviews into a "happy/unhappy" axis automatically. Indexers can if they
  want; the platform doesn't.
- **Pay for placement.** No merchant can pay us (or anyone) to rank
  higher in `/v1/discover`. Period. (See [09_BUSINESS_MODEL.md](./09_BUSINESS_MODEL.md) §6 "what we will never do".)

---

## 8. Future: ValidationRegistry usage

ERC-8004's `ValidationRegistry` (which we deploy but don't use in v1) is
the natural home for **third-party attestations** that augment the
booking-based reputation:

- "City tourism board has verified this hotel exists at the address claimed"
- "FoodSafetyCertifier has verified this restaurant's hygiene rating"
- "GreenTourism Coalition has verified this lodge's sustainability claims"

Each attester is itself an agent registered in `IdentityRegistry`. They
sign attestations via `submitValidation()`. User-agents can check
relevant attesters (configurable per user — "I trust the City Board, I
don't trust influencer attestations") when ranking.

This is roadmap, not v1, but the contract is on-chain so we don't
redeploy.

---

## 9. Manual feedback authorization (escape hatch)

Sometimes a merchant wants to grant a reviewer rights without going
through booking + escrow:

- Beta tester rewards
- Press / influencer comp stays paid off-chain
- B2B partnership reviews

The contract supports this:

```solidity
Reputation.acceptFeedback(merchantAgentId, reviewerAddress);
```

Only the merchant's owner can call this. It's the same authorization slot
as the auto-from-booking hook. **Indexers display these reviews with a
`source: "manual"` flag** so consumers can decide whether to trust them.

This is intentional escape hatch + transparency.

---

## 10. Implementation summary for v1

What ships in v1 (Phase C, after escrow):

- ✅ `ReputationRegistry` contract with `acceptFeedback` / `revokeFeedback` / `autoAuthorizeFromBooking` / `isAuthorized`
- ✅ `BookingEscrow.release()` calls `autoAuthorizeFromBooking()` in the same tx
- ✅ Indexer (`/v1/reputation/feedback?merchantAgentId=X`) returns signed + verified feedback list
- ✅ Each merchant-agent serves its own feedback at `/reputation/feedback`
- ✅ User-agent ranking algorithm uses Wilson lower bound with 6-month half-life
- ✅ Right-of-reply via signed merchant response (no contract change)
- ✅ Manual `acceptFeedback` with `source: "manual"` flag in indexer

What's punted to v2:
- ⏸ On-chain feedback dispute (`disputeFeedback`)
- ⏸ ValidationRegistry attestation flows
- ⏸ Multi-source reputation (cross-platform aggregation)
