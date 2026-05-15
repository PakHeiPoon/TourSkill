/**
 * BaseAgentPanel — surfaces Concourse agents registered on Base Sepolia
 * IdentityRegistry. Reads chain directly (no backend proxy), fetches each
 * agent's card from its own URL, and lets the user invoke skills against
 * that URL with on-the-spot SHA-256 verification.
 */

import React, { useEffect, useState } from 'react'
import {
  ExternalLink, Loader2, RefreshCw, ShieldCheck, ShieldX, X, Play, Globe,
} from 'lucide-react'

import { useBaseAgents } from '../hooks/useBaseAgents'
import {
  fetchAndHashCard, BASE_SEPOLIA, IDENTITY_REGISTRY_ADDRESS,
  type OnChainAgent, type FetchedCard, type AgentCardSkill,
} from '../lib/erc8004'

function short(addr: string, n = 4): string {
  return addr.length > 2 * n + 4
    ? `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`
    : addr
}

function fmtTs(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

// ─── Skill invocation modal ──────────────────────────────────────────

interface SkillRunnerProps {
  agentUrl: string
  skill:    AgentCardSkill
  onClose:  () => void
}

function SkillRunner({ agentUrl, skill, onClose }: SkillRunnerProps) {
  const [body,    setBody]    = useState<string>(() => skillTemplate(skill))
  const [result,  setResult]  = useState<string>('')
  const [running, setRunning] = useState<boolean>(false)
  const [error,   setError]   = useState<string | null>(null)

  async function run(): Promise<void> {
    setRunning(true); setError(null); setResult('')
    try {
      let parsed: unknown = {}
      try { parsed = body.trim() ? JSON.parse(body) : {} }
      catch { throw new Error('invalid JSON body') }
      const url = agentUrl + skill.endpoint
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (skill.idempotencyKey === 'required') {
        headers['Idempotency-Key'] = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(parsed) })
      const text = await res.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ }
      setResult(`HTTP ${res.status}\n\n${pretty}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">POST</div>
            <div className="font-mono text-sm text-slate-900 mt-0.5">{agentUrl + skill.endpoint}</div>
            <div className="text-xs text-slate-500 mt-1">{skill.description}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <label className="text-xs uppercase tracking-[0.18em] text-slate-500">Request body (JSON)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="mt-1.5 w-full h-32 px-3 py-2 font-mono text-sm border border-slate-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
          />
          {skill.idempotencyKey === 'required' && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠ this skill requires <code className="font-mono">Idempotency-Key</code> header — auto-injected per call
            </div>
          )}

          <button
            onClick={run}
            disabled={running}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Calling…' : 'Send'}
          </button>

          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          {result && (
            <pre className="mt-4 p-3 bg-slate-900 text-emerald-300 text-xs font-mono rounded-lg overflow-x-auto whitespace-pre-wrap max-h-80">
              {result}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

function skillTemplate(skill: AgentCardSkill): string {
  // Minimal placeholder body based on known schemas
  const samples: Record<string, unknown> = {
    check_availability: {
      check_in: '2026-09-01', check_out: '2026-09-03', room_type: 'mountain_view',
    },
    get_rates: { from: '2026-09-01', to: '2026-09-08' },
    create_booking: {
      check_in: '2026-09-01', check_out: '2026-09-03',
      room_type: 'mountain_view',
      payer_address: '0x0000000000000000000000000000000000000000',
    },
    get_room_types: {},
    get_cancellation_policy: {},
  }
  const body = samples[skill.name] ?? {}
  return JSON.stringify(body, null, 2)
}

// ─── Agent detail modal ──────────────────────────────────────────────

interface AgentDetailModalProps {
  agent:   OnChainAgent
  onClose: () => void
}

function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const [fetched, setFetched] = useState<FetchedCard | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [skill,   setSkill]   = useState<AgentCardSkill | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null); setFetched(null)
    fetchAndHashCard(agent.agentCardURI)
      .then((f) => { if (!cancelled) setFetched(f) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [agent.agentCardURI])

  const matches = fetched && fetched.hash.toLowerCase() === agent.agentCardHash.toLowerCase()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-semibold tracking-wide">BASE SEPOLIA</span>
              <span className="text-slate-500">Agent #{agent.agentId}</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mt-2">
              {fetched?.card.name ?? 'Loading…'}
            </h2>
            <div className="text-sm text-slate-600 mt-1">
              {fetched?.card.description?.slice(0, 140) ?? ''}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        {/* body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* on-chain row */}
          <div className="grid grid-cols-[140px,1fr] gap-y-2 gap-x-4 text-sm">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 self-center">owner</div>
            <div className="font-mono text-slate-900">{agent.owner}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 self-center">agentCardURI</div>
            <a href={agent.agentCardURI} target="_blank" rel="noreferrer"
               className="font-mono text-teal-700 hover:underline break-all inline-flex items-center gap-1">
              {agent.agentCardURI} <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 self-center">on-chain hash</div>
            <div className="font-mono text-xs text-slate-700 break-all">{agent.agentCardHash}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 self-center">registered</div>
            <div className="text-slate-700">{fmtTs(agent.registeredAt)}</div>
          </div>

          {/* hash verification */}
          <div className={`p-4 rounded-lg border ${
            error ? 'bg-red-50 border-red-200'
            : !fetched ? 'bg-slate-50 border-slate-200'
            : matches ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {!fetched && !error && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
              {error && <ShieldX className="w-5 h-5 text-red-600" />}
              {fetched && matches && <ShieldCheck className="w-5 h-5 text-emerald-600" />}
              {fetched && !matches && <ShieldX className="w-5 h-5 text-red-600" />}
              <div className="font-semibold text-sm">
                {!fetched && !error && 'Fetching card and computing SHA-256…'}
                {error && 'Could not fetch card from URL'}
                {fetched && matches && 'Verified — served bytes match on-chain hash'}
                {fetched && !matches && 'Mismatch — card has drifted from on-chain commit'}
              </div>
            </div>
            {error && <div className="mt-2 text-xs font-mono text-red-700">{error}</div>}
            {fetched && (
              <div className="mt-2 text-xs font-mono text-slate-700 grid grid-cols-[80px,1fr] gap-x-3">
                <span className="text-slate-500">computed</span>
                <span className="break-all">{fetched.hash}</span>
                {fetched.headerSha256 && (<>
                  <span className="text-slate-500">header</span>
                  <span className="break-all">{fetched.headerSha256}</span>
                </>)}
                <span className="text-slate-500">bytes</span><span>{fetched.bytes}</span>
              </div>
            )}
          </div>

          {/* skills */}
          {fetched && (
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">
                Skills ({fetched.card.skills.length}) — calls go straight to the agent URL
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fetched.card.skills.map((s) => (
                  <button key={s.name}
                          onClick={() => setSkill(s)}
                          className="text-left p-3 border border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 rounded-lg transition-colors">
                    <div className="font-mono text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5 text-teal-600" /> {s.name}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 line-clamp-2">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* on-chain ref */}
          <div className="pt-2 border-t border-slate-200">
            <a href={`${BASE_SEPOLIA.explorerUrl}/address/${IDENTITY_REGISTRY_ADDRESS}#readContract`}
               target="_blank" rel="noreferrer"
               className="text-xs text-teal-700 hover:underline inline-flex items-center gap-1">
              View on Basescan <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {skill && fetched && (
        <SkillRunner
          agentUrl={fetched.card.url || agent.agentCardURI.replace('/.well-known/agent-card.json', '')}
          skill={skill}
          onClose={() => setSkill(null)}
        />
      )}
    </div>
  )
}

// ─── Top-level panel ─────────────────────────────────────────────────

export default function BaseAgentPanel(): React.ReactElement {
  const { agents, loading, error, refresh } = useBaseAgents()
  const [selected, setSelected] = useState<OnChainAgent | null>(null)

  return (
    <section className="mb-10 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-teal-50/40 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-semibold uppercase tracking-[0.18em] text-emerald-700">Live on chain</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-600">ERC-8004 IdentityRegistry · Base Sepolia</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mt-2">Real agents, real bytes, real on-chain identity</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            These agents are anchored on Base Sepolia at{' '}
            <a href={`${BASE_SEPOLIA.explorerUrl}/address/${IDENTITY_REGISTRY_ADDRESS}#readContract`}
               target="_blank" rel="noreferrer"
               className="font-mono text-teal-700 hover:underline">
              {IDENTITY_REGISTRY_ADDRESS.slice(0, 10)}…{IDENTITY_REGISTRY_ADDRESS.slice(-4)}
            </a>
            . Click any card to fetch its agent-card.json, verify SHA-256 against the on-chain hash, and call its skills directly.
          </p>
        </div>
        <button onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && agents.length === 0 && (
          <div className="col-span-full text-sm text-slate-500 flex items-center gap-2 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Reading IdentityRegistry…
          </div>
        )}
        {error && (
          <div className="col-span-full text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {error}
          </div>
        )}
        {!loading && !error && agents.length === 0 && (
          <div className="col-span-full text-sm text-slate-500 py-6 text-center">
            No active agents registered yet.
          </div>
        )}
        {agents.map((a) => (
          <AgentCard key={a.agentId} agent={a} onOpen={() => setSelected(a)} />
        ))}
      </div>

      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

// ─── Lazy preview card (fetches name/desc from the URL) ──────────────

function AgentCard({ agent, onOpen }: { agent: OnChainAgent; onOpen: () => void }) {
  const [fetched, setFetched] = useState<FetchedCard | null>(null)
  const [failed,  setFailed]  = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    fetchAndHashCard(agent.agentCardURI)
      .then((f) => { if (!cancelled) setFetched(f) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [agent.agentCardURI])

  const matches = fetched && fetched.hash.toLowerCase() === agent.agentCardHash.toLowerCase()

  return (
    <button onClick={onOpen}
            className="text-left p-4 bg-white rounded-xl border border-slate-200 hover:border-teal-400 hover:shadow-md transition-all">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-mono">#{agent.agentId}</span>
        <Globe className="w-3 h-3 text-slate-400" />
        <span className="text-slate-500 font-mono truncate">{short(agent.owner, 5)}</span>
      </div>
      <div className="mt-2 font-semibold text-slate-900 line-clamp-1">
        {fetched?.card.name ?? (failed ? '(unreachable)' : 'Loading…')}
      </div>
      <div className="text-xs text-slate-600 mt-1 line-clamp-2 min-h-[2.5em]">
        {fetched?.card.description ?? ' '}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-500">{fetched?.card.skills.length ?? '—'} skills</span>
        <span className={
          !fetched ? 'text-slate-400'
          : matches ? 'text-emerald-700 inline-flex items-center gap-1'
                    : 'text-red-700 inline-flex items-center gap-1'
        }>
          {fetched && matches && (<><ShieldCheck className="w-3.5 h-3.5" />verified</>)}
          {fetched && !matches && (<><ShieldX className="w-3.5 h-3.5" />drift</>)}
          {!fetched && (failed ? 'fetch failed' : 'verifying…')}
        </span>
      </div>
    </button>
  )
}
