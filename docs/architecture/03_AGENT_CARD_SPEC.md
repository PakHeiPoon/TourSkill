# Agent Card Specification

> Reference: [00_PRINCIPLES.md](./00_PRINCIPLES.md), [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md).
>
> Standard: A2A *Agent Card* (Google A2A protocol). We adopt the upstream
> JSON schema verbatim and use the spec's `extensions` field for
> Concourse-specific fields. The full spec is at
> `https://google.github.io/A2A/`. This doc summarizes what every
> merchant-agent in our network MUST serve.

The agent-card is the **bridge document** between on-chain identity (a
hash and a URI in `IdentityRegistry`) and an actually callable HTTP
agent. It tells a discovering user-agent: who this agent is, what skills
it offers, how to authenticate, where to send payments, and what
capabilities it supports.

---

## 1. Hosting requirements

Every Concourse merchant-agent MUST:

- Serve the agent-card at the canonical path `/.well-known/agent-card.json`.
- Return `application/json` with `Cache-Control: public, max-age=300` (5 min).
- Use HTTPS. No exceptions, including in dev (use `mkcert` if needed).
- Match the SHA-256 hash committed in `IdentityRegistry.agentCardHash`
  exactly (byte-for-byte). Updating the card requires both:
  1. Update the hosted JSON.
  2. Call `IdentityRegistry.update(agentId, sameURI, newHash)`.

If the on-chain hash and the served JSON disagree, **clients MUST treat the
agent as untrusted**. Our reference user-agent code makes this a hard
failure, not a warning.

---

## 2. Top-level schema (A2A standard fields)

```jsonc
{
  // Required by A2A
  "schemaVersion": "1.0",                  // A2A schema version
  "name": "Wuming Chu Huangshan Hidden Retreat",
  "description": "28-room boutique hideaway in Huangshan ...",
  "url": "https://wumingchu.concourse.example",  // base URL of this agent
  "version": "0.3.2",                       // merchant-agent's own semver

  // Skills exposed by this agent
  "skills": [
    {
      "name": "check_availability",
      "description": "Check room availability for a date range and room type.",
      "inputSchema": {                      // JSON Schema for invocation args
        "type": "object",
        "properties": {
          "check_in":  { "type": "string", "format": "date" },
          "check_out": { "type": "string", "format": "date" },
          "room_type": { "type": "string", "enum": ["king","twin","suite","villa"] }
        },
        "required": ["check_in","check_out","room_type"]
      },
      "outputSchema": { /* JSON Schema for response */ },
      "endpoint": "/skills/check_availability"  // relative to "url" above
    },
    { "name": "create_booking", ... },
    { "name": "get_cancellation_policy", ... }
  ],

  // Optional A2A capabilities flags
  "capabilities": {
    "streaming": false,                     // we don't SSE-stream skill responses in v1
    "pushNotifications": false,             // no webhooks in v1
    "stateTransitionHistory": true          // we expose booking status history
  },

  // How the agent authenticates incoming calls
  "authentication": {
    "schemes": ["bearer", "eip191"],        // see §4
    "challengeEndpoint": "/auth/challenge",
    "verifyEndpoint":    "/auth/verify"
  },

  // What human-readable interfaces we serve (mostly informational)
  "interfaces": ["application/json"],

  // Concourse-specific extensions — namespaced
  "extensions": {
    "tourskill.org/v1/payment":      { ... },
    "tourskill.org/v1/cancellation": { ... },
    "tourskill.org/v1/location":     { ... },
    "tourskill.org/v1/merchant":     { ... },
    "tourskill.org/v1/i18n":         { ... }
  },

  // Provenance — used by indexers to verify against IdentityRegistry
  "provenance": {
    "agentId": 42,                          // ERC-8004 agent ID
    "registry": "0xABCD...",                // IdentityRegistry contract addr
    "chain":    "base-sepolia",             // chain ID alias
    "owner":    "0x5A0Ccd...44E7"
  }
}
```

---

## 3. Skill definition

Each entry in `skills[]` is the public contract for invoking that
capability. The format follows the OpenAI tool-call standard so any LLM
that supports tool calls can consume it as-is.

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Unique within this agent. Snake_case ASCII. |
| `description` | yes | One sentence; consumed by LLMs for tool selection. |
| `inputSchema` | yes | JSON Schema. Strict — extras are rejected. |
| `outputSchema` | yes | JSON Schema for the success response. |
| `endpoint` | yes | URL path relative to top-level `url`. |
| `pricing` | optional | x402 hint — see §5. Absent means free. |
| `idempotencyKey` | optional | If `"required"`, callers must include `Idempotency-Key` header. Booking endpoints MUST require this. |
| `language` | optional | Override of top-level i18n preference for this skill. |

Strict mode for input validation: if a caller supplies a field not in the
schema, the server returns `400 Bad Request`. No tolerance.

---

## 4. Authentication

Two schemes are supported, declared in `authentication.schemes[]`:

### 4.1 `bearer`

Standard bearer token from a successful Concourse auth flow.

```
Authorization: Bearer <token>
```

The token is minted via the merchant-agent's `/auth/challenge` →
`/auth/verify` flow (mirrors our existing Concourse auth, so the same
EIP-191 challenge-response works).

### 4.2 `eip191`

Direct EIP-191 signature for one-shot calls without prior token mint.
Useful for agent-to-agent calls where the caller doesn't want session state.

```
Authorization: EIP191 <hex signature>
X-Agent-Address: 0x... (the recovered address)
X-Request-Hash: 0x... (sha256 of canonical JSON of request body)
X-Request-Nonce: 0x...
```

The agent verifies `ecrecover(requestHash, signature) == X-Agent-Address`
and that the nonce isn't replayed.

**Both schemes are mutually exclusive per request.** Sending both is a 400.

---

## 5. Concourse extensions (versioned)

All Concourse-specific fields live under `extensions["tourskill.org/v1/*"]`.
Versioning the namespace lets us evolve the schema without breaking old
clients.

### 5.1 `tourskill.org/v1/payment`

```jsonc
{
  "method": "x402",                         // currently the only supported method
  "facilitator": "https://x402.coinbase.com", // OR self-hosted
  "chain": "base-sepolia",                  // alias from CAIP-2 chain registry
  "payoutAddress": "0xMERCHANT...",         // where USDC settles after dispute window
  "currency": "USDC",                       // address of USDC contract on chain
  "currencyAddress": "0x036CbD53...",
  "escrow": {                               // BookingEscrow contract on this chain
    "contract": "0xESCROW...",
    "disputeWindowSeconds": 86400           // 24h after booking-end-date
  }
}
```

### 5.2 `tourskill.org/v1/cancellation`

```jsonc
{
  "type": "tiered",
  "tiers": [
    { "hoursBeforeStart": 168, "refundPercent": 100 },   // 7d+: full refund
    { "hoursBeforeStart": 72,  "refundPercent": 50 },    // 3d+: half refund
    { "hoursBeforeStart": 0,   "refundPercent": 0 }      // <3d: no refund
  ],
  "freeReschedulingHours": 48
}
```

The `BookingEscrow` contract reads this off-chain (the merchant-agent
encodes it in `release()` calls) — it's not on-chain, but it's the
authoritative source the agent enforces.

### 5.3 `tourskill.org/v1/location`

```jsonc
{
  "country": "CN",
  "city": "huangshan",                       // lowercase, used by indexer
  "address": "安徽省黄山市黄山风景区云谷寺路侧",
  "coordinates": { "lat": 30.1372, "lng": 118.1856 },
  "timezone": "Asia/Shanghai"
}
```

### 5.4 `tourskill.org/v1/merchant`

```jsonc
{
  "type": "hotel",                          // hotel | restaurant | attraction | shop
  "tags": ["boutique","retreat","hot-spring"],
  "priceLevel": 5,                          // 1-5 (¥-¥¥¥¥¥)
  "languagesSupported": ["zh","en"],
  "specifics": {                            // type-specific fields
    "starRating": 5,
    "roomTypes": ["king","twin","suite","villa"],
    "checkInTime":  "15:00",
    "checkOutTime": "12:00"
  }
}
```

### 5.5 `tourskill.org/v1/i18n`

```jsonc
{
  "name":        { "zh": "无名初隐世酒店", "en": "Wuming Chu ..." },
  "description": { "zh": "...",          "en": "..." }
}
```

When set, clients localize using the user's preferred language.

---

## 6. Provenance verification

Every consumer of an agent-card MUST validate provenance before trusting
it:

1. Fetch the JSON from the URI in `IdentityRegistry.getAgent(agentId).agentCardURI`.
2. Compute SHA-256 of the bytes received (canonical form: no
   re-serialization; verify the wire bytes directly).
3. Compare with `IdentityRegistry.getAgent(agentId).agentCardHash`. **Mismatch = abort.**
4. Verify `provenance.agentId` and `provenance.registry` in the JSON
   match the on-chain record (defense against URL aliasing attacks).

This is the same trust-on-fetch model as Subresource Integrity for
`<script>` tags. The chain holds the truth; the off-chain document is just
the convenient shape.

---

## 7. Required vs optional fields summary

**Required for every Concourse merchant-agent:**
- `schemaVersion`, `name`, `description`, `url`, `version`
- `skills[]` (≥1 skill)
- `authentication.schemes[]` (≥1 scheme)
- `extensions["tourskill.org/v1/payment"]` (full block)
- `extensions["tourskill.org/v1/location"]`
- `extensions["tourskill.org/v1/merchant"]`
- `provenance` (all four fields)

**Optional but recommended:**
- `extensions["tourskill.org/v1/cancellation"]`
- `extensions["tourskill.org/v1/i18n"]`
- `interfaces[]` for richer modalities (image responses for restaurant menus, etc.)

---

## 8. Versioning & evolution

- The A2A `schemaVersion` follows upstream A2A spec.
- Concourse extension namespace is `tourskill.org/v1/*`. Breaking changes
  bump to `v2`, and v1 stays supported for at least 6 months.
- `version` (top-level, semver) is the merchant-agent's own software
  version — useful for monitoring + bug-triage but not consumed by
  clients except as informational.

When Concourse ships v2 of any extension, the merchant-agent template
will support both via dual-emit. Merchants on managed hosting get
auto-upgraded; self-hosted merchants update at their pace.

---

## 9. Example — full card for the reference seed merchant

A canonical example is checked in at
`packages/merchant-agent-template/examples/wumingchu.agent-card.json` once
the template repo lands. Indexer test fixtures use this file.
