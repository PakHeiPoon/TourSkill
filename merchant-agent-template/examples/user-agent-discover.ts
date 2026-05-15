/**
 * user-agent-discover — end-to-end protocol round-trip from a CONSUMER's view.
 *
 * Run with no setup:
 *   pnpm exec tsx examples/user-agent-discover.ts
 *
 * What it does, step by step:
 *   1. Read IdentityRegistry on Base Sepolia, list every active agent
 *   2. For each agent: fetch its agent-card.json over HTTPS
 *   3. SHA-256 the bytes, compare against the on-chain commit
 *   4. Pick the first hotel agent, call three of its skills as a real client:
 *        - get_room_types     (what's on offer)
 *        - get_cancellation_policy
 *        - check_availability (real quote in USDC)
 *
 * No private keys. No wallet. No backend. Just chain + HTTP.
 * This is what any AI agent (Claude / GPT / your own LLM) will do
 * when shopping on Concourse.
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createHash } from 'node:crypto';

// ─── Config ─────────────────────────────────────────────────────────
// Pinned to the deployment we just did. In a real client these come
// from a registry list (Coinbase wallet, erc8004.org indexer, …).
const IDENTITY_REGISTRY = '0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f';
const RPC = 'https://sepolia.base.org';

const REGISTRY_ABI = parseAbi([
  'function totalAgents() view returns (uint256)',
  'function getAgent(uint256 agentId) view returns (address owner, string agentCardURI, bytes32 agentCardHash, uint64 registeredAt, uint64 updatedAt, bool active)',
]);

// ─── Tiny ANSI palette (no extra deps) ──────────────────────────────
const c = {
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
};

// ─── Types ──────────────────────────────────────────────────────────
interface OnChainAgent {
  agentId:       bigint;
  owner:         string;
  agentCardURI:  string;
  agentCardHash: `0x${string}`;
  active:        boolean;
}

interface AgentCard {
  name:    string;
  url:     string;
  description: string;
  skills:  Array<{ name: string; description: string; endpoint: string }>;
  extensions?: Record<string, unknown>;
}

// ─── Step 1: list active agents from chain ──────────────────────────

async function listAgents(client: ReturnType<typeof createPublicClient>): Promise<OnChainAgent[]> {
  const total = await client.readContract({
    address: IDENTITY_REGISTRY, abi: REGISTRY_ABI, functionName: 'totalAgents',
  });
  console.log(c.dim(`  totalAgents() = ${total}`));

  const out: OnChainAgent[] = [];
  for (let i = 1n; i <= total; i++) {
    const [owner, uri, hash, , , active] = await client.readContract({
      address: IDENTITY_REGISTRY, abi: REGISTRY_ABI,
      functionName: 'getAgent', args: [i],
    });
    if (active) out.push({ agentId: i, owner, agentCardURI: uri, agentCardHash: hash, active });
  }
  return out;
}

// ─── Step 2: fetch + hash-verify the agent card ─────────────────────

async function fetchAndVerify(agent: OnChainAgent): Promise<AgentCard> {
  const res = await fetch(agent.agentCardURI);
  if (!res.ok) throw new Error(`fetch ${agent.agentCardURI} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const computed = '0x' + createHash('sha256').update(buf).digest('hex');
  if (computed !== agent.agentCardHash) {
    console.log(c.red(`  ✗ HASH MISMATCH — chain ${agent.agentCardHash} ≠ live ${computed}`));
    console.log(c.red('    DO NOT trust this card; merchant URL has drifted from the on-chain commit.'));
    throw new Error('hash mismatch');
  }
  console.log(c.green(`  ✓ ${agent.agentCardHash}  (chain == live, ${buf.length} bytes)`));
  return JSON.parse(buf.toString('utf8')) as AgentCard;
}

// ─── Step 3: call three skills like a real client ───────────────────

async function callSkill<T>(
  card: AgentCard, name: string, body: Record<string, unknown>,
): Promise<T> {
  const skill = card.skills.find((s) => s.name === name);
  if (!skill) throw new Error(`skill ${name} not on this agent`);
  const url = card.url + skill.endpoint;
  const t0 = Date.now();
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `demo-${Date.now()}` },
    body:    JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const json = (await res.json()) as T;
  console.log(c.dim(`  POST ${skill.endpoint}  →  HTTP ${res.status}  ${ms}ms`));
  if (!res.ok) {
    console.log(c.red('  ' + JSON.stringify(json)));
    throw new Error(`skill ${name} failed`);
  }
  return json;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(c.bold('\n🔍 Discovering Concourse agents on Base Sepolia'));
  console.log(c.dim(`   IdentityRegistry  ${IDENTITY_REGISTRY}`));
  console.log(c.dim(`   RPC               ${RPC}`));

  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const agents = await listAgents(client);

  if (agents.length === 0) {
    console.log(c.yellow('\nNo active agents on chain yet.'));
    return;
  }
  console.log(c.bold(`\n📋 Found ${agents.length} active agent${agents.length > 1 ? 's' : ''}\n`));

  for (const a of agents) {
    console.log(c.bold(`Agent #${a.agentId}`));
    console.log(`  owner   ${a.owner}`);
    console.log(`  URI     ${a.agentCardURI}`);

    // Verify hash
    console.log(c.dim('  hash verification:'));
    const card = await fetchAndVerify(a);

    // Read card surface
    console.log(c.dim('  card:'));
    console.log(`    name        ${c.cyan(card.name)}`);
    console.log(`    description ${card.description.slice(0, 80)}…`);
    console.log(`    serviceUrl  ${card.url}`);
    console.log(`    skills (${card.skills.length})  ${card.skills.map((s) => s.name).join(', ')}`);

    // Call three skills as a real client would
    console.log(c.bold(`\n🛏  Step 3 — calling skills on Agent #${a.agentId}\n`));

    console.log(c.cyan('• get_room_types'));
    type RoomTypesOut = { items: Array<{ item_id: string; name: { en: string }; base_rate_usdc: number }> };
    const rooms = await callSkill<RoomTypesOut>(card, 'get_room_types', {});
    for (const it of rooms.items) {
      console.log(`    ${it.item_id.padEnd(20)} ${it.name.en.padEnd(30)} ${(it.base_rate_usdc / 1_000_000).toFixed(2)} USDC/night`);
    }

    console.log(c.cyan('\n• get_cancellation_policy'));
    type PolicyOut = {
      type: string | null;
      tiers: Array<{ hours_before_start: number; refund_percent: number }>;
      free_rescheduling_hours?: number;
    };
    const policy = await callSkill<PolicyOut>(card, 'get_cancellation_policy', {});
    console.log(`    type: ${policy.type ?? 'flat'}`);
    for (const t of policy.tiers) {
      console.log(`    ≥ ${String(t.hours_before_start).padStart(3)}h before check-in  →  ${t.refund_percent}% refund`);
    }
    if (policy.free_rescheduling_hours) {
      console.log(`    free reschedule up to ${policy.free_rescheduling_hours}h before`);
    }

    console.log(c.cyan('\n• check_availability  (2026-09-01 → 2026-09-03, mountain_view)'));
    type AvailOut = {
      available: boolean;
      nights:    number;
      total_usdc: number;
      per_night_usdc: Array<{ date: string; usdc: number; stock: number }>;
    };
    const room = rooms.items[0]?.item_id ?? 'mountain_view';
    const quote = await callSkill<AvailOut>(card, 'check_availability', {
      check_in:  '2026-09-01',
      check_out: '2026-09-03',
      room_type: room,
    });
    if (quote.available) {
      console.log(c.green(`    ✓ available  ${quote.nights} nights  ${(quote.total_usdc / 1_000_000).toFixed(2)} USDC total`));
      for (const n of quote.per_night_usdc) {
        console.log(`      ${n.date}  ${(n.usdc / 1_000_000).toFixed(2)} USDC  (stock ${n.stock})`);
      }
    } else {
      console.log(c.yellow('    ✗ no availability for this date range'));
    }
  }

  console.log(c.bold(c.green('\n✅ End-to-end protocol round-trip complete.')));
  console.log(c.dim('   ◦ Discovery via ERC-8004 IdentityRegistry on Base Sepolia'));
  console.log(c.dim('   ◦ Off-chain card fetch with on-chain hash verification (tamper-evident)'));
  console.log(c.dim('   ◦ A2A skill invocation via plain HTTPS — no API key, no SDK lock-in'));
  console.log('');
}

main().catch((err: unknown) => {
  console.error(c.red('\n✗ ' + (err instanceof Error ? err.message : String(err))));
  process.exit(1);
});
