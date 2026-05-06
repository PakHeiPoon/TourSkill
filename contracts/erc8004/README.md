# ERC-8004 Trustless Agent Registries

Reference implementation of the ERC-8004 *Trustless Agent* triplet
deployed by TourSkill on Base Sepolia (testnet) and eventually Base
mainnet.

> Spec: [docs/architecture/02_ERC8004_CONTRACT_DESIGN.md](../../docs/architecture/02_ERC8004_CONTRACT_DESIGN.md)
> ([中文版](../../docs/architecture/02_ERC8004_CONTRACT_DESIGN.zh.md))

## What's in here

| Contract | Purpose | Spec § |
|---|---|---|
| `IdentityRegistry.sol` | Canonical "this address owns this agent" record. agentId + agentCardURI + SHA-256 hash. | §2 |
| `ReputationRegistry.sol` | Stateless feedback authorization. Settled bookings auto-authorize their payer. | §3 |
| `ValidationRegistry.sol` | Work-validation requests. v1: deployed but unused; scaffolded for future "verified merchant" attestations. | §4 |
| `IIdentityRegistry.sol` | Minimal interface used by sibling registries to look up owners. | — |

## Status

| Item | Result |
|---|---|
| Tests | **74 passing**, 0 failing |
| Coverage (lines / statements / branches / funcs) | **100% / 100% / 100% / 100%** on each contract |
| Solidity | 0.8.24, evmVersion `cancun` |
| Framework | Foundry 1.2.0 |

## Quickstart

```bash
# from this directory
forge build
forge test
forge coverage --report summary
```

## Deploying

```bash
# 1. Set env vars
export DEPLOYER_PRIVATE_KEY=0x...
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export BASESCAN_API_KEY=...

# Optional: Phase A.2 placeholder — replaced when BookingEscrow ships in Phase B.
# Default is 0x...dEaD which is non-zero (required) but unreachable.
# export BOOKING_ESCROW_PLACEHOLDER=0x000000000000000000000000000000000000dEaD

# 2. Deploy + verify
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  -vvv
```

After deploy, record the addresses in `docs/architecture/DEPLOY_ADDRESSES.md`
and update the merchant-agent template + frontend env vars.

## Hard rules (from architecture principles)

1. **No proxy, no admin keys.** If we need to change the spec, we redeploy
   v2 alongside and let clients migrate (Principle 4: clean slate).
2. **Standards-first.** ERC-8004 interfaces are not forked. If the upstream
   evolves, we follow.
3. **No external dependencies in the contracts themselves.** Only
   `forge-std` for tests. Keeping the bytecode small + auditable.

## Files

```
contracts/erc8004/
├── foundry.toml
├── README.md                                  ← this file
├── lib/forge-std/                             ← test framework only
├── src/
│   ├── IIdentityRegistry.sol
│   ├── IdentityRegistry.sol
│   ├── ReputationRegistry.sol
│   └── ValidationRegistry.sol
├── test/
│   ├── IdentityRegistry.t.sol                  (29 tests)
│   ├── ReputationRegistry.t.sol                (23 tests)
│   └── ValidationRegistry.t.sol                (22 tests)
└── script/
    └── Deploy.s.sol                            (one-shot deploy)
```

## Audit checklist (before mainnet)

- [ ] Internal review by a second Solidity dev
- [ ] Slither static analysis: zero high/critical findings
- [ ] Foundry fork test against Base Sepolia for one full week of activity
- [ ] External audit (Trail of Bits / Spearbit / Cantina)
- [ ] Fix all severity findings, re-audit if scope changes
- [ ] Mainnet deploy via hardware wallet
- [ ] Verify on Basescan day-of
