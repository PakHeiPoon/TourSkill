# ERC-8004 Contract Design

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md), [01_TARGET_ARCHITECTURE.md](./01_TARGET_ARCHITECTURE.md).
>
> Standard: ERC-8004 *Trustless Agents* (draft proposal). We track the
> upstream draft and adopt its interface verbatim. Where the upstream is
> ambiguous, we pick a default and note it; if upstream pins down a
> different choice later, we follow it.

This doc specifies the three contracts we deploy, their state, their public
interfaces, the access control rules, and the events they emit. No full
Solidity code — that's the next sub-phase. This is the spec a contract
engineer reads to know exactly what they're building.

---

## 1. Deployment plan

| Contract | Network (testnet) | Network (mainnet) | Upgradeable? |
|---|---|---|---|
| `IdentityRegistry` | Base Sepolia | Base mainnet | **No** — proxy adds risk we don't need; if we screw up the spec we redeploy fresh and re-register (Principle 4: clean slate). |
| `ReputationRegistry` | Base Sepolia | Base mainnet | No |
| `ValidationRegistry` | Base Sepolia | Base mainnet | No (scaffold only — see §4) |

**No proxies, no admin keys.** Once deployed, the contracts are immutable
public infrastructure. If we need to fix a bug, we deploy a v2 alongside,
publicize the new address, and let clients migrate. This is the same
discipline as ENS / Uniswap.

**Compiler:** Solidity 0.8.24+, `evmVersion: cancun`. We use Foundry for
build + test, deploy via `forge create` with hardware wallet signing on
mainnet.

**Verification:** every deployment is verified on Basescan day-of. No
exceptions.

---

## 2. IdentityRegistry

The canonical "this address owns this agent" record. Mirrors ERC-8004's
upstream interface.

### 2.1 State

```
mapping(uint256 agentId  => Agent) private _agents
mapping(address owner    => uint256[]) private _ownerToAgentIds
uint256 private _nextAgentId  // 1-indexed; 0 reserved for "unset"
```

```
struct Agent {
    address owner;           // wallet that controls this agent
    string  agentCardURI;    // off-chain JSON descriptor (HTTPS or IPFS URI)
    bytes32 agentCardHash;   // SHA-256 hash of the JSON the URI resolves to
    uint64  registeredAt;    // block timestamp at registration
    uint64  updatedAt;       // block timestamp at last update
    bool    active;          // soft-delete flag (true = visible, false = retired)
}
```

**Why both `agentCardURI` AND `agentCardHash`:** the URI tells you where
to fetch the off-chain document; the hash tells you whether what you
fetched is what the merchant committed to. A misbehaving CDN cannot serve
a tampered card without the hash mismatching — clients verify on every
fetch.

### 2.2 Public functions

```
function register(string calldata agentCardURI, bytes32 agentCardHash)
    external
    returns (uint256 agentId);

function update(uint256 agentId, string calldata newURI, bytes32 newHash)
    external;

function setActive(uint256 agentId, bool active) external;

function transferOwnership(uint256 agentId, address newOwner) external;

function getAgent(uint256 agentId) external view returns (Agent memory);
function getAgentsByOwner(address owner) external view returns (uint256[] memory);
function totalAgents() external view returns (uint256);
```

### 2.3 Access control

Plain ownership check. No admin. No multisig.

- `register`: anyone. `msg.sender` becomes `owner`.
- `update` / `setActive` / `transferOwnership`: only `_agents[agentId].owner`.
- All views: anyone.

### 2.4 Events

```
event AgentRegistered(
    uint256 indexed agentId,
    address indexed owner,
    string agentCardURI,
    bytes32 agentCardHash
);

event AgentUpdated(
    uint256 indexed agentId,
    string agentCardURI,
    bytes32 agentCardHash
);

event AgentActiveChanged(uint256 indexed agentId, bool active);

event AgentOwnershipTransferred(
    uint256 indexed agentId,
    address indexed previousOwner,
    address indexed newOwner
);
```

These four events are the entire public log of identity activity. Our
indexer (the new lean replacement for the legacy `merchants` table) replays
them from genesis on cold start and keeps live via WebSocket subscription.

### 2.5 Validation rules (revert reasons)

| Function | Revert when | Error |
|---|---|---|
| `register` | `agentCardURI` is empty | `EmptyURI()` |
| `register` | `agentCardHash` is `bytes32(0)` | `EmptyHash()` |
| `update` | `msg.sender != owner` | `NotOwner()` |
| `update` | agent doesn't exist | `AgentNotFound()` |
| `setActive` | `msg.sender != owner` | `NotOwner()` |
| `transferOwnership` | `msg.sender != owner` | `NotOwner()` |
| `transferOwnership` | `newOwner == address(0)` | `ZeroAddress()` |

---

## 3. ReputationRegistry

ERC-8004's feedback model is **stateless authorization, not on-chain
storage of feedback**. The merchant agent (server) explicitly authorizes a
specific client wallet to leave feedback; the actual feedback is off-chain
and indexed by clients via events.

### 3.1 State

```
// (serverAgentId, clientAddress) → bool authorized
mapping(uint256 => mapping(address => bool)) private _feedbackAuth;

// Optional: bookings settled via BookingEscrow auto-authorize their payer.
// We store the escrow contract address so settled-booking events can
// upsert authorizations without going through the merchant.
address public immutable bookingEscrow;
```

### 3.2 Public functions

```
function acceptFeedback(uint256 serverAgentId, address clientAddress) external;

function revokeFeedback(uint256 serverAgentId, address clientAddress) external;

function isAuthorized(uint256 serverAgentId, address clientAddress)
    external view returns (bool);

// Called by BookingEscrow contract on settlement. Idempotent.
function autoAuthorizeFromBooking(uint256 serverAgentId, address payer) external;
```

### 3.3 Access control

- `acceptFeedback` / `revokeFeedback`: only the agent's owner (lookup via `IdentityRegistry`).
- `autoAuthorizeFromBooking`: only `bookingEscrow` address (set in constructor, immutable).
- Views: anyone.

### 3.4 Events

```
event FeedbackAuthorized(
    uint256 indexed serverAgentId,
    address indexed clientAddress,
    bool autoFromBooking      // distinguishes manual vs auto
);

event FeedbackRevoked(
    uint256 indexed serverAgentId,
    address indexed clientAddress
);
```

### 3.5 Off-chain feedback

Feedback content does **not** live in this contract. Clients (any
indexer, including ours) listen for `FeedbackAuthorized` events and
accept signed feedback messages from the authorized clients via
`/v1/reputation/feedback` API on either:

- the server agent itself (preferred — content lives on the merchant's own
  storage)
- a community indexer (Concourse's, but anyone can run one)

Each feedback is a JSON blob with the user's signature over
`{ serverAgentId, bookingTxHash, rating, body, timestamp }`. The signature
must recover to a `clientAddress` that has `isAuthorized == true`. See
[06_REPUTATION_DESIGN.md](./06_REPUTATION_DESIGN.md) for the full schema,
aggregation algorithm, and Sybil resistance argument.

---

## 4. ValidationRegistry

The third ERC-8004 leg, for one agent to attest that another agent's work
satisfies a specification (e.g., "this hotel claims 5-star certification").
We deploy this **scaffolded but not used** in v1 — there's no validation
flow for tourism merchants in our first product, but the contract exists
on chain so future versions don't require redeploying the registry trio.

### 4.1 State

```
struct ValidationRequest {
    uint256 requesterAgentId;
    uint256 validatorAgentId;
    bytes32 dataHash;       // hash of the spec / claim being validated
    uint64  requestedAt;
    bytes32 resultHash;     // hash of validator's response (0x0 if pending)
    bool    accepted;       // validator's verdict
    uint64  resolvedAt;
}

mapping(bytes32 requestId => ValidationRequest) private _requests;
```

### 4.2 Public functions

```
function requestValidation(uint256 validatorAgentId, bytes32 dataHash)
    external returns (bytes32 requestId);

function submitValidation(bytes32 requestId, bytes32 resultHash, bool accepted)
    external;

function getRequest(bytes32 requestId) external view returns (ValidationRequest memory);
```

### 4.3 v1 status

Deployed but no callers in our reference merchant-agent. Kept on-chain so
future "verified hotel chain" / "city tourism board attestation" features
land without redeployment.

---

## 5. Cross-contract interactions

```
                 ┌──────────────────────┐
                 │  IdentityRegistry    │
                 │  (canonical agents)  │
                 └──────────┬───────────┘
                            │
                            │ getAgent(agentId).owner
                            │
       ┌────────────────────┼─────────────────────────┐
       │                    │                         │
       │ owner check        │ owner check             │ owner check
       ▼                    ▼                         ▼
 ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
 │ ReputationR. │    │ ValidationR.     │    │ BookingEscrow    │
 │              │    │                  │    │ (Phase B)        │
 │ owner can    │    │ owner can        │    │ on settlement    │
 │ authorize    │    │ accept work      │    │ → calls Reputation│
 │ feedback     │    │ validation       │    │   .autoAuthorize │
 └──────────────┘    └──────────────────┘    └──────────────────┘
```

The dependency tree is shallow: every contract reads `IdentityRegistry`
for owner lookups; only `BookingEscrow` writes to `ReputationRegistry`.
Nothing in this trio writes to `IdentityRegistry` other than its own
mutators.

---

## 6. Gas profile (target estimates)

Numbers are approximate; we'll measure in tests. They're targets, not
guarantees, and we avoid clever optimizations until benchmarks justify them.

| Operation | Target gas | Notes |
|---|---|---|
| `register` | ~150K | One sstore for `Agent` struct + array push |
| `update` | ~50K | Two sstore (URI + hash + updatedAt) |
| `setActive` | ~30K | One sstore |
| `transferOwnership` | ~50K | Two sstore + array maintenance |
| `acceptFeedback` | ~45K | Mapping write + event |
| `autoAuthorizeFromBooking` | ~30K | Idempotent mapping write |

On Base, with current gas at ~0.05 gwei, even the heaviest op (`register`)
costs the merchant well under $0.01 USD-equivalent. This is fine.

---

## 7. Testing requirements

Foundry test coverage targets:

- **100% line coverage** on all three contracts.
- **Property tests**: ownership invariants (no path lets a non-owner mutate);
  ID monotonicity (agentId never reused); event consistency (every state
  change emits its event).
- **Fuzz tests**: hash and URI inputs at boundary lengths; malicious URI
  strings (control chars, very long, empty).
- **Fork tests**: against Base Sepolia for integration with real USDC and
  real BookingEscrow once Phase B exists.

Hard rule: zero deploys to mainnet without 100% coverage + fork tests
green for at least one full cycle of dev → staging → prod.

---

## 8. What this contract design does NOT include

These are explicitly *not* in scope for the initial deploy. Each is
discussed in its own doc:

- **Multi-sig agent ownership** — adds upgrade complexity. v1 = single EOA. If a chain wants multi-sig, they use a Safe as the EOA.
- **Permissioned discovery** — anyone can read all events. There's no "private merchant" tier in v1.
- **On-chain pricing or inventory** — these live in agent-card.json + the merchant-agent's own DB. The chain does not store SKU-level data.
- **Cross-chain identity bridging** — agents on Base have no automatic mirror on other chains. If a client wants 0G integration, they look up the Base address and call 0G separately.

---

## 9. Migration from legacy MerchantRegistry

Per [07_MIGRATION_PLAN.md](./07_MIGRATION_PLAN.md): the existing 28
"merchants" on the 0G `MerchantRegistry` are not migrated. The legacy
contract stays deployed (chain history is immutable) but our app stops
reading from it. We mark it deprecated in `README.md` and the legacy
contract address gets a `DEPRECATED — see Base Sepolia ERC-8004 contracts
at <addresses>` notice on chainscan-galileo.

If we *eventually* re-onboard those 28 brands as real merchants, they go
through the same registration flow as everyone else: deploy a
merchant-agent (or sign up for managed hosting), get an `agentCardURI`,
register on Base ERC-8004 IdentityRegistry. No special path.
