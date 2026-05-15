# Troubleshooting

Real failure modes hit while shipping the first Concourse agent
(`wumingchu.tourskill.paking.xyz`, agentId=1 on Base Sepolia). Each
entry has the **symptom** (what you'll see), the **root cause**, and
the **fix**. Read this before you debug — you're probably not the
first to hit it.

---

## Build / Install

### `Could not locate the bindings file` — better_sqlite3.node

**Symptom**  
Container starts, dies immediately with a long list of paths it tried:

```
Error: Could not locate the bindings file. Tried:
 → /app/.../better-sqlite3/build/Release/better_sqlite3.node
 → /app/.../better-sqlite3/lib/binding/node-v127-linux-x64/better_sqlite3.node
 ...
machine has reached its max restart count of 10
```

**Root cause**  
pnpm 10 disables install scripts by default for security. better-sqlite3's
prebuild script never runs, so the compiled `.node` file is never produced.

**Fix**  
Declare the dependency as a permitted build target in the **root**
`package.json` (not the workspace's):

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3"]
  }
}
```

Then rebuild from scratch — `pnpm install` once approved will compile
the native binding into `node_modules/.pnpm/.../build/Release/`.

---

### `vm.envUint: failed parsing $DEPLOYER_PRIVATE_KEY: missing hex prefix ("0x")`

**Symptom**  
`forge script Deploy.s.sol --broadcast` reverts in simulation before
sending any tx.

**Root cause**  
Foundry parses `DEPLOYER_PRIVATE_KEY` as a `uint256`. It needs the `0x`
prefix. `cast wallet new` outputs an unprefixed key, and users often
paste it as-is.

**Fix**  
Either edit `.env` to add `0x`, or override inline at run time:

```bash
DEPLOYER_PRIVATE_KEY=0x$DEPLOYER_PRIVATE_KEY \
  forge script script/Deploy.s.sol:Deploy --rpc-url ... --broadcast
```

The `contracts/erc8004/.env.example` documents this explicitly.

---

## Fly.io deployment

### `Error: region hkg not found` when creating volumes

**Symptom**  
`flyctl volumes create ... --region hkg --yes` fails.

**Root cause**  
Hong Kong region has been removed from new Fly deployments.

**Fix**  
Use `nrt` (Tokyo) or `sin` (Singapore). Update `fly.toml`'s
`primary_region` to match. For China-facing demos `nrt` has the best
latency of the remaining Asia regions.

```toml
primary_region = "nrt"
```

```bash
flyctl volumes create agent_data --size 1 --region nrt --yes
```

---

### `timeout reached waiting for health checks to pass`

**Symptom**  
`flyctl deploy` reaches "Waiting for machine to reach a good state"
then times out. The machine shows `state=stopped` with `1 warning`.

**Root cause**  
Container crashed during startup. The deploy reports a health-check
timeout but the underlying issue is upstream. Hit `flyctl logs` to
find the real error — most often it's the better-sqlite3 bindings
issue above.

**Fix**  
Read the actual log:

```bash
flyctl logs --app <your-app> --no-tail | tail -50
```

Look for the *first* stack trace in the boot sequence. Fix that error
specifically — don't trust the "health-check timeout" framing.

---

### Free-tier machines auto-stop and 30 s cold start

**Symptom**  
First request after idle returns in 3–5 s instead of 100 ms.

**Root cause**  
`auto_stop_machines = "stop"` + `min_machines_running = 0` (free-tier
appropriate) means the machine sleeps when idle and Fly's proxy boots
it on incoming traffic.

**Fix (intentional)**  
Leave it. Cold-start is the cost of "free except actual usage."
For a paid demo where latency matters, switch to:

```toml
auto_stop_machines = false
min_machines_running = 1
```

---

## sync-card / on-chain

### Local hash ≠ live URL hash

**Symptom**  
`pnpm sync-card --dry-run` (older versions) shows a hash that doesn't
match `curl -I https://<your-domain>/.well-known/agent-card.json |
grep X-Card-SHA256`.

**Root cause**  
Local SQLite store has different settings than the deployed store —
most commonly because `setup.ts` was run against a different `.env`
when seeding. Specifically: `process.env.PAYOUT_ADDRESS ?? ...` with
`PAYOUT_ADDRESS=` (empty string, not unset) does **not** fall back,
because `??` only catches `undefined`/`null`.

**Fix (in current code)**  
- `setup.ts` now uses `||` not `??` for env-string fallback chains.
- `sync-card` defaults to **live-URL** as the source of truth and warns
  if local store hash differs. The hash that lands on chain is the SHA-256
  of the bytes the URL actually serves, not the bytes you computed locally.
- Manually compute the live hash any time:

  ```bash
  curl -s https://<your-domain>/.well-known/agent-card.json | shasum -a 256
  ```

If you really want to compute locally (debug only), pass `--from-local`:

```bash
pnpm sync-card --dry-run --from-local
```

---

### `INVALID_INPUT` from `/skills/<x>` when calling without `Idempotency-Key`

**Symptom**  
`curl -X POST /skills/create_booking` returns
`{"error":"IDEMPOTENCY_KEY_REQUIRED"}` with HTTP 400.

**Root cause**  
State-changing skills (currently only `create_booking`) require an
`Idempotency-Key` header by design — see `04_MERCHANT_AGENT_TEMPLATE.md`.
Without it, replay-on-network-failure would double-charge or
double-reserve.

**Fix**  
Send a unique key (UUID, hash, timestamp, anything unique to this
intent) per call:

```bash
curl -X POST .../skills/create_booking \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: booking-2026-09-01-king-abc123' \
  -d '{...}'
```

---

## Operational

### How do I view my agent on-chain without writing code?

Three ways, ranked by effort:

1. **Basescan Read Contract**:  
   `https://sepolia.basescan.org/address/<IdentityRegistry>#readContract` → expand `getAgent`, enter your agentId, click Query.

2. **Direct URL**:  
   `https://<your-domain>/.well-known/agent-card.json` returns the JSON the chain commits to. The `X-Card-SHA256` header must match the on-chain `agentCardHash`.

3. **cast**:  

   ```bash
   cast call --rpc-url https://sepolia.base.org \
     <IdentityRegistry> \
     "getAgent(uint256)" <agentId> \
     | cast --abi-decode "()(address,string,bytes32,uint64,uint64,bool)"
   ```

For mainnet deployments registered against the canonical
`0x8004A169…A432` registry, [8004scan.io](https://8004scan.io)
indexes you automatically.

---

### My card changed (new room, new policy) — what do I do?

1. Update the inventory or settings on your live agent (or re-seed and redeploy).
2. Confirm the served bytes changed: `curl -I .../.well-known/agent-card.json` shows a different `X-Card-SHA256`.
3. Run `pnpm sync-card` from the env that has `SYNC_PRIVATE_KEY` and `AGENT_ID` set — it will call `update(agentId, uri, newHash)` and overwrite the on-chain hash.
4. Re-verify on Basescan.

`sync-card` is idempotent: if the live hash already matches what's on
chain, it does nothing (`action: noop`).

---

### How do I rotate my SYNC_PRIVATE_KEY?

Currently you can't. `IdentityRegistry` ties ownership to a single
address per agent. To rotate:

```
cast send <IdentityRegistry> "transferOwnership(uint256,address)" <agentId> <new-owner> \
  --private-key <old-key>
```

The new owner then calls `update()` from their key. Until that happens,
the old key still controls the agent.

For mainnet, **never put a hot key in `.env`**. Use a hardware wallet
via `cast wallet import` + `--ledger` / `--trezor`, or `cast wallet
unlock` for keystore files.
