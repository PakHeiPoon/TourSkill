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
required_env:
  - TOURSKILL_API_BASE       # e.g. http://localhost:8000 (dev) or https://api.tourskill.xyz (prod)
  - TOURSKILL_DEV_MODE       # "true" → skip SIWE auth (local testing only). "false" / unset → require token.
  - TOURSKILL_USER_TOKEN     # JWT, 14d expiry, obtained via SIWE login. Not required when DEV_MODE=true.
  - TOURSKILL_WALLET_ADDRESS # 0x... — same wallet user signed with. Not required when DEV_MODE=true.
endpoints_reference:
  faucet:        https://hub.0g.ai/faucet?network=testnet
  prod_api:      https://api.tourskill.xyz       # to be set when deployed
  prod_console:  https://app.tourskill.xyz       # to be set when deployed
  dev_api:       http://localhost:8000
  dev_console:   http://localhost:5173
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

## 0. Quickstart — Local Testing (read this first)

Before going to production, the user runs the registry backend on their own machine
and points this skill at `http://localhost:8000`. In this mode, **auth is bypassed**
so you can validate the discover → invoke loop against on-chain registered merchants
without the SIWE flow getting in the way.

### Required env for local testing

Tell the user to put this in the agent's `.env`:

```env
TOURSKILL_API_BASE=http://localhost:8000
TOURSKILL_DEV_MODE=true
# TOURSKILL_USER_TOKEN and TOURSKILL_WALLET_ADDRESS not needed in dev mode
```

### 30-second smoke test

Before doing anything else, **verify the backend is reachable**. Run these in order;
if any fails, stop and report the error verbatim — do not proceed to the user's task.

```bash
# 1. Backend up?
curl -s ${TOURSKILL_API_BASE}/health
# expect: {"status":"ok",...}

# 2. Discovery works?
curl -s -X POST ${TOURSKILL_API_BASE}/v1/discover \
  -H "Content-Type: application/json" \
  -d '{"city":"hangzhou","type":"restaurant"}'
# expect: array of merchants with merchant_id, name, skills, etc.

# 3. MCP gateway alive?
curl -s ${TOURSKILL_API_BASE}/mcp/tools/list
# expect: list of 3 tools (discover_merchants, invoke_merchant_skill, get_merchant_details)
```

If all three pass, you're ready. Skip section 1 (it's only for production) and jump
to section 2.

### When to flip to production

Once the user deploys the backend and console (e.g. `api.tourskill.xyz` /
`app.tourskill.xyz`), they update `.env`:

```env
TOURSKILL_API_BASE=https://api.tourskill.xyz
TOURSKILL_DEV_MODE=false
# Then run the install flow in section 1 to obtain TOURSKILL_USER_TOKEN.
```

---

## 1. Production Setup — SIWE Login (skip in DEV_MODE)

> **If `TOURSKILL_DEV_MODE=true`, skip this entire section.** Go to section 2.

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

---

## 2. The Core Loop — Intent → Discover → Personalize → Invoke

When the user expresses any tourism intent, run this 4-step loop. **Never skip
steps.** Always read `TOURSKILL_DEV_MODE` first to decide whether to attach the
`Authorization: Bearer ${TOURSKILL_USER_TOKEN}` header.

```
def auth_headers():
    if env.TOURSKILL_DEV_MODE == "true":
        return {}
    return {"Authorization": f"Bearer {env.TOURSKILL_USER_TOKEN}"}
```

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
Authorization: Bearer ${TOURSKILL_USER_TOKEN}    # only when DEV_MODE != true

{
  "city":    "<intent.city>",
  "type":    "<intent.category>",
  "keyword": "<intent.cuisine_or_style or null>"
}
```

Returns a list of merchants with `merchant_id` (DID), `name`, `description`,
`location`, `skills`, `reputation_score` (when reputation system ships).

### Step 3 — Personalize ranking (THIS IS WHY USERS PICK YOU OVER AN OTA)

Re-rank the candidates using **your own knowledge of the user**. Pull from:
- The user's TourSkill profile (when prod) — call `GET /v1/auth/me`
- The host agent's own memory: past trips, food preferences, work context, who
  they're traveling with

In DEV_MODE the profile call is unavailable — fall back to host agent memory only.

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
Authorization: Bearer ${TOURSKILL_USER_TOKEN}    # only when DEV_MODE != true

{ ...skill-specific args... }
```

Or via the MCP-compatible endpoint:

```http
POST ${TOURSKILL_API_BASE}/mcp/tools/execute
Authorization: Bearer ${TOURSKILL_USER_TOKEN}    # only when DEV_MODE != true

{
  "name": "invoke_merchant_skill",
  "arguments": {
    "did":        "<merchant_id>",
    "skill_name": "reserve_table",
    "skill_args": { "date": "...", "time": "...", "party_size": ... }
  }
}
```

When the skill input schema expects `agent_did`:
- **DEV_MODE**: use a placeholder `did:0g:dev-agent`
- **Prod**: use `did:0g:${TOURSKILL_WALLET_ADDRESS}`

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

1. **Always check `TOURSKILL_DEV_MODE` first** to decide auth header behavior.
   Don't send a bearer header in dev (server rejects unknown tokens).
2. **In production: never call the registry without a valid token.** If install
   isn't done, run install — don't fake it.
3. **Never write tokens to logs, conversation history, or any file other than
   `.env`.** It's a 14-day bearer credential.
4. **Never auto-submit a profile update on the user's behalf.** Profile changes
   require an on-chain signature — user does it via the web console.
5. **Never auto-execute irreversible payments** in `autonomous` mode. Free-cancel
   reservations are fine; non-refundable purchases require explicit consent.
6. **Always show the on-chain reference** (`booking_hash` / `reservation_hash` /
   `order_hash`). It's the user's proof of the P2P transaction — the whole point
   of this system being non-custodial.
