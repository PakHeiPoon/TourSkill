import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BrowserProvider, Contract } from 'ethers'
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Loader2, ShieldCheck, Sparkles, Wallet } from 'lucide-react'

import InstallCredentialsCard from '../components/InstallCredentialsCard'
import {
  MERCHANT_REGISTRY_ABI,
  MERCHANT_REGISTRY_ADDRESS,
  ZERO_G_CHAIN,
} from '../contracts/MerchantRegistry'
import { useT } from '../i18n'
import { mintToken } from '../lib/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'

type DraftPayload = {
  merchant_type: string
  name: string
  description: string
  city: string
  country: string
  address: string
  latitude: number | null
  longitude: number | null
  contact_phone: string
  contact_email: string
  opening_hours: string
  website_url: string | null
  price_level: number | null
  tags: string[]
  languages_supported: string[]
  supported_skills: string[]
  specific_fields: Record<string, unknown>
}

type DraftView = {
  draft_id: string
  sign_url: string
  status: 'pending' | 'signed' | 'expired'
  expires_at: string
  payload: DraftPayload
  merchant_id: string | null
  wallet_address: string | null
  tx_hash: string | null
  auth_token: string | null
}

type Phase = 'idle' | 'off-chain' | 'chain' | 'bind' | 'complete' | 'done' | 'error'

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function MerchantSign() {
  const { t, lang } = useT()
  const { draftId } = useParams<{ draftId: string }>()

  const [draft, setDraft] = useState<DraftView | null>(null)
  const [loadError, setLoadError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)

  const [wallet, setWallet] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [signError, setSignError] = useState<string>('')
  const [result, setResult] = useState<{
    merchantId: string
    txHash: string | null
    authToken: string | null
    tokenExpiresAt: string | null
  } | null>(null)

  // ─── Load the draft ───
  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/drafts/${encodeURIComponent(draftId)}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          if (!cancelled) setLoadError(body?.detail || t('sign.notFound'))
        } else {
          const data = (await res.json()) as DraftView
          if (!cancelled) {
            setDraft(data)
            // If already signed (refresh after success), restore result.
            // Note: auth_token is only visible to the first browser that
            // completed signing — a refresh in another tab sees null here,
            // which is correct (tokens are secrets, not shareable state).
            if (data.status === 'signed' && data.merchant_id) {
              setResult({
                merchantId: data.merchant_id,
                txHash: data.tx_hash,
                authToken: data.auth_token,
                tokenExpiresAt: null,
              })
              setPhase('done')
            }
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [draftId, t])

  // ─── Restore connected wallet from localStorage (same key as header) ───
  useEffect(() => {
    const saved = localStorage.getItem('tourskill_wallet_address')
    if (saved) setWallet(saved)
  }, [])

  const connectWallet = async () => {
    try {
      const eth = (window as Window & { ethereum?: unknown }).ethereum
      if (!eth) {
        alert('Please install MetaMask first.')
        return
      }
      const provider = new BrowserProvider(eth as any)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      setWallet(address)
      localStorage.setItem('tourskill_wallet_address', address)
      window.dispatchEvent(new Event('tourskill:wallet-changed'))
    } catch (err) {
      console.error(err)
      setSignError(err instanceof Error ? err.message : 'Connect failed')
    }
  }

  const signAndRegister = async () => {
    if (!draft || !wallet || !draftId) return
    setSignError('')
    setPhase('off-chain')

    try {
      // Step 1: save off-chain (creates merchant row, returns did + profile_hash)
      const createRes = await fetch(`${API_BASE}/v1/merchants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft.payload,
          wallet_address: wallet,
          profile_hash: null,
          profile_uri: null,
          skill_endpoint: null,
        }),
      })
      const createBody = await createRes.json()
      if (!createRes.ok) {
        throw new Error(createBody?.detail || 'Off-chain save failed')
      }
      const merchantId: string = createBody?.data?.merchant_id
      const did: string = createBody?.data?.did
      const profileHash: string = createBody?.data?.profile_hash
      const skillEndpoint = `${API_BASE}/v1/merchants/${merchantId}`

      // Step 2: on-chain register (MetaMask prompt)
      setPhase('chain')
      const eth = (window as Window & { ethereum?: unknown }).ethereum
      if (!eth) throw new Error('MetaMask not found')
      const provider = new BrowserProvider(eth as any)

      // Ensure correct chain
      try {
        await provider.send('wallet_switchEthereumChain', [
          { chainId: '0x' + ZERO_G_CHAIN.chainId.toString(16) },
        ])
      } catch (switchErr: unknown) {
        if ((switchErr as { code?: number }).code === 4902) {
          await provider.send('wallet_addEthereumChain', [
            {
              chainId: '0x' + ZERO_G_CHAIN.chainId.toString(16),
              chainName: ZERO_G_CHAIN.name,
              rpcUrls: [ZERO_G_CHAIN.rpcUrl],
              nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
            },
          ])
        } else {
          throw switchErr
        }
      }

      const signer = await provider.getSigner()
      const registry = new Contract(MERCHANT_REGISTRY_ADDRESS, MERCHANT_REGISTRY_ABI, signer)
      const tx = await registry.register(
        did,
        draft.payload.merchant_type,
        profileHash,
        `supabase://${merchantId}`,
        skillEndpoint,
      )
      const receipt = await tx.wait()
      const txHash: string = receipt.hash

      // Step 3: bind — free personal_sign that mints an opaque bearer
      // token. This is what lets the agent PATCH without the owner's
      // private key. Without this step, "signing once" would leave a
      // pub-key-only anchor on-chain and no secure auth channel.
      setPhase('bind')
      const { token: authToken, expiresAt: tokenExpiresAt } = await mintToken(wallet)

      // Step 4: notify backend so the agent can pick up the result
      // (including the freshly-minted auth_token).
      setPhase('complete')
      await fetch(`${API_BASE}/v1/drafts/${encodeURIComponent(draftId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          wallet_address: wallet,
          tx_hash: txHash,
          auth_token: authToken,
        }),
      })

      setResult({ merchantId, txHash, authToken, tokenExpiresAt })
      setPhase('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      setSignError(msg)
      setPhase('error')
    }
  }

  const busy = phase === 'off-chain' || phase === 'chain' || phase === 'bind' || phase === 'complete'

  const expiresInMinutes = useMemo(() => {
    if (!draft) return null
    const ms = new Date(draft.expires_at).getTime() - Date.now()
    if (ms <= 0) return 0
    return Math.round(ms / 60000)
  }, [draft])

  // ─── Render states ───

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
        <p className="mt-3 text-text-muted text-sm">{t('sign.loading')}</p>
      </div>
    )
  }

  if (loadError || !draft) {
    return (
      <div className="max-w-2xl mx-auto py-20">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-900">{t('sign.notFound')}</h2>
          <p className="mt-2 text-red-700 text-sm">{loadError || t('sign.notFoundDesc')}</p>
        </div>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="max-w-2xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-6">
        <div className="rounded-2xl border border-border bg-white shadow-xl shadow-text/5 p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mb-6">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text">{t('sign.success')}</h1>
          <p className="mt-3 text-text-muted">{t('sign.successDesc')}</p>

          <div className="mt-8 grid gap-3">
            <Link
              to={`/merchant/${result.merchantId}`}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-3 rounded-full text-sm font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {t('sign.viewMerchant')}
            </Link>
            {result.txHash && (
              <a
                href={`${ZERO_G_CHAIN.explorerUrl}/tx/${result.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 text-primary hover:text-primary-dark text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                {t('sign.viewTx')}
              </a>
            )}
          </div>
        </div>

        {/* Show token only to the browser that just minted it. On refresh
            (or in another tab) auth_token is null — a fresh sign is required. */}
        {wallet && result.authToken && (
          <InstallCredentialsCard
            wallet={wallet}
            initialToken={result.authToken}
            initialExpiresAt={result.tokenExpiresAt ?? undefined}
          />
        )}
      </div>
    )
  }

  const p = draft.payload
  const isSignedFromBackend = draft.status === 'signed'

  return (
    <div className="max-w-2xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4 text-primary">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text">{t('sign.title')}</h1>
        <p className="mt-3 text-text-muted max-w-xl mx-auto">{t('sign.subtitle')}</p>

        {expiresInMinutes !== null && expiresInMinutes > 0 && (
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-xs text-text-muted">
            <Clock className="w-3 h-3" />
            <span>Expires in ~{expiresInMinutes}m</span>
          </div>
        )}
      </div>

      {/* Already signed banner (if user refreshes after success in another tab) */}
      {isSignedFromBackend && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">{t('sign.alreadySigned')}</p>
            <p className="text-sm text-emerald-700 mt-0.5">{t('sign.alreadySignedDesc')}</p>
          </div>
        </div>
      )}

      {/* Preview card */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border bg-surface">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {t('sign.preview')}
          </h2>
        </div>
        <div className="p-6">
          <h3 className="text-2xl font-bold text-text mb-1">{p.name}</h3>
          <p className="text-text-muted text-sm mb-4">{p.description}</p>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-text-muted text-xs uppercase tracking-wider">{t('sign.field.type')}</dt>
              <dd className="text-text font-medium mt-0.5 capitalize">{p.merchant_type}</dd>
            </div>
            <div>
              <dt className="text-text-muted text-xs uppercase tracking-wider">{t('sign.field.city')}</dt>
              <dd className="text-text font-medium mt-0.5">{p.city}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-text-muted text-xs uppercase tracking-wider">{t('sign.field.address')}</dt>
              <dd className="text-text font-medium mt-0.5">{p.address}</dd>
            </div>
            <div>
              <dt className="text-text-muted text-xs uppercase tracking-wider">{t('sign.field.contact')}</dt>
              <dd className="text-text font-medium mt-0.5">
                {p.contact_phone}
                {p.contact_email ? ` · ${p.contact_email}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted text-xs uppercase tracking-wider">{t('sign.field.hours')}</dt>
              <dd className="text-text font-medium mt-0.5">{p.opening_hours}</dd>
            </div>
            {p.supported_skills.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-text-muted text-xs uppercase tracking-wider mb-1">{t('sign.field.skills')}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {p.supported_skills.map(s => (
                    <span
                      key={s}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20"
                    >
                      {s}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Sign action */}
      {!isSignedFromBackend && (
        <div className="rounded-2xl border border-border bg-white shadow-sm p-6">
          {!wallet ? (
            <button
              onClick={connectWallet}
              className="w-full flex items-center justify-center gap-2 bg-text hover:bg-text/90 text-white px-5 py-3 rounded-full text-sm font-semibold transition-all shadow-md hover:shadow-lg"
            >
              <Wallet className="w-4 h-4" />
              {t('sign.connect')}
            </button>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between text-xs">
                <span className="text-text-muted uppercase tracking-wider">{t('sign.connectedAs')}</span>
                <span className="font-mono text-text">{shortAddr(wallet)}</span>
              </div>
              <button
                onClick={signAndRegister}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:bg-primary/60 disabled:cursor-not-allowed text-white px-5 py-3 rounded-full text-sm font-semibold transition-all shadow-md hover:shadow-lg"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {phase === 'off-chain' && t('sign.signing.off')}
                      {phase === 'chain' && t('sign.signing.chain')}
                      {phase === 'bind' && t('sign.signing.bind')}
                      {phase === 'complete' && t('sign.signing.complete')}
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    {t('sign.signButton')}
                  </>
                )}
              </button>
            </>
          )}

          {signError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-700">
                <span className="font-semibold">{t('sign.errorPrefix')}: </span>
                {signError}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-text-muted text-center" lang={lang}>
        Chain ID {ZERO_G_CHAIN.chainId} · {ZERO_G_CHAIN.name}
      </p>
    </div>
  )
}
