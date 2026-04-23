---
name: tourskill-user-client
description: |
  Discover and invoke tourism merchants (hotels, restaurants, attractions) on the
  TourSkill decentralized A2A registry. Personalizes results with the user's profile
  (preferences, allergens, history) and lets the agent reserve / book / purchase on
  the user's behalf — peer-to-peer, no OTA platform fees.
version: 0.1.0
trigger_keywords:
  - book a hotel
  - find a restaurant
  - reserve a table
  - 订房
  - 订餐
  - 找餐厅
  - tourskill
  - travel agent
default_api_base: https://backend-lilac-xi-18.vercel.app   # public gateway — works out of the box
optional_env:
  - TOURSKILL_API_BASE       # override if self-hosting. Default: the public gateway above.
  - TOURSKILL_DEV_MODE       # "true" (default while SIWE is being built) → skip auth. Future: set to "false" once SIWE ships.
  - TOURSKILL_USER_TOKEN     # [FUTURE] JWT bearer, 14d expiry. Not required yet — SIWE flow is roadmap.
  - TOURSKILL_WALLET_ADDRESS # [FUTURE] 0x... — paired with TOURSKILL_USER_TOKEN.
endpoints_reference:
  public_api:    https://backend-lilac-xi-18.vercel.app
  faucet:        https://hub.0g.ai/faucet?network=testnet
  dev_api:       http://localhost:8000   # only if self-hosting the gateway
chain:
  network: 0g_testnet
  chain_id: 16602
  rpc: https://evmrpc-testnet.0g.ai
  registry_contract: "0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543"
---

# TourSkill — User Client Skill

You (the agent) help your principal (the human user) interact directly with tourism
merchants on the TourSkill decentralized registry. No platform middleman, no
algorithmic ranking — you discover merchants on-chain, personalize results from
the user's own context, and invoke executable skills (menu, booking, ticketing) via
MCP-compatible HTTP calls.

---

## 0. Quickstart — Zero Config (read this first)

This skill works **out of the box** against the public TourSkill gateway at
`https://backend-lilac-xi-18.vercel.app`. No env vars required, no auth setup,
no local backend to run. Just read the rest of this file and start using the
endpoints in Section 2.

The public gateway reads the 28 already-registered merchants from the on-chain
`MerchantRegistry` contract (0G testnet, chainId 16602). You don't register
anything — you consume what's already there.

### (Optional) Override the API base

If you self-host the gateway or want to point at a preview deployment, set:

```env
TOURSKILL_API_BASE=http://localhost:8000   # or your own URL
```

Otherwise, assume `TOURSKILL_API_BASE=https://backend-lilac-xi-18.vercel.app`
everywhere in this document.

### 15-second smoke test

Before doing anything else, **verify the gateway is reachable**. If any step
fails, report the error verbatim — do not proceed.

```bash
BASE="${TOURSKILL_API_BASE:-https://backend-lilac-xi-18.vercel.app}"

# 1. Gateway up?
curl -s "$BASE/health"
# expect: {"status":"ok"}

# 2. Discovery returns on-chain merchants?
curl -s -X POST "$BASE/v1/discover" \
  -H "Content-Type: application/json" \
  -d '{"city":"hangzhou","type":"restaurant"}'
# expect: 3 Hangzhou restaurants (Zhi Wei Guan, Green Tea Restaurant,
#         Grandma's Kitchen) with their DIDs and skills

# 3. MCP tools listed?
curl -s "$BASE/mcp/tools/list"
# expect: 3 tools (discover_merchants, invoke_merchant_skill, get_merchant_details)
```

All three pass → skip Section 1 (auth roadmap) and go straight to Section 2.

---

## 1. Auth (Roadmap — not yet enforced)

The current public gateway is **open-read**: no token required. A SIWE-based
auth layer is on the roadmap to prevent bot abuse once traffic ramps. When it
ships, this section will describe the login flow. **For now, ignore
TOURSKILL_USER_TOKEN and TOURSKILL_WALLET_ADDRESS** — calls work without them.

<details>
<summary>Planned SIWE flow (click to expand)</summary>

In production, every registry call requires a JWT bearer token bound to a 0G testnet
wallet. The user obtains this token by signing a one-time SIWE message in their
browser. Token is valid 14 days.

### Check current state

```
if TOURSKILL_USER_TOKEN missing OR TOURSKILL_WALLET_ADDRESS missing:
    → run install flow (1.1)
else:
    → call GET ${TOURSKILL_API_BASE}/v1/auth/me
      → 200: ready
      → 401: token expired, run re-login (1.3)
```

### 1.1 Install flow — guide the user through SIWE

Walk the user through these steps **conversationally**.

1. **Confirm wallet readiness.**
   > "TourSkill uses 0G testnet for identity. Do you have a wallet (MetaMask, Rabby, etc.)
   > with a small amount of 0G testnet tokens for gas? If not, grab some from
   > https://hub.0g.ai/faucet?network=testnet first."

2. **Open the login page.**
   > "Open this link in your browser and click *Sign in with Wallet*:
   > **`${TOURSKILL_CONSOLE_BASE:-https://app.tourskill.xyz}/login?source=agent`**
   >
   > Your wallet pops up to sign a message (no gas, just signature). After signing,
   > the page shows a **token** and your **wallet address** — paste both back to me."

3. **Persist credentials.** Write to `.env`:
   ```
   TOURSKILL_USER_TOKEN=eyJhbGciOiJIUzI1NiIs...
   TOURSKILL_WALLET_ADDRESS=0x1a2b3c...def
   ```

4. **Verify** with `GET ${TOURSKILL_API_BASE}/v1/auth/me`. Expect 200.

### 1.2 (Optional) Profile enrichment

After install, **offer** to direct the user to `${TOURSKILL_CONSOLE_BASE}/profile`
to add personalization context (dietary restrictions, allergens, budget tier, travel
style, languages). Profile updates require a fresh on-chain signature — user pays
gas (~free on testnet). **Never** auto-submit profile changes on the user's behalf.

### 1.3 Token expired — re-login

When you get `401 token_expired`, just rerun **1.1 step 2 onwards**. Old tokens are
implicitly revoked the moment a new one is issued (server tracks `min_valid_iat` per
wallet).

### 1.4 Logout / kill switch

If the user says *"log me out"* or *"my wallet might be compromised"*:
- `POST ${TOURSKILL_API_BASE}/v1/auth/logout` with current bearer token
- Delete `TOURSKILL_USER_TOKEN` and `TOURSKILL_WALLET_ADDRESS` from `.env`
- Confirm: *"Logged out. All tokens for this wallet are now invalid."*

</details>

---

## 2. The Core Loop — Intent → Discover → Personalize → Invoke

When the user expresses any tourism intent, run this 4-step loop. **Never skip
steps.** Today the public gateway accepts unauthenticated calls — no bearer
header needed. Once SIWE ships, add `Authorization: Bearer ${TOURSKILL_USER_TOKEN}`
to each request.

### Step 1 — Classify intent

Extract a structured intent from the user's natural-language request. Don't ask
the user to fill a form — infer everything you can, then ask **at most one**
clarifying question if a critical field is missing.

```
intent = {
  category:      "restaurant" | "hotel" | "attraction",
  city:          str (lowercase, e.g. "hangzhou"),
  date:          ISO date | null,
  time:          "HH:MM" | null,
  party_size:    int | null,
  budget_per_person: int | null,   # CNY
  cuisine_or_style:  str | null,   # e.g. "本帮菜", "lake view"
  must_haves:    [str],            # e.g. ["wheelchair access", "private room"]
}
```

**Critical fields per category** (if missing, ask):
- restaurant → `city`, `date`, `party_size`
- hotel → `city`, `check_in`, `check_out`, `guests`
- attraction → `city`, `date`

### Step 2 — Discover candidates

```http
POST ${TOURSKILL_API_BASE}/v1/discover
Content-Type: application/json

{
  "city":    "<intent.city>",
  "type":    "<intent.category>",
  "keyword": "<intent.cuisine_or_style or null>"
}
```

Returns a list of merchants with `merchant_id` (DID), `name`, `description`,
`location`, `skills`, `reputation_score` (when reputation system ships).

### Step 3 — Personalize ranking (THIS IS WHY USERS PICK YOU OVER AN OTA)

Re-rank the candidates using **your own knowledge of the user**. Pull from the
host agent's own memory: past trips, food preferences, dietary restrictions,
budget, work context, who they're traveling with. A TourSkill-native profile
endpoint (`GET /v1/auth/me`) is on the roadmap — until then, lean entirely on
the host agent's memory.

Apply this scoring (suggested weights):

| Signal | Weight |
|---|---|
| Hard constraints met (allergens, accessibility, budget cap) | **filter** (drop if violated) |
| Match against user's stated cuisine/style preferences | +3 |
| Match against past positive choices in this city | +2 |
| Reputation score (when available) | +2 |
| Distance from user's stated location/hotel | +1 |
| Novelty bonus (user hasn't tried this merchant before) | +1 |

**Do not blindly trust registry order.** OTA-style ranking is exactly what this
project exists to disrupt. Your re-ranking is the user's edge.

### Step 4 — Decide & invoke

| Mode | When | Behavior |
|---|---|---|
| **`assisted`** (default) | Default, OR action involves payment / commitment | Show top 3 with one-line WHY each, ask user to pick |
| **`autonomous`** | User said *"just book it"* / *"surprise me"* AND action is reversible (free-cancel) | Pick #1, invoke, summarize what was done + how to undo |

**Invocation:**

```http
POST ${TOURSKILL_API_BASE}/v1/merchants/{merchant_id}/{skill_name}
Content-Type: application/json

{ ...skill-specific args... }
```

Or via the MCP-compatible endpoint:

```http
POST ${TOURSKILL_API_BASE}/mcp/tools/execute
Content-Type: application/json

{
  "name": "invoke_merchant_skill",
  "arguments": {
    "did":        "<merchant_id>",
    "skill_name": "reserve_table",
    "skill_args": { "date": "...", "time": "...", "party_size": ... }
  }
}
```

When the skill input schema expects `agent_did`, use `did:0g:dev-agent` for
now. Once SIWE ships, use `did:0g:${TOURSKILL_WALLET_ADDRESS}`.

---

## 3. Skill Catalog (what you can invoke)

Always check the merchant's `skills` array from discover response — only invoke
skills the merchant declares.

| Category | Skills |
|---|---|
| **Restaurant** | `check_table_availability`, `get_menu`, `reserve_table`, `get_dietary_options` |
| **Hotel** | `check_availability`, `get_rates`, `create_booking`, `get_cancellation_policy` |
| **Attraction** | `check_ticket_inventory`, `get_opening_hours`, `purchase_ticket`, `get_visitor_guide` |

For exact input schemas:

```http
GET ${TOURSKILL_API_BASE}/v1/merchants/{merchant_id}/skills
```

---

## 4. Reporting Back to the User

After every booking / reservation / purchase:

```
✅ <action> completed
   Merchant:  <name (zh + en if available)>
   Reference: <booking_id / reservation_id / order_id>
   When:      <date + time>
   Total:     ¥<amount>
   Free-cancel before: <deadline>
   On-chain proof:     <reservation_hash> (anchored to 0G chain)
```

If anything failed, surface the error verbatim — don't paper over it.

---

## 5. Future Hooks (do not implement yet)

- **`x402_payment_handler`** — agent-to-agent micropayments via HTTP 402. Currently:
  payment URL is passed to the user.
- **`reputation_signal`** — `reputation_score` field + `POST /v1/reputation/review`
  after transactions. Currently: skip the review prompt.

---

## 6. Hard Rules (do not violate)

1. **Never fabricate merchant data.** If discover returns 0 results, tell the
   user that — don't invent restaurants.
2. **Never write tokens to logs, conversation history, or any file other than
   `.env`.** Once SIWE ships, the bearer token is a 14-day credential and
   leaks matter.
3. **Never auto-submit a profile update on the user's behalf.** When profile
   endpoints land, changes will require an on-chain signature the user must do
   in-browser.
4. **Never auto-execute irreversible payments** in `autonomous` mode. Free-cancel
   reservations are fine; non-refundable purchases require explicit consent.
5. **Always show the on-chain reference** (`booking_hash` / `reservation_hash` /
   `order_hash` / `merchant_did`). It's the user's proof of the P2P transaction
   — the whole point of this system being non-custodial.
