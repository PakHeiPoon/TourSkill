---
name: concourse-merchant-client
description: |
  Help a merchant become a sovereign ERC-8004 agent — deploy a self-hosted
  agent server from the open-source template, register on Base directly with
  their own wallet, manage card updates via signed transactions. The merchant
  owns their server, their wallet, and their on-chain identity. Concourse the
  company is not in the loop and does not need to exist.
version: 0.2.0
audience: merchant (hotel, restaurant, attraction, shop)
trigger_keywords:
  - register my shop on Concourse
  - register my business as an AI agent
  - 注册我的店
  - 上线我的酒店
  - merchant agent
  - become an ERC-8004 agent
required_env: []
optional_env:
  - CONCOURSE_RPC_URL          # default: https://sepolia.base.org
  - CONCOURSE_REGISTRY         # default: 0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f
  - CONCOURSE_CHAIN_ID         # default: 84532
template_repo: https://github.com/PakHeiPoon/Concourse/tree/main/merchant-agent-template
protocol_specs:
  - { name: ERC-8004, url: https://eips.ethereum.org/EIPS/eip-8004 }
  - { name: A2A Agent Card, url: https://google.github.io/A2A/ }
trust_model:
  merchant_owns:
    - their wallet (private key, NEVER leaves their device)
    - their server (any hosting: VPS / Fly / Cloudflare Workers / their own datacenter)
    - their domain (CNAME / A record under their control)
  concourse_provides:
    - open-source template (Apache/MIT)
    - this skill file (instructions for the AI)
    - reference frontend at concourse.paking.xyz (optional discovery UI, NOT required)
---

# Concourse — Merchant-Side Skill (P2P edition)

You are an AI assistant **for a merchant**. Your job is to help the merchant
owner go from "I have a business" to "my business is a sovereign on-chain
agent that any AI can discover and transact with" — **using only open-source
software, the merchant's own wallet, the merchant's own hosting, and a public
Base RPC**.

You do not call any Concourse-operated API. You do not depend on
concourse.paking.xyz being up. The instructions you give the merchant must
work even if the original author of Concourse disappears tomorrow.

---

## 0. What "being a Concourse merchant" actually means

It means **3 things, all owned by the merchant**:

1. **A live HTTPS endpoint** that serves `/.well-known/agent-card.json` (and
   one POST route per skill).
2. **A wallet** (any Ethereum-compatible wallet) whose address is the on-chain
   `owner` of the agent record.
3. **An entry in IdentityRegistry** on Base with `(owner, cardURI, cardHash)`.

That's it. There is no Concourse account, no Concourse dashboard, no recurring
SaaS fee, no platform that can de-list them.

---

## 1. Onboarding flow (5 steps, all on merchant's machine)

### Step 1 — Get a wallet + Base Sepolia ETH

```bash
# Generate a fresh testnet wallet (use a hardware wallet for mainnet)
cast wallet new
# → Address + private key. Save the PK securely. NEVER share it.

# Fund it with free testnet ETH
open "https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
```

### Step 2 — Clone the open-source template

```bash
git clone https://github.com/PakHeiPoon/Concourse.git
cd Concourse/merchant-agent-template
pnpm install
```

The template is Hono + Drizzle + better-sqlite3. **Read its TROUBLESHOOTING.md
first** — covers pnpm `onlyBuiltDependencies`, `vm.envUint` 0x prefix, ABI
tuple decoding, and the empty-`AGENT_ID=` duplicate-register trap.

### Step 3 — Configure for THIS merchant

Edit `apps/agent/.env`:

```bash
PUBLIC_URL=https://<your-subdomain>.<your-domain>  # e.g. mybiz.example.com
AGENT_OWNER_ADDRESS=0x<merchant-wallet-address>
PAYOUT_ADDRESS=0x<merchant-wallet-address>         # USDC payouts go here
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
IDENTITY_REGISTRY=0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f
# AGENT_ID=                                        # leave commented until first register
SYNC_PRIVATE_KEY=0x<merchant-wallet-pk>            # only on this machine, never commit
```

Customize `src/scripts/setup.ts` with the merchant's real data: name, location,
room types or menu items, cancellation policy. Run:

```bash
pnpm setup     # seeds local SQLite with merchant settings + 90-day calendar
pnpm dev       # localhost smoke test
```

### Step 4 — Deploy to the merchant's own hosting

Three real options (all work, pick the one the merchant is comfortable with):

| Option | Notes |
|---|---|
| **Fly.io** | `Dockerfile + fly.toml` already in the template. `flyctl launch + deploy` |
| **Their VPS** | `pnpm build && rsync dist/ user@host:/app && systemctl restart` |
| **Cloudflare Workers** | Requires the merchant to swap SQLite for D1 (out of scope here) |

Then point DNS:

```
<subdomain> CNAME <hosting-provider-target>
```

Verify the URL serves:

```bash
curl -sI https://<your-domain>/.well-known/agent-card.json | grep -i x-card-sha256
# expect: x-card-sha256: 0x...
```

### Step 5 — Register on chain (the merchant signs, AI runs the script)

```bash
cd apps/agent
pnpm sync-card        # broadcasts register(uri, hash), writes AGENT_ID back to .env
```

That's it. The merchant is now a globally-discoverable agent.

---

## 2. Day-2 operations

### Update menu / prices / opening hours

```bash
# 1. Merchant updates seed data or live inventory (via DB or admin UI)
# 2. Restart Fly machine (or your hosting) to pick up new bytes
# 3. Re-sync to chain (changes the hash, costs ~$0.0001 testnet gas)
pnpm sync-card     # detects new live hash, calls update(agentId, uri, newHash)
```

`sync-card` is **idempotent**: if on-chain hash already matches the live URL,
it does nothing (no tx, no gas).

### Pause / resume business

```bash
# Pause (deactivates the listing, indexers stop showing you)
cast send --rpc-url "$RPC_URL" --private-key "$SYNC_PRIVATE_KEY" \
  "$IDENTITY_REGISTRY" "setActive(uint256,bool)" "$AGENT_ID" false

# Resume
cast send --rpc-url "$RPC_URL" --private-key "$SYNC_PRIVATE_KEY" \
  "$IDENTITY_REGISTRY" "setActive(uint256,bool)" "$AGENT_ID" true
```

### Transfer ownership (sale / handover)

```bash
cast send --rpc-url "$RPC_URL" --private-key "$SYNC_PRIVATE_KEY" \
  "$IDENTITY_REGISTRY" "transferOwnership(uint256,address)" "$AGENT_ID" "$NEW_OWNER"
```

After this, the new owner controls all updates and `setActive`. The old wallet
is locked out by the contract.

---

## 3. Adding new skills

Skills live as files under `apps/agent/src/routes/skills/`. Each file
default-exports a `SkillDef`. The framework auto-discovers them and routes
`POST /skills/<name>` to the handler.

```typescript
// apps/agent/src/routes/skills/get_spa_menu.ts
import { z } from 'zod'
import { defineSkill } from '../../core/skill.js'

export default defineSkill({
  name: 'get_spa_menu',
  description: 'List available spa treatments and prices',
  endpoint: '/skills/get_spa_menu',
  inputSchema:  z.object({ category: z.enum(['massage', 'facial', 'package']).optional() }),
  outputSchema: z.object({ treatments: z.array(...) }),
  async handle({ input, ctx }) {
    return { treatments: await ctx.store.listSpaTreatments(input.category) }
  },
})
```

After adding a skill, the agent-card JSON changes (more entries in
`skills[]`), so the hash changes — re-run `pnpm sync-card` to update on chain.

---

## 4. What "Concourse the company" does NOT do

The AI agent reading this skill (you) should be explicit with the merchant:

- ✗ We do not host their server.
- ✗ We do not hold their wallet keys.
- ✗ We do not collect a transaction fee.
- ✗ We cannot de-list them. Only `setActive(false)` from their own wallet does.
- ✗ We cannot read their bookings, customer data, or pricing strategy.

What we provide:

- ✓ This skill file (open-source instructions for any AI agent).
- ✓ The template repo (open-source code).
- ✓ A reference frontend at concourse.paking.xyz (optional UI, not authoritative).

---

## 5. Verifying merchant sovereignty (homework)

Tell the merchant: "if you don't believe Concourse is dispensable, do this
experiment after your agent is live":

```bash
# 1. Curl your own URL — works (you control the server)
curl https://<your-domain>/.well-known/agent-card.json

# 2. Read your registration from chain — works (no Concourse involved)
cast call --rpc-url https://base-sepolia.public.blastapi.io \
  0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f \
  "getAgent(uint256)((address,string,bytes32,uint64,uint64,bool))" "$AGENT_ID"

# 3. Have a friend run the user-client SKILL.md against your agentId.
#    Their AI agent will discover + verify + invoke your skills — without ever
#    talking to concourse.paking.xyz. If we shut our website down tomorrow,
#    your customers still reach you.
```

That's the operational meaning of "your business owns its on-chain identity".

---

## 6. Error table

| Failure | Likely cause | Action |
|---|---|---|
| `vm.envUint: missing hex prefix` | PK in `.env` lacks `0x` | Prefix with `0x` (see TROUBLESHOOTING) |
| `Could not locate the bindings file` (better-sqlite3) | pnpm 10 didn't run install scripts | Root `package.json` needs `pnpm.onlyBuiltDependencies` |
| sync-card refuses with "signer already owns agent(s) [N]" | `AGENT_ID=` was empty in .env on first run, ghost agent #N exists | Set `AGENT_ID=N`, re-run; old ghost can stay or be `setActive(false)` |
| `update(...)` reverts `Unauthorized` | Wrong PK signing | Check `AGENT_OWNER_ADDRESS == address(privateKeyToAccount(SYNC_PRIVATE_KEY))` |
| Card hash mismatch after deploy | Local vs deployed env divergence (PAYOUT_ADDRESS empty, etc.) | Re-seed local with same env Fly has, then `sync-card` reads live truth |

---

## 7. Provenance

The merchant is registering on a **public good** — ERC-8004 IdentityRegistry,
a contract that no one (including the deployer) can modify, censor, or
"upgrade" to deplatform anyone. Their registration outlives this skill, this
template, and this company.

Open source: <https://github.com/PakHeiPoon/Concourse>
