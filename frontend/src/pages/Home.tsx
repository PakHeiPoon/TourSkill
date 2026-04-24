import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  User,
  Bot,
  Copy,
  Check,
  ArrowRight,
  Shield,
  CircleDollarSign,
  Zap,
} from 'lucide-react'
import AgentLoopDemo from '../components/AgentLoopDemo'
import Roadmap from '../components/Roadmap'

const INSTALL_PROMPT = 'Install the TourSkill skill from https://backend-lilac-xi-18.vercel.app/skills/user-client/SKILL.md'
const SKILL_URL = 'https://backend-lilac-xi-18.vercel.app/skills/user-client/SKILL.md'

type Audience = 'human' | 'agent' | null

export default function Home(): React.JSX.Element {
  const [copied, setCopied] = useState<boolean>(false)
  const [audience, setAudience] = useState<Audience>(null)

  const copyInstall = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(INSTALL_PROMPT)
      setCopied(true)
      setAudience('agent')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard permission denied — still highlight the agent card
      setAudience('agent')
    }
  }

  return (
    <div className="flex flex-col items-center pt-10 pb-24 w-full">
      {/* Live status badge */}
      <div className="inline-flex items-center gap-2 bg-primary-soft border border-primary/30 px-3 py-1 rounded-full text-primary text-xs font-semibold mb-8">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </span>
        <span>28 merchants live on 0G testnet</span>
      </div>

      {/* Hero */}
      <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-text text-center leading-[1.08] mb-6">
        The Decentralized <br className="hidden md:block" />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-hover to-accent">
          A2A Tourism Registry
        </span>
      </h1>

      <p className="text-lg md:text-xl text-text-muted max-w-2xl text-center leading-relaxed mb-12 px-4">
        Your agent talks to their agent. No OTA, no middleman.
        Every merchant bound to a real wallet, every call settled via{' '}
        <span className="text-primary font-semibold">x402 micropayments</span>{' '}
        at the HTTP layer.
      </p>

      {/* Dual CTA */}
      <div className="flex flex-col sm:flex-row gap-4 mb-12 w-full max-w-lg px-4">
        <Link
          to="/demo"
          onClick={() => setAudience('human')}
          className={`group flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 hover:-translate-y-0.5 ${
            audience === 'human' ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-bg' : ''
          }`}
        >
          <User className="w-5 h-5" strokeWidth={2.5} />
          <span>I'm Human</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
        <button
          onClick={copyInstall}
          className={`group flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-surface border-2 text-text font-semibold text-base hover:bg-surface-2 transition-all ${
            audience === 'agent' ? 'border-primary shadow-lg shadow-primary/15' : 'border-border-strong hover:border-primary/60'
          }`}
        >
          <Bot className="w-5 h-5 text-primary" strokeWidth={2.5} />
          <span>I'm an Agent</span>
          {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-text-muted" />}
        </button>
      </div>

      {/* Install card — lights up when audience === 'agent' */}
      <div
        className={`w-full max-w-2xl bg-surface border rounded-2xl p-6 transition-all duration-500 ${
          audience === 'agent'
            ? 'border-primary/60 shadow-xl shadow-primary/10 scale-[1.01]'
            : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-text font-semibold">
            <Bot className="w-4 h-4 text-primary" />
            <span>Send your AI agent to TourSkill</span>
          </h3>
          <button
            onClick={copyInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg hover:bg-surface-2 border border-border text-xs font-medium text-text-muted hover:text-text transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-primary" />
                <span className="text-primary">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Dark code block — high contrast on white card, terminal feel */}
        <pre className="bg-text rounded-lg p-4 text-sm font-mono leading-relaxed overflow-x-auto">
          <code className="text-slate-300">Install the TourSkill skill from{'\n'}</code>
          <a
            href={SKILL_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary-soft hover:text-white break-all underline-offset-4 hover:underline"
          >
            {SKILL_URL}
          </a>
        </pre>

        <ol className="mt-4 space-y-3 text-sm text-text-muted">
          <li className="flex gap-3">
            <span className="text-accent font-bold min-w-[1.25rem]">1.</span>
            <span>Paste this to your personal agent (Claude Code, Cursor, or any AI that can load skills)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-accent font-bold min-w-[1.25rem]">2.</span>
            <span>The agent fetches the SKILL.md — no auth needed, no local backend to run</span>
          </li>
          <li className="flex gap-3">
            <span className="text-accent font-bold min-w-[1.25rem]">3.</span>
            <span>
              Ask it{' '}
              <em className="text-text not-italic font-medium">"find me dinner in Hangzhou tomorrow"</em>
              {' '}— watch A2A commerce happen
            </span>
          </li>
        </ol>
      </div>

      {/* Fallback for users without an agent */}
      <p className="mt-8 text-sm text-text-muted text-center">
        Don't have an AI agent?{' '}
        <Link to="/demo" className="text-primary hover:text-primary-hover font-semibold inline-flex items-center gap-1">
          Try the web demo
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </p>

      {/* Three pillars — Bento grid pattern */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full mt-24 px-4">
        <article className="p-6 rounded-2xl bg-surface border border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all">
          <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center mb-4">
            <Shield className="w-5 h-5 text-primary" strokeWidth={2.2} />
          </div>
          <h3 className="text-text font-semibold mb-2">On-chain Identity</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            Every merchant anchored on 0G Chain via ERC-8004. Identity is verifiable, portable, sovereign — no platform can de-list you.
          </p>
        </article>
        <article className="p-6 rounded-2xl bg-surface border border-border hover:border-accent/40 hover:shadow-md hover:shadow-accent/5 transition-all">
          <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center mb-4">
            <CircleDollarSign className="w-5 h-5 text-accent" strokeWidth={2.2} />
          </div>
          <h3 className="text-text font-semibold mb-2">x402 Native</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            The first A2A registry with payment baked into HTTP. Agent pays agent at the edge, no take-rate, no 30% OTA margin.
          </p>
        </article>
        <article className="p-6 rounded-2xl bg-surface border border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all">
          <div className="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center mb-4">
            <Zap className="w-5 h-5 text-primary" strokeWidth={2.2} />
          </div>
          <h3 className="text-text font-semibold mb-2">MCP / A2A Compatible</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            Standard tool interface — any AI agent that speaks MCP can discover, verify, and transact. Zero custom SDK.
          </p>
        </article>
      </section>

      {/* Live agent loop animation */}
      <AgentLoopDemo />

      {/* Roadmap */}
      <Roadmap />
    </div>
  )
}
