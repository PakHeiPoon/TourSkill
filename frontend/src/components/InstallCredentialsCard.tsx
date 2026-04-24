import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react'

import { useT } from '../i18n'
import { clearCachedToken, mintToken } from '../lib/auth'

interface InstallCredentialsCardProps {
  wallet: string
  /**
   * An already-minted token (e.g. the MerchantSign page just signed it).
   * If provided, we don't re-prompt the wallet on mount — just display it.
   */
  initialToken?: string
  initialExpiresAt?: string
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * "Install to your agent" panel — displays the owner's wallet + a bearer
 * token, with copy buttons and a regenerate flow. Token is masked by default
 * to reduce shoulder-surfing risk.
 */
export default function InstallCredentialsCard({ wallet, initialToken, initialExpiresAt }: InstallCredentialsCardProps) {
  const { t, lang } = useT()

  const [token, setToken] = useState<string>(initialToken ?? '')
  const [expiresAt, setExpiresAt] = useState<string>(initialExpiresAt ?? '')
  const [revealed, setRevealed] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [copiedField, setCopiedField] = useState<'wallet' | 'token' | 'snippet' | ''>('')

  const hasToken = Boolean(token)

  const generate = async () => {
    setError('')
    setLoading(true)
    try {
      clearCachedToken(wallet)
      const res = await mintToken(wallet)
      setToken(res.token)
      setExpiresAt(res.expiresAt)
      setRevealed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, field: 'wallet' | 'token' | 'snippet') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      window.setTimeout(() => setCopiedField(''), 1500)
    } catch {
      /* ignore */
    }
  }

  const mask = (s: string): string => {
    if (!s) return ''
    if (s.length <= 8) return '••••••••'
    return `${s.slice(0, 4)}••••••••••••••••${s.slice(-4)}`
  }

  const envSnippet = hasToken
    ? `MERCHANT_WALLET_ADDRESS=${wallet}\nMERCHANT_TOKEN=${token}`
    : ''

  const expiresLabel = expiresAt
    ? t('install.expires', { date: new Date(expiresAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : undefined) })
    : ''

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <KeyRound className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-text">{t('install.title')}</h3>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{t('install.desc')}</p>
        </div>
      </div>

      {/* Wallet row */}
      <div className="bg-white rounded-xl border border-border p-3 mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
              {t('install.wallet')}
            </div>
            <div className="font-mono text-sm text-text truncate mt-0.5">{shortAddr(wallet)}</div>
          </div>
          <button
            onClick={() => copyToClipboard(wallet, 'wallet')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface-2 hover:bg-border text-text transition-colors"
          >
            {copiedField === 'wallet' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copiedField === 'wallet' ? t('install.copied') : t('install.copy')}
          </button>
        </div>
      </div>

      {/* Token row */}
      {hasToken ? (
        <>
          <div className="bg-white rounded-xl border border-border p-3 mb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  {t('install.token')}
                  {expiresLabel && <span className="ml-2 font-normal normal-case tracking-normal">· {expiresLabel}</span>}
                </div>
                <div className="font-mono text-sm text-text truncate mt-0.5">
                  {revealed ? token : mask(token)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRevealed(v => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface-2 hover:bg-border text-text transition-colors"
                >
                  {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {revealed ? t('install.hide') : t('install.reveal')}
                </button>
                <button
                  onClick={() => copyToClipboard(token, 'token')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface-2 hover:bg-border text-text transition-colors"
                >
                  {copiedField === 'token' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedField === 'token' ? t('install.copied') : t('install.copy')}
                </button>
              </div>
            </div>
          </div>

          {/* .env snippet */}
          <div className="bg-[#0b0f17] text-slate-100 rounded-xl p-3 mb-3 relative group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                {t('install.snippet')}
              </div>
              <button
                onClick={() => copyToClipboard(envSnippet, 'snippet')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors"
              >
                {copiedField === 'snippet' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === 'snippet' ? t('install.copied') : t('install.copy')}
              </button>
            </div>
            <pre className="font-mono text-xs overflow-x-auto whitespace-pre">
              {`MERCHANT_WALLET_ADDRESS=${wallet}\nMERCHANT_TOKEN=${revealed ? token : mask(token)}`}
            </pre>
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-text-muted hover:text-text bg-surface-2 hover:bg-border border border-border disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {loading ? t('install.generating') : t('install.regenerate')}
          </button>
        </>
      ) : (
        <button
          onClick={generate}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:bg-primary/60 text-white px-5 py-3 rounded-full text-sm font-semibold transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('install.generating')}
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              {t('install.generate')}
            </>
          )}
        </button>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
    </section>
  )
}
