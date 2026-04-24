import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet,
  Copy,
  Check,
  ExternalLink,
  Store,
  Bot,
  ArrowRight,
  ShieldCheck,
  Loader2,
  PlusCircle,
  Pause,
  CircleDot,
} from 'lucide-react'
import { useT } from '../i18n'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'
const CHAINSCAN_ADDRESS = 'https://chainscan-galileo.0g.ai/address'
const CHAIN_ID = 16602
const CHAIN_NAME = '0G Galileo testnet'

const INSTALL_PROMPT = 'Install the TourSkill skill from https://api.tourskill.paking.xyz/skills/user-client/SKILL.md'
const SKILL_URL = 'https://api.tourskill.paking.xyz/skills/user-client/SKILL.md'

interface Merchant {
  merchant_id: string
  did: string
  type: string
  name: { en: string; zh: string }
  location: { city: string; country: string; address: string }
  skills: string[]
  status?: 'active' | 'inactive'
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch { /* ignore */ }
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-primary hover:bg-primary-soft transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function typeBadge(type: string): string {
  switch (type) {
    case 'hotel':      return 'bg-primary-soft text-primary border-primary/20'
    case 'restaurant': return 'bg-accent-soft text-accent border-accent/20'
    default:           return 'bg-emerald-50 text-emerald-700 border-emerald-100/60'
  }
}

export default function ProfilePage(): React.JSX.Element {
  const { t, lang } = useT()
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [installCopied, setInstallCopied] = useState<boolean>(false)

  // Sync wallet from localStorage + listen for header changes
  useEffect(() => {
    const sync = () => setWalletAddress(localStorage.getItem('tourskill_wallet_address') ?? '')
    sync()
    window.addEventListener('tourskill:wallet-changed', sync)
    return () => window.removeEventListener('tourskill:wallet-changed', sync)
  }, [])

  // Fetch merchants owned by this wallet
  useEffect(() => {
    if (!walletAddress) {
      setMerchants([])
      return
    }
    setLoading(true)
    fetch(`${API_BASE}/v1/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // include_inactive: true → owner sees their paused listings too
      body: JSON.stringify({ wallet: walletAddress, limit: 100, include_inactive: true }),
    })
      .then(r => r.json())
      .then(d => setMerchants((d.data ?? []) as Merchant[]))
      .catch(() => setMerchants([]))
      .finally(() => setLoading(false))
  }, [walletAddress])

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_PROMPT)
      setInstallCopied(true)
      window.setTimeout(() => setInstallCopied(false), 2000)
    } catch { /* ignore */ }
  }

  // ───── Disconnected state ─────
  if (!walletAddress) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-primary-soft items-center justify-center mb-6">
          <Wallet className="w-8 h-8 text-primary" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold text-text mb-3">Connect your wallet</h1>
        <p className="text-text-muted mb-6">
          Sign in with your wallet to view your TourSkill profile, manage your registered
          merchants, and connect your AI agent.
        </p>
        <p className="text-sm text-text-muted">
          Use the <span className="font-semibold text-text">Connect Wallet</span> button in the top right →
        </p>
      </div>
    )
  }

  // ───── Connected state ─────
  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Identity card */}
      <section className="bg-white rounded-3xl border border-border shadow-sm p-8 mb-6">
        <div className="flex items-start gap-5 mb-6">
          {/* Big gradient avatar */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-md shadow-primary/20 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text mb-1">Wallet Profile</h1>
            <div className="flex items-center gap-2 mb-3">
              <code className="text-sm font-mono text-text-muted break-all">{walletAddress}</code>
              <CopyButton value={walletAddress} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-soft border border-primary/30 rounded-md text-xs font-semibold text-primary">
                <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
                {CHAIN_NAME}
              </span>
              <span className="px-2.5 py-1 bg-surface text-text-muted text-xs font-medium rounded-md border border-border">
                chainId {CHAIN_ID}
              </span>
              <a
                href={`${CHAINSCAN_ADDRESS}/${walletAddress}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover font-medium ml-auto"
              >
                View on chainscan
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* My Merchants */}
      <section className="bg-white rounded-3xl border border-border shadow-sm p-8 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Store className="w-5 h-5 text-text-muted" />
            My Merchants
            {merchants.length > 0 && (
              <span className="text-sm text-text-muted font-normal">· {merchants.length}</span>
            )}
          </h2>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Register new
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading…
          </div>
        ) : merchants.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-2xl">
            <Store className="w-10 h-10 text-text-muted/40 mx-auto mb-3" />
            <p className="text-text-muted text-sm mb-4">
              No merchants registered with this wallet yet.
            </p>
            <Link
              to="/register"
              className="text-primary hover:text-primary-hover text-sm font-semibold inline-flex items-center gap-1"
            >
              Register your first merchant
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {merchants.map(m => {
              const isPaused = m.status === 'inactive'
              return (
                <Link
                  key={m.merchant_id}
                  to={`/merchant/${encodeURIComponent(m.merchant_id)}`}
                  className={`group flex items-start gap-3 p-4 rounded-xl border transition-all ${
                    isPaused
                      ? 'bg-surface-2/60 border-dashed border-border-strong hover:border-text-muted opacity-75 hover:opacity-100'
                      : 'bg-surface border-border hover:border-primary/40 hover:bg-white'
                  }`}
                >
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider border shrink-0 ${typeBadge(m.type)}`}>
                    {m.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`text-sm font-semibold truncate transition-colors ${
                        isPaused ? 'text-text-muted' : 'text-text group-hover:text-primary'
                      }`}>
                        {m.name?.[lang as 'en' | 'zh'] || m.name.en}
                      </div>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${
                        isPaused
                          ? 'bg-surface-2 text-text-muted border-border-strong'
                          : 'bg-primary-soft text-primary border-primary/30'
                      }`}>
                        {isPaused
                          ? <><Pause className="w-2.5 h-2.5" strokeWidth={3} /> {t('status.inactive')}</>
                          : <><CircleDot className="w-2.5 h-2.5" strokeWidth={3} /> {t('status.active')}</>
                        }
                      </span>
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">
                      {m.location.city.charAt(0).toUpperCase() + m.location.city.slice(1)} · {m.skills.length} skills
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Connect your AI agent */}
      <section className="bg-white rounded-3xl border border-border shadow-sm p-8">
        <h2 className="text-lg font-bold text-text flex items-center gap-2 mb-2">
          <Bot className="w-5 h-5 text-primary" />
          Connect your AI Agent
        </h2>
        <p className="text-sm text-text-muted mb-4">
          Send this one-line install prompt to your personal AI agent. It will fetch the
          TourSkill SKILL.md and immediately start interacting with the on-chain registry.
        </p>

        <pre className="bg-text rounded-lg p-4 text-sm font-mono leading-relaxed overflow-x-auto mb-3">
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

        <button
          onClick={copyInstall}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary-hover transition-colors text-sm"
        >
          {installCopied ? (
            <>
              <Check className="w-4 h-4" />
              Copied to clipboard
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy install prompt
            </>
          )}
        </button>
      </section>
    </div>
  )
}
