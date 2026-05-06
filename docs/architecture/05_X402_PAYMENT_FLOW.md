# x402 Payment Flow + BookingEscrow

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md), [03_AGENT_CARD_SPEC.md](./03_AGENT_CARD_SPEC.md), [04_MERCHANT_AGENT_TEMPLATE.md](./04_MERCHANT_AGENT_TEMPLATE.md).
>
> Standards: HTTP `402 Payment Required` (RFC 9110); Coinbase x402 (2025
> publication); ERC-20 USDC on Base. We adopt x402 as Coinbase published it.

---

## Scope — what x402 IS and IS NOT, in TourSkill (read first)

**Earlier drafts of this document conflated two distinct problems.** This
revision draws the boundary so future implementers don't repeat the
mistake.

| Layer | Wire format | Settlement instrument | Use it for |
|---|---|---|---|
| **Block 1 — x402 paid skill** | HTTP 402 + `EIP-3009 transferWithAuthorization` | direct USDC transfer (no contract) | per-call micropayments (`get_rates_premium`, `get_concierge_recommendation` …). Cents-to-dollars range. **Stateless.** |
| **Block 2 — BookingEscrow** (deferred) | EIP-712 typed-data signature → custom contract call | `BookingEscrow.lock(intentId, amount, payee, releaseAt)` | booking-level held funds. Hundreds-to-thousands of dollars. Time-locked + dispute window. **Stateful.** |

**Two rules:**

1. **x402 is not a payment-rail wrapper for escrow.** The Coinbase x402
   spec defines a stateless per-request handshake. Coercing it into
   booking-level hold/release semantics produces a non-standard wire
   format that any other client implementing x402-by-the-spec will not
   understand. Don't do it.
2. **BookingEscrow is its own protocol**, designed Seaport-style: the
   user signs an EIP-712 typed message, the merchant (or the user
   directly) calls `lock()`, a keeper calls `release()` after
   `releaseAt`. **It does not return HTTP 402 and is not part of the
   x402 spec.**

### Status by phase

| Phase | x402 (Block 1) | BookingEscrow (Block 2) |
|---|---|---|
| **A** (current) | not built — free skills only | not built |
| **B-min** (next) | ✅ ship: paid skill MVP w/ official Coinbase SDK + Base Sepolia E2E test | not built |
| **C** (TBD, market-driven) | unchanged | only build if real merchants ask. Many small merchants are fine with auth-and-capture (no escrow) |

The flow diagrams below describe the **Block 2** target shape for when
(and if) we build BookingEscrow. They do **not** describe how Block 1
works — Block 1 is much simpler (one HTTP round-trip, one USDC transfer,
no contract). Block 1 will get its own document at
`05A_X402_PAID_SKILL.md` when we ship it.

---

This is the spec for how a user-agent pays a merchant-agent for a paid
skill, where the funds sit between booking and settlement, how disputes
work, and what the contract looks like.

> **All sections below are Block 2 (BookingEscrow), deferred to Phase
> C.** They are kept here as a design reference, not a roadmap commitment.

---

## 1. The big picture

```
┌──────────────────┐                              ┌──────────────────┐
│   User-Agent     │                              │  Merchant-Agent  │
│ (LLM, wallet UX) │                              │   (skills.ts)    │
└────────┬─────────┘                              └─────────┬────────┘
         │                                                  │
         │ POST /skills/create_booking                      │
         │ { check_in: 2026-09-01, ... }                    │
         ├─────────────────────────────────────────────────►│
         │                                                  │
         │                                       ┌──────────┴──────────┐
         │                                       │ x402 middleware     │
         │                                       │ - skill says "paid" │
         │                                       │ - quoteFn() runs    │
         │                                       │ - returns 402       │
         │                                       └──────────┬──────────┘
         │ HTTP 402 Payment Required                        │
         │ Body: {                                          │
         │   amount_usdc: 3640.00,                          │
         │   chain: "base-sepolia",                         │
         │   token: "0x036C...",                            │
         │   escrow: "0xESCROW...",                         │
         │   booking_intent_id: "bki_abc123",               │
         │   release_at: 1789027200,                        │
         │   facilitator: "https://x402.coinbase.com"       │
         │ }                                                 │
         │◄─────────────────────────────────────────────────┤
         │                                                  │
         │ Surface to human: "Pay 3640 USDC?"               │
         │ Human signs USDC.approve + escrow.lock           │
         │                                                  │
         │ ┌──────────────────────────────────────────┐    │
         │ │ BookingEscrow.lock(bki_abc123, 3640e6,   │    │
         │ │                    payee, releaseAt)     │    │
         │ │ on Base Sepolia                          │    │
         │ │ → tx_hash: 0xPAY...                      │    │
         │ └──────────────────────────────────────────┘    │
         │                                                  │
         │ Retry POST /skills/create_booking with payment   │
         │ X-Payment-Tx-Hash: 0xPAY...                      │
         │ X-Payment-Intent: bki_abc123                     │
         ├─────────────────────────────────────────────────►│
         │                                                  │
         │                                  ┌───────────────┴───────────┐
         │                                  │ x402 middleware verifies: │
         │                                  │ 1. tx confirmed on chain  │
         │                                  │ 2. amount matches quote   │
         │                                  │ 3. escrow.locks(intent)   │
         │                                  │    returns this tx_hash   │
         │                                  │ 4. payee == merchant      │
         │                                  └───────────────┬───────────┘
         │                                                  │
         │                                  Skill handler runs with `payment` ctx
         │                                  - books inventory in store
         │                                  - returns confirmation                 
         │                                                  │
         │ HTTP 200 OK                                      │
         │ Body: {                                          │
         │   booking_id: "bk_xyz789",                       │
         │   confirmation_code: "WCM-A4B7",                 │
         │   escrow_tx: "0xPAY...",                         │
         │   release_at: 1789027200                         │
         │ }                                                │
         │◄─────────────────────────────────────────────────┤
         │                                                  │
         │ ── time passes (e.g. user checks in, stays, checks out) ──
         │                                                  │
         │                  At release_at, anyone calls:    │
         │                  BookingEscrow.release(bki_abc123)
         │                  → USDC moves: escrow → merchant payout
         │                  → ReputationRegistry.autoAuthorize(payer, agent)
         │                                                  │
```

The user-agent never sees the merchant's wallet. The merchant-agent never
sees the user's signing key. USDC moves through the escrow contract, with
the contract enforcing the time-lock and dispute mechanics.

---

## 2. The 402 response shape

When a paid skill is called without a payment proof, the merchant-agent
returns:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Payment-Required: 1

{
  "version": "x402/1.0",
  "method": "tourskill.escrow",          // payment method discriminator
  "amount": "3640000000",                 // amount in USDC base units (6 decimals)
  "currency": "USDC",
  "currencyAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "chain": "base-sepolia",
  "chainId": 84532,
  "escrow": {
    "contract": "0xESCROW_ADDRESS",
    "function": "lock",
    "args": {
      "intentId": "bki_abc123",
      "payee":    "0xMERCHANT_PAYOUT...",
      "amount":   "3640000000",
      "releaseAt": 1789027200,
      "metadata": "0x..."             // sha256 of canonical request body
    }
  },
  "intent": {
    "id":        "bki_abc123",
    "expires":   1762809600,            // intent valid for 10 min
    "skill":     "create_booking",
    "merchant_agent_id": 42,
    "request_hash": "0xREQHASH..."     // sha256 of request bodies must match
  },
  "facilitator": "https://x402.coinbase.com"  // optional, for verification
}
```

Key invariants (enforced by middleware):

- **`intentId`** is a UUID prefixed with `bki_` (booking intent), unique per call. Replay-resistant.
- **`expires`** caps how long the user has to pay. Default 10 minutes. After that, retrying triggers a fresh quote (price may have changed).
- **`request_hash`** must match SHA-256 of the user-agent's request body. Stops "quote bait-and-switch" where the agent would lock for X then redeem for Y.
- **`releaseAt`** is computed by `quoteFn` from the booking's natural end time + dispute window.

---

## 3. BookingEscrow.sol

The contract that holds USDC between payment and settlement.

### 3.1 State

```solidity
struct Lock {
    address payer;
    address payee;
    uint256 amount;          // USDC base units
    uint64  releaseAt;       // earliest settlement time
    uint64  lockedAt;
    bytes32 metadata;        // sha256 of canonical request body (quote-anchor)
    Status  status;
}

enum Status {
    None,
    Locked,
    Disputed,
    Released,
    Refunded
}

mapping(bytes32 intentId => Lock) public locks;

// Tracks the cap on dispute windows so a malicious agent can't set
// releaseAt to year 2999. Adjustable by no one — pinned at deploy.
uint64 public immutable maxReleaseHorizon = 365 days;

IERC20 public immutable usdc;
ReputationRegistry public immutable reputation;
```

### 3.2 Public functions

```solidity
function lock(
    bytes32 intentId,
    address payee,
    uint256 amount,
    uint64  releaseAt,
    bytes32 metadata
) external;

function release(bytes32 intentId) external;
function refund(bytes32 intentId)  external;          // payee voluntary refund
function dispute(bytes32 intentId, string calldata reason) external;
function resolveDispute(bytes32 intentId, address awardTo) external;
```

#### lock
- Caller (user wallet) MUST have approved USDC transfer of `amount`.
- Contract pulls `amount` USDC from caller via `transferFrom`.
- Reverts if `intentId` already used (replay protection).
- Reverts if `releaseAt > block.timestamp + maxReleaseHorizon`.
- Reverts if `payee == address(0)`.
- Sets `locks[intentId]` = `Lock(payer=msg.sender, payee, amount, releaseAt, ...)`.
- Emits `Locked(intentId, payer, payee, amount, releaseAt)`.

#### release
- Anyone can call (it's a settlement, not a privileged op).
- Reverts if `block.timestamp < releaseAt`.
- Reverts if status != `Locked`.
- Transfers USDC to `payee`.
- Sets status = `Released`.
- Calls `reputation.autoAuthorizeFromBooking(merchantAgentId, payer)`.
- Emits `Released(intentId, payer, payee, amount)`.

We pass merchant agent ID as part of metadata: see [§5](#5-binding-bookings-to-agents) below.

#### refund
- Only `payee` can call (merchant voluntarily returns funds).
- Allowed any time before `Released`.
- Transfers USDC back to `payer`.
- Sets status = `Refunded`.
- Emits `Refunded(intentId, ...)`.

#### dispute
- Only `payer` can call.
- Allowed only while status == `Locked` AND `block.timestamp < releaseAt`.
- Sets status = `Disputed`. Funds frozen until `resolveDispute`.
- Emits `Disputed(intentId, reason)`.

#### resolveDispute
- v1: only the `disputeArbitrator` (set in constructor) can call. We are the arbitrator initially.
- v2 roadmap: replace with a DAO / Kleros-style decentralized dispute layer.
- Awards funds to either `payer` (refund) or `payee` (release).
- Emits `DisputeResolved(intentId, awardTo, ...)`.

### 3.3 Events

```solidity
event Locked(
    bytes32 indexed intentId,
    address indexed payer,
    address indexed payee,
    uint256 amount,
    uint64  releaseAt,
    bytes32 metadata
);
event Released(bytes32 indexed intentId, address indexed payer, address indexed payee, uint256 amount);
event Refunded(bytes32 indexed intentId, address indexed payer, address indexed payee, uint256 amount);
event Disputed(bytes32 indexed intentId, string reason);
event DisputeResolved(bytes32 indexed intentId, address indexed awardTo, uint256 amount);
```

### 3.4 Settlement automation

We don't expect users to manually call `release` after their stay. A
keeper / cron service periodically scans for `Locked` rows with
`releaseAt < now()` and calls `release()` for each. Anyone can run such
a keeper; we run one for the merchants on platform-hosted tier.

Gas cost on Base ~ $0.001 per release; not worth optimizing.

---

## 4. The dispute window

Every booking has a fixed dispute window after the natural service end
time:

| Skill type | `releaseAt` formula | Default window |
|---|---|---|
| Hotel booking | `check_out_date + dispute_window` | 24h |
| Restaurant reservation | `reservation_time + 4h` | 4h |
| Attraction ticket | `valid_date_end + dispute_window` | 24h |
| Generic shop | `expected_delivery + dispute_window` | 7 days |

The window is set per-skill in agent-card's
`extensions["tourskill.org/v1/payment"].escrow.disputeWindowSeconds`.

If `dispute()` is called before `releaseAt`, the funds freeze and our
arbitrator (initially us, eventually a DAO) reviews. Resolution is
off-chain (chat / form / whatever) but the verdict is on-chain via
`resolveDispute()`.

**Honest note**: we are the arbitrator in v1. This is a centralization
risk. We mitigate by:
- Publishing all dispute resolutions (off-chain) so behavior is auditable
- Capping our discretion: we can only award full to either party, not
  split — splits would invite "always dispute, get half back" gaming
- Roadmap: replace with Kleros / Reality.eth / a Coinbase-aligned dispute layer

---

## 5. Binding bookings to agents

The escrow contract doesn't store a `merchantAgentId` field directly —
that would couple every escrow lock to ERC-8004's address. Instead, we
encode the agent ID in the `metadata` bytes32:

```
metadata = sha256(
  agentId (uint256, big-endian) ||
  request_hash (bytes32) ||
  intent_id (bytes32 derived from string)
)
```

When `release()` fires, the keeper or merchant-agent must reconstruct
this metadata and call `ReputationRegistry.autoAuthorizeFromBooking(agentId, payer)`
in the same tx. We provide a multicall helper for this in our keeper code.

(Future v2: add `bytes32 metadata` storage + helper to extract agentId
trustlessly, so releases can auto-authorize without an off-chain
reconstruction step.)

---

## 6. Currency: USDC on Base only (v1)

We support **USDC on Base Sepolia (testnet) and Base mainnet only**.
Concretely:

| Network | USDC contract |
|---|---|
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

Why no other tokens / chains in v1:
- USDC is the standard for x402 facilitator implementations
- Multi-currency requires per-currency price oracles (which currency is the merchant's quote in?) — too much surface area for v1
- Merchants who want CNY pricing can convert at quote time (their `quoteFn` looks up FX, returns USDC equivalent)

Future v2: add EURC, USDT, USDS via a `tokens[]` field in the 402
response. Keep USDC as default.

---

## 7. Refund flows

Two ways funds can return to the user:

### 7.1 Voluntary refund (merchant-initiated)
Merchant calls `BookingEscrow.refund(intentId)`. Used for:
- Cancellation within the merchant's free-cancel window
- Service failure (overbooking, force majeure)
- Goodwill gestures

This is one-step and gas-free for the user.

### 7.2 Disputed refund (user-initiated)
User calls `dispute()`, arbitrator calls `resolveDispute(intentId, payer)`.
Used for:
- Service not delivered
- Merchant unreachable
- Significant misrepresentation

---

## 8. Cancellation policy enforcement

The cancellation policy in `agent-card.json` is **the contract** between
user and merchant. The merchant-agent is responsible for honoring it:

```typescript
// In create_booking handler:
async cancel({ booking_id }, ctx) {
  const booking = await ctx.store.getBooking(booking_id);
  const policy = ctx.config.cancellationPolicy;
  const hoursToStart = (booking.check_in - now()) / 3600;
  const tier = policy.tiers.find(t => hoursToStart >= t.hoursBeforeStart);
  const refundUsdc = booking.total_usdc * (tier.refundPercent / 100);
  // Refund partial via on-chain refund of (refundUsdc) and re-lock the rest? 
  // → No. Escrow is all-or-nothing per intent.
  // Instead: the merchant-agent calls `escrow.refund(intentId)` returning ALL,
  // then if a partial fee is owed, generates a NEW 402 for that smaller
  // amount which the user pays.
  // This keeps escrow logic simple.
  ...
}
```

**Why all-or-nothing per intent**: the escrow contract is dumb on
purpose. Partial refunds are simulated by full-refund + new lock. This is
gas-inefficient (3 txs vs 1) but escrow code stays auditable in 200 lines.
Worth the trade.

---

## 9. Failure modes & recovery

| Failure | What happens | Recovery |
|---|---|---|
| User signs `lock`, then closes tab before merchant retries | Funds locked but no booking exists in merchant DB | Merchant's keeper sees orphaned `Locked` event with no matching booking; merchant calls `refund` to user |
| Merchant-agent down at retry time | User's retry returns 5xx | User-agent retries with exponential backoff; if persistent, user can `dispute` to recover funds |
| `releaseAt` is invalid (e.g., past) | `lock` reverts | User-agent re-fetches quote |
| Merchant-agent's `metadata` doesn't match served quote | Dispute / reputation penalty (off-chain) | Out-of-band |
| Chain reorg | Highly unlikely on Base; if it happens, x402 facilitator re-checks confirmations | Wait for finality (we wait for 2 blocks before considering payment confirmed) |

---

## 10. Test plan (when we get to building)

- **Foundry**: every state transition in `BookingEscrow.sol` covered, including reverts.
- **Foundry property tests**: balance invariant (`escrow.balance == sum(Locked.amount)`); no double-spend; refund + release are mutually exclusive.
- **Integration**: a Hono `merchant-agent` with x402 middleware against a fork of Base Sepolia. Full happy path + dispute + refund tested end-to-end.
- **Load**: 100 concurrent bookings, none should drop or double-charge.

We do not deploy to mainnet without external audit. Internal review first
(Foundry coverage 100%), then independent audit (Trail of Bits / Spearbit
/ Cantina), then mainnet.
