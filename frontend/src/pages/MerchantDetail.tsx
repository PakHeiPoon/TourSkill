import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Globe as GlobeIcon,
  Clock,
  Tag,
  ShieldCheck,
  ExternalLink,
  Code2,
  Loader2,
  Copy,
  Check,
  Pause,
  CircleDot,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'
const REGISTRY_CONTRACT = '0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543'
const CHAINSCAN_ADDRESS = 'https://chainscan-galileo.0g.ai/address'
const CHAINSCAN_TX = 'https://chainscan-galileo.0g.ai/tx'

interface Merchant {
  merchant_id: string
  did: string
  type: string
  name: { en: string; zh: string }
  description: { en: string; zh: string }
  location: {
    city: string
    country: string
    address: string
    lat?: number
    lng?: number
  }
  contacts: { phone?: string; email?: string; website?: string }
  opening_hours?: string
  price_level?: number
  tags: string[]
  languages_supported: string[]
  skills: string[]
  specific_fields: Record<string, unknown>
  wallet_address?: string
  profile_hash?: string
  register_tx_hash?: string
  status?: 'active' | 'inactive'
}

function CopyableHex({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handle}
      className="group inline-flex items-center gap-2 font-mono text-sm text-text hover:text-primary transition-colors"
      aria-label={`Copy ${label}`}
    >
      <span className="break-all">{value}</span>
      {copied ? <Check className="w-3.5 h-3.5 text-primary shrink-0" /> : <Copy className="w-3.5 h-3.5 text-text-muted group-hover:text-primary shrink-0" />}
    </button>
  )
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'hotel':      return 'bg-primary-soft text-primary border-primary/20'
    case 'restaurant': return 'bg-accent-soft text-accent border-accent/20'
    default:           return 'bg-emerald-50 text-emerald-700 border-emerald-100/60'
  }
}

export default function MerchantDetail(): React.JSX.Element {
  const { merchantId } = useParams<{ merchantId: string }>()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!merchantId) return
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/v1/merchants/${encodeURIComponent(merchantId)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setMerchant(data as Merchant))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [merchantId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading merchant…
      </div>
    )
  }

  if (error || !merchant) {
    return (
      <div className="text-center py-32">
        <p className="text-text-muted mb-4">Couldn't load this merchant: {error ?? 'not found'}</p>
        <Link to="/explorer" className="text-primary hover:text-primary-hover font-semibold">← Back to Explorer</Link>
      </div>
    )
  }

  const sf = merchant.specific_fields ?? {}

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* Back nav */}
      <Link
        to="/explorer"
        className="inline-flex items-center gap-1.5 text-text-muted hover:text-text text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Explorer
      </Link>

      {/* Header */}
      <div className="bg-white rounded-3xl border border-border shadow-sm p-8 mb-6">
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider border ${typeBadgeClass(merchant.type)}`}>
            {merchant.type}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-soft border border-primary/30 rounded-md text-[10px] font-semibold text-primary">
            <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
            Verified on 0G Chain
          </span>
          {/* Business status badge */}
          {merchant.status === 'inactive' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 border border-border-strong rounded-md text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              <Pause className="w-3 h-3" strokeWidth={3} />
              Paused
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
              <CircleDot className="w-3 h-3" strokeWidth={3} />
              Open
            </span>
          )}
          {merchant.price_level !== undefined && (
            <span className="px-2.5 py-1 bg-surface text-text-muted text-[10px] font-bold rounded-md uppercase tracking-wider border border-border">
              {'¥'.repeat(merchant.price_level)}<span className="opacity-30">{'¥'.repeat(5 - merchant.price_level)}</span>
            </span>
          )}
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-text tracking-tight mb-2">
          {merchant.name.en}
        </h1>
        {merchant.name.zh !== merchant.name.en && (
          <p className="text-2xl text-text-muted font-medium mb-4">{merchant.name.zh}</p>
        )}

        <p className="flex items-center gap-2 text-text-muted text-sm mb-6">
          <MapPin className="w-4 h-4" />
          {merchant.location.address}
        </p>

        {/* Full description (no truncation) */}
        <div className="bg-surface rounded-xl p-5 mb-6 border border-border">
          <p className="text-text leading-relaxed">{merchant.description.en}</p>
        </div>

        {/* Tags */}
        {merchant.tags.length > 0 && (
          <div className="flex items-center flex-wrap gap-2">
            <Tag className="w-4 h-4 text-text-muted" />
            {merchant.tags.map(t => (
              <span key={t} className="px-2.5 py-0.5 bg-surface-2 text-text-muted text-xs font-medium rounded-full border border-border">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2-col grid: contact/hours  |  on-chain proof */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Contact + hours */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4">Contact & Hours</h3>
          <dl className="space-y-3 text-sm">
            {merchant.opening_hours && (
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-text-muted text-xs uppercase tracking-wider">Hours</dt>
                  <dd className="text-text">{merchant.opening_hours}</dd>
                </div>
              </div>
            )}
            {merchant.contacts.phone && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-text-muted text-xs uppercase tracking-wider">Phone</dt>
                  <dd className="text-text">{merchant.contacts.phone}</dd>
                </div>
              </div>
            )}
            {merchant.contacts.email && (
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-text-muted text-xs uppercase tracking-wider">Email</dt>
                  <dd className="text-text break-all">{merchant.contacts.email}</dd>
                </div>
              </div>
            )}
            {merchant.contacts.website && (
              <div className="flex items-start gap-3">
                <GlobeIcon className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-text-muted text-xs uppercase tracking-wider">Website</dt>
                  <dd>
                    <a href={merchant.contacts.website} target="_blank" rel="noreferrer"
                       className="text-primary hover:text-primary-hover break-all inline-flex items-center gap-1">
                      {merchant.contacts.website}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* On-chain proof — inline expanded */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            On-chain Proof
          </h3>
          <dl className="space-y-3 text-xs">
            {merchant.wallet_address && (
              <div>
                <dt className="text-text-muted font-medium mb-1">Owner wallet</dt>
                <dd className="flex items-center justify-between gap-2">
                  <CopyableHex value={merchant.wallet_address} label="wallet" />
                  <a href={`${CHAINSCAN_ADDRESS}/${merchant.wallet_address}`} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 text-primary hover:text-primary-hover text-xs font-semibold shrink-0">
                    chainscan <ExternalLink className="w-3 h-3" />
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-text-muted font-medium mb-1">Merchant DID</dt>
              <dd><CopyableHex value={merchant.did} label="DID" /></dd>
            </div>
            {merchant.profile_hash && (
              <div>
                <dt className="text-text-muted font-medium mb-1">Profile hash</dt>
                <dd><CopyableHex value={merchant.profile_hash} label="profile hash" /></dd>
              </div>
            )}
            <div>
              <dt className="text-text-muted font-medium mb-1">Registry contract</dt>
              <dd className="flex items-center justify-between gap-2">
                <CopyableHex value={REGISTRY_CONTRACT} label="contract" />
                <a href={`${CHAINSCAN_ADDRESS}/${REGISTRY_CONTRACT}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-primary hover:text-primary-hover text-xs font-semibold shrink-0">
                  chainscan <ExternalLink className="w-3 h-3" />
                </a>
              </dd>
            </div>
          </dl>

          {merchant.register_tx_hash && (
            <a
              href={`${CHAINSCAN_TX}/${merchant.register_tx_hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-1.5 w-full px-3 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              View register tx on chainscan
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <p className="mt-3 pt-3 border-t border-border text-[10px] text-text-muted leading-relaxed">
            Anchored on 0G Galileo testnet (chainId 16602) via the ERC-8004 MerchantRegistry contract.
          </p>
        </div>
      </div>

      {/* Skills + specific fields */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-border p-6">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-text-muted" />
            Available Agent Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {merchant.skills.map(s => (
              <span key={s} className="px-3 py-1.5 bg-surface text-text text-sm font-medium rounded-lg border border-border">
                {s}
              </span>
            ))}
          </div>
          <Link
            to={`/explorer?test=${merchant.merchant_id}`}
            className="mt-5 inline-flex items-center gap-1.5 text-primary hover:text-primary-hover text-sm font-semibold"
          >
            Test these skills →
          </Link>
        </div>

        {Object.keys(sf).filter(k => k !== 'register_tx_hash').length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-6">
            <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4">Merchant-Specific Fields</h3>
            <dl className="space-y-2 text-sm">
              {Object.entries(sf)
                .filter(([k]) => k !== 'register_tx_hash')
                .map(([k, v]) => (
                  <div key={k} className="flex flex-wrap items-baseline gap-2 py-1.5 border-b border-border last:border-b-0">
                    <dt className="text-text-muted text-xs uppercase tracking-wider min-w-[8rem]">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-text font-medium break-all">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
