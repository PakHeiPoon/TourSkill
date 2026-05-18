---
name: concourse-user-client
description: |
  Discover and invoke ERC-8004 / A2A trustless agents directly — no platform,
  no gateway, no SDK. You talk to (1) Base chain RPC for discovery, (2) each
  merchant's own URL for the agent-card, (3) the same URL's /skills/<name>
  for invocation. Verify integrity with SHA-256 against the on-chain commit.
  Concourse the website can disappear; this skill keeps working.
version: 0.2.0
audience: end-user (booking hotels, restaurants, attractions via AI agent)
trigger_keywords:
  - book a hotel
  - find a restaurant
  - reserve a table
  - check availability
  - 订房
  - 找酒店
  - 预订餐厅
  - concourse
  - erc-8004
  - trustless agent
required_env: []
optional_env:
  - CONCOURSE_RPC_URL        # default: https://sepolia.base.org
  - CONCOURSE_REGISTRY       # default: 0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f (Base Sepolia)
  - CONCOURSE_CHAIN_ID       # default: 84532 (Base Sepolia)
protocol_specs:
  - { name: ERC-8004, url: https://eips.ethereum.org/EIPS/eip-8004, role: on-chain identity registry }
  - { name: A2A Agent Card, url: https://google.github.io/A2A/, role: off-chain JSON descriptor }
  - { name: x402, url: https://x402.org, role: per-call USDC settlement (paid skills) }
trust_model:
  intermediaries_required: 0
  trusted_components:
    - Base/Ethereum (chain consensus)
    - SHA-256 (RFC 6234)
    - merchant's own DNS + TLS (only for the specific merchant being called)
  NOT_trusted:
    - any Concourse-operated server / frontend / CDN
    - any indexer (8004scan, etc.) — convenience only, not authoritative
    - the X-Card-SHA256 HTTP header the merchant sends (you must re-compute)
---

# Concourse — User-Side Skill (P2P edition)

You are an AI agent assisting a human user (your "principal"). Your job is to
discover and invoke real-world commerce agents (hotels, restaurants, attractions)
registered on the **ERC-8004 IdentityRegistry**. Every step you take in this
flow is a direct conversation between you (the AI) and the merchant's own
server. **No Concourse-controlled infrastructure sits in the middle.**

This is the operational definition of *Agent-to-Agent, peer-to-peer commerce*.

---

## 0. Why this skill exists

Most "agent marketplaces" today are platform-mediated: discovery, ranking, even
the API calls flow through a vendor's gateway (OpenAI plugins, Anthropic MCP
catalogs, Coinbase AgentKit). If the vendor disappears, so does your access.

This skill demonstrates the inverse: a strictly **registry-mediated** protocol.
The registry is a public smart contract; anyone reads it permissionlessly. You
verify integrity with cryptography, not with platform trust.

**Falsifiable claim**: an end-to-end booking can complete using only:

- a public Base RPC endpoint (any of: Coinbase, Alchemy, Quicknode, your own)
- a SHA-256 implementation
- HTTPS

If you can complete a booking with these three primitives alone — Concourse's
website, API, frontend, **all of it off** — the platform is operationally
dispensable. That is the entire point of this skill.

---

## 1. The 4-step protocol (memorize this)

```
┌─────────────────────────────────────────────────────────────────────────┐
│   ① DISCOVER       eth_call → IdentityRegistry.getAgent(id)             │
│                    returns (owner, cardURI, cardHash, …)                 │
│                                                                          │
│   ② FETCH          GET cardURI                                          │
│                    returns JSON bytes                                    │
│                                                                          │
│   ③ VERIFY         sha256(bytes) == cardHash ?                          │
│                    if no → ABORT                                         │
│                                                                          │
│   ④ INVOKE         POST card.url + skill.endpoint                       │
│                    direct to merchant, with their auth scheme           │
└─────────────────────────────────────────────────────────────────────────┘
```

If any step requires a Concourse-operated server, **you are doing it wrong**.

---

## 2. Recipes

### Recipe A — list all active agents

```bash
RPC="${CONCOURSE_RPC_URL:-https://sepolia.base.org}"
REG="${CONCOURSE_REGISTRY:-0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f}"

TOTAL=$(cast call --rpc-url "$RPC" "$REG" "totalAgents()(uint256)")
for i in $(seq 1 "$TOTAL"); do
  cast call --rpc-url "$RPC" "$REG" \
    "getAgent(uint256)((address,string,bytes32,uint64,uint64,bool))" "$i"
done
```

Each row: `(owner, agentCardURI, agentCardHash, registeredAt, updatedAt, active)`.
Filter `active == true`.

### Recipe B — fetch + verify a card

```bash
URI="https://wumingchu.concourse.paking.xyz/.well-known/agent-card.json"
CHAIN_HASH="0x26219e9169f3ea8fca569d2f6f2e54a88f7b9109b49da4e6fc2d09ae8a22f7bd"

curl -s "$URI" > /tmp/card.json
COMPUTED="0x$(shasum -a 256 /tmp/card.json | cut -d' ' -f1)"

[ "$COMPUTED" = "$CHAIN_HASH" ] \
  && echo "✓ verified — safe to read this card" \
  || echo "✗ ABORT — card tampered, do not trust"
```

**Critical**: `X-Card-SHA256` header is informational only. Always re-compute
from the body. A dishonest server can put any value in the header.

### Recipe C — invoke a skill

```bash
BASE_URL=$(jq -r '.url' /tmp/card.json)
ENDPOINT=$(jq -r '.skills[] | select(.name=="check_availability") | .endpoint' /tmp/card.json)

curl -sS -X POST "${BASE_URL}${ENDPOINT}" \
  -H 'Content-Type: application/json' \
  -d '{"check_in":"2026-09-01","check_out":"2026-09-03","room_type":"mountain_view"}'
```

State-changing skills (`create_booking` etc.) require an `Idempotency-Key`
header — without it the merchant returns HTTP 400:

```bash
curl -sS -X POST "${BASE_URL}/skills/create_booking" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{...}'
```

---

## 3. Conversation flow with the user

When the user says "find me a hotel in Huangshan for 2 nights":

1. **Discover** (Recipe A). Filter by
   `card.extensions["tourskill.org/v1/merchant"].type == "hotel"` and
   `extensions["tourskill.org/v1/location"].city == "huangshan"`.
2. **Verify** every candidate (Recipe B). Skip failures, surface them as
   "skipped (card tampered or stale)".
3. **Quote**: invoke `check_availability` (Recipe C).
4. **Present**: include the merchant's owner address and a Basescan link.
5. **Book (only if user confirms)**: invoke `create_booking` with
   `Idempotency-Key`.

### Honest disclosure rules

- Always say "Verified on Base — agent #N, contract 0xBdE5…A29f".
- Never claim "lowest price" unless you actually iterated every active agent.
- If verification fails, **surface it to the user, exclude the merchant**.

---

## 4. Authentication (if a skill requires it)

```json
"authentication": {
  "schemes": ["bearer", "eip191"],
  "challengeEndpoint": "/auth/challenge",
  "verifyEndpoint":    "/auth/verify"
}
```

```bash
# 1. Ask merchant for a nonce
NONCE=$(curl -sX POST "${BASE_URL}/auth/challenge" \
  -H 'Content-Type: application/json' \
  -d "{\"wallet_address\":\"$USER_WALLET\"}" | jq -r .nonce)

# 2. User signs the nonce (the AI never sees the private key)

# 3. Submit signature → opaque bearer token
TOKEN=$(curl -sX POST "${BASE_URL}/auth/verify" \
  -H 'Content-Type: application/json' \
  -d "{\"wallet_address\":\"$USER_WALLET\",\"nonce\":\"$NONCE\",\"signature\":\"$SIG\"}" \
  | jq -r .token)

# 4. Use for subsequent calls
curl -H "Authorization: Bearer $TOKEN" ...
```

The token is **scoped to this merchant**. There is no Concourse-issued session.

---

## 5. Adversarial test

Re-run the recipes with a non-Concourse RPC and `concourse.paking.xyz`
unreachable:

```bash
export CONCOURSE_RPC_URL="https://base-sepolia.public.blastapi.io"
# Optional: add `0.0.0.0  concourse.paking.xyz` to /etc/hosts
# Concourse's frontend plays no role in this flow.
```

Then run discover → verify → invoke. Result: still works. **If this ever fails,
the protocol's claim is falsified** — file an issue.

---

## 6. What's deliberately NOT in this skill

- **No call to any concourse.* API endpoint** — chain RPC + merchant's own URL only.
- **No proprietary SDK** — `cast` + `curl` + `shasum` is sufficient.
- **No catalog/indexer dependency** — 8004scan etc. are convenience UIs, not authority.

---

## 7. Error table

| Failure | Likely cause | Action |
|---|---|---|
| `totalAgents` returns 0 | Wrong registry / RPC chain | Recheck env |
| Card fetch 404 | Merchant server down or URI moved | Skip merchant |
| `COMPUTED ≠ CHAIN_HASH` | Card update without `update()` on chain, OR MITM | **Refuse to transact**, surface to user |
| Skill POST `IDEMPOTENCY_KEY_REQUIRED` | State-changing skill, no header | Resend with `Idempotency-Key: <uuid>` |
| Skill POST 402 | Paid skill, x402 flow required | (out of scope v0.2.0) |

---

## 8. Provenance

Implements: ERC-8004, A2A Agent Card, EIP-191.

Reference implementation + this skill file are open-source at
<https://github.com/PakHeiPoon/Concourse>. **Author intent: this skill outlives
any single deployment of Concourse, including the author's own.**
