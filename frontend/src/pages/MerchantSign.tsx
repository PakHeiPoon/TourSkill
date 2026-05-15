import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BrowserProvider, Contract } from 'ethers'
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Loader2, Pencil, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react'

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

  // Mutable copy of draft.payload — what actually gets sent on Sign.
  // Owner can flip into edit mode and patch fields before committing
  // anything on-chain (the on-chain anchor is permanent, so the
  // "review and fix" step is critical owner-side UX).
  const [formData, setFormData] = useState<DraftPayload | null>(null)
  const [editing, setEditing] = useState<boolean>(false)

  const updateField = <K extends keyof DraftPayload>(key: K, value: DraftPayload[K]) => {
    setFormData(prev => (prev ? { ...prev, [key]: value } : prev))
  }
  const updateSpecific = (key: string, value: unknown) => {
    setFormData(prev =>
      prev ? { ...prev, specific_fields: { ...prev.specific_fields, [key]: value } } : prev,
    )
  }
  const startEdit = () => setEditing(true)
  const cancelEdit = () => {
    setFormData(draft?.payload ?? null)
    setEditing(false)
  }
  const saveEdit = () => setEditing(false)

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
            setFormData(data.payload)
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
    const saved = localStorage.getItem('concourse_wallet_address')
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
      localStorage.setItem('concourse_wallet_address', address)
      window.dispatchEvent(new Event('concourse:wallet-changed'))
    } catch (err) {
      console.error(err)
      setSignError(err instanceof Error ? err.message : 'Connect failed')
    }
  }

  const signAndRegister = async () => {
    if (!draft || !wallet || !draftId || !formData) return
    if (editing) {
      setSignError('Please save your edits before signing.')
      return
    }
    setSignError('')
    setPhase('off-chain')

    try {
      // Step 1: save off-chain (creates merchant row, returns did + profile_hash)
      // Use formData (post-edit) so the owner's last-mile changes are what
      // actually get hashed and anchored on-chain.
      const createRes = await fetch(`${API_BASE}/v1/merchants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
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

      // Known ethers v6 + 0G testnet RPC quirk: eth_sendTransaction can
      // throw "could not coalesce error / Transaction failed" with an
      // empty originalError, even though the tx actually broadcasts and
      // mines successfully. We optimistically attempt the standard call,
      // then on that specific error pattern we verify on-chain state
      // (getMerchant) before declaring failure — the user shouldn't see
      // a red error toast for a tx that actually went through.
      let txHash: string = ''
      try {
        const tx = await registry.register(
          did,
          formData.merchant_type,
          profileHash,
          `supabase://${merchantId}`,
          skillEndpoint,
        )
        const receipt = await tx.wait()
        txHash = receipt.hash
      } catch (chainErr: unknown) {
        const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr)
        const isLikelyFalsePositive =
          errMsg.includes('could not coalesce') ||
          errMsg.includes('Transaction failed')

        if (!isLikelyFalsePositive) throw chainErr

        // Wait a few seconds for the tx to propagate, then verify via
        // a read-only contract instance.
        await new Promise(resolve => setTimeout(resolve, 4000))
        const readContract = new Contract(MERCHANT_REGISTRY_ADDRESS, MERCHANT_REGISTRY_ABI, provider)
        const stored = await readContract.getMerchant(did)
        if (stored.owner.toLowerCase() !== wallet.toLowerCase()) {
          // Genuine failure — surface the original error.
          throw chainErr
        }
        // Tx actually went through. Try to recover the hash from the
        // MerchantRegistered event (best-effort — fall back to empty).
        try {
          const events = await readContract.queryFilter(
            readContract.filters.MerchantRegistered(did),
            -2000,
          )
          txHash = events[events.length - 1]?.transactionHash ?? ''
        } catch {
          /* ignore — we know the merchant is on-chain */
        }
        console.warn('Recovered from ethers/0G false-positive — merchant is on-chain', { did, txHash })
      }

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

      {/* Preview / Edit card — owner reviews and patches anything wrong
          before the signature commits the profile_hash on-chain forever. */}
      {formData && (
        <PreviewCard
          formData={formData}
          editing={editing && !isSignedFromBackend}
          isSignedFromBackend={isSignedFromBackend}
          updateField={updateField}
          updateSpecific={updateSpecific}
          startEdit={startEdit}
          saveEdit={saveEdit}
          cancelEdit={cancelEdit}
        />
      )}

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

// ─── Preview / Edit Card ────────────────────────────────────────────────
// Two modes:
//   - Read-only: dl/dt/dd grid showing every field the agent prepared
//   - Edit: every field becomes an input; arrays use comma-separated text
//
// The editable fields cover the full /v1/merchants schema including the
// hotel-specific specific_fields. For other merchant types we fall back
// to a generic key-value editor on specific_fields so any schema works.

type FieldEditorProps = {
  formData: DraftPayload
  editing: boolean
  isSignedFromBackend: boolean
  updateField: <K extends keyof DraftPayload>(key: K, value: DraftPayload[K]) => void
  updateSpecific: (key: string, value: unknown) => void
  startEdit: () => void
  saveEdit: () => void
  cancelEdit: () => void
}

function PreviewCard({
  formData,
  editing,
  isSignedFromBackend,
  updateField,
  updateSpecific,
  startEdit,
  saveEdit,
  cancelEdit,
}: FieldEditorProps) {
  const { t } = useT()
  const isHotel = formData.merchant_type === 'hotel'

  // Helpers — comma-separated string ↔ string[] for arrays.
  const arrToStr = (a: string[]): string => (a ?? []).join(', ')
  const strToArr = (s: string): string[] =>
    s.split(',').map(x => x.trim()).filter(Boolean)

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden mb-6">
      {/* Header with edit / save / cancel */}
      <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {editing ? t('sign.editing') : t('sign.preview')}
        </h2>
        {!isSignedFromBackend && (
          editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-text-muted hover:text-text bg-surface-2 hover:bg-border border border-border transition-colors"
              >
                <X className="w-3 h-3" />
                {t('sign.cancel')}
              </button>
              <button
                onClick={saveEdit}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary hover:bg-primary-dark text-white transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                {t('sign.save')}
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-primary hover:text-white hover:bg-primary border border-primary/40 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {t('sign.edit')}
            </button>
          )
        )}
      </div>

      <div className="p-6 space-y-6">
        {!editing && !isSignedFromBackend && (
          <p className="text-xs text-text-muted bg-surface-2 border border-border rounded-lg p-3 leading-relaxed">
            {t('sign.editHint')}
          </p>
        )}

        {/* Section: Identity */}
        <Section title={t('sign.section.basic')}>
          <Field label={t('sign.field.name')} colSpan={2}>
            {editing ? (
              <input
                value={formData.name}
                onChange={e => updateField('name', e.target.value)}
                className={inputCls}
              />
            ) : (
              <h3 className="text-xl font-bold text-text">{formData.name}</h3>
            )}
          </Field>
          <Field label={t('sign.field.description')} colSpan={2}>
            {editing ? (
              <textarea
                value={formData.description}
                onChange={e => updateField('description', e.target.value)}
                rows={4}
                className={`${inputCls} resize-y`}
              />
            ) : (
              <p className="text-text-muted text-sm whitespace-pre-line">{formData.description}</p>
            )}
          </Field>
        </Section>

        {/* Section: Type & Location */}
        <Section title={t('sign.section.location')}>
          <Field label={t('sign.field.type')}>
            {editing ? (
              <select
                value={formData.merchant_type}
                onChange={e => updateField('merchant_type', e.target.value)}
                className={inputCls}
              >
                <option value="hotel">hotel</option>
                <option value="restaurant">restaurant</option>
                <option value="attraction">attraction</option>
                <option value="shop">shop</option>
              </select>
            ) : (
              <span className="capitalize">{formData.merchant_type}</span>
            )}
          </Field>
          <Field label={t('sign.field.city')}>
            {editing ? (
              <input
                value={formData.city}
                onChange={e => updateField('city', e.target.value)}
                className={inputCls}
              />
            ) : (
              formData.city
            )}
          </Field>
          <Field label={t('sign.field.country')}>
            {editing ? (
              <input
                value={formData.country}
                onChange={e => updateField('country', e.target.value)}
                className={inputCls}
              />
            ) : (
              formData.country
            )}
          </Field>
          <Field label={t('sign.field.coords')}>
            {editing ? (
              <div className="flex gap-2">
                <input
                  value={formData.latitude ?? ''}
                  onChange={e => updateField('latitude', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="lat"
                  className={inputCls}
                />
                <input
                  value={formData.longitude ?? ''}
                  onChange={e => updateField('longitude', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="lng"
                  className={inputCls}
                />
              </div>
            ) : formData.latitude != null && formData.longitude != null ? (
              <span className="font-mono text-xs">
                {formData.latitude}, {formData.longitude}
              </span>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Field>
          <Field label={t('sign.field.address')} colSpan={2}>
            {editing ? (
              <input
                value={formData.address}
                onChange={e => updateField('address', e.target.value)}
                className={inputCls}
              />
            ) : (
              formData.address
            )}
          </Field>
        </Section>

        {/* Section: Contact & hours */}
        <Section title={t('sign.section.contact')}>
          <Field label={t('sign.field.phone')}>
            {editing ? (
              <input
                value={formData.contact_phone}
                onChange={e => updateField('contact_phone', e.target.value)}
                className={inputCls}
              />
            ) : (
              formData.contact_phone
            )}
          </Field>
          <Field label={t('sign.field.email')}>
            {editing ? (
              <input
                value={formData.contact_email}
                onChange={e => updateField('contact_email', e.target.value)}
                className={inputCls}
              />
            ) : (
              formData.contact_email
            )}
          </Field>
          <Field label={t('sign.field.hours')}>
            {editing ? (
              <input
                value={formData.opening_hours}
                onChange={e => updateField('opening_hours', e.target.value)}
                className={inputCls}
              />
            ) : (
              formData.opening_hours
            )}
          </Field>
          <Field label={t('sign.field.website')}>
            {editing ? (
              <input
                value={formData.website_url ?? ''}
                onChange={e => updateField('website_url', e.target.value || null)}
                placeholder="https://"
                className={inputCls}
              />
            ) : formData.website_url ? (
              <a href={formData.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate inline-block max-w-full">
                {formData.website_url}
              </a>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Field>
        </Section>

        {/* Section: Classification */}
        <Section title={t('sign.section.classification')}>
          <Field label={t('sign.field.priceLevel')}>
            {editing ? (
              <select
                value={formData.price_level ?? ''}
                onChange={e => updateField('price_level', e.target.value === '' ? null : Number(e.target.value))}
                className={inputCls}
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>{'¥'.repeat(n)} ({n})</option>
                ))}
              </select>
            ) : formData.price_level ? (
              <span>{'¥'.repeat(formData.price_level)} ({formData.price_level})</span>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Field>
          <Field label={t('sign.field.languages')}>
            {editing ? (
              <input
                value={arrToStr(formData.languages_supported)}
                onChange={e => updateField('languages_supported', strToArr(e.target.value))}
                placeholder={t('sign.commaHint')}
                className={inputCls}
              />
            ) : formData.languages_supported.length > 0 ? (
              <span className="font-mono text-xs">{formData.languages_supported.join(', ')}</span>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Field>
          <Field label={t('sign.field.tags')} colSpan={2}>
            {editing ? (
              <input
                value={arrToStr(formData.tags)}
                onChange={e => updateField('tags', strToArr(e.target.value))}
                placeholder={t('sign.commaHint')}
                className={inputCls}
              />
            ) : formData.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {formData.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-surface-2 text-text-muted border border-border">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Field>
        </Section>

        {/* Section: Skills */}
        <Section title={t('sign.section.skills')}>
          <Field label={t('sign.field.skills')} colSpan={2}>
            {editing ? (
              <input
                value={arrToStr(formData.supported_skills)}
                onChange={e => updateField('supported_skills', strToArr(e.target.value))}
                placeholder={t('sign.commaHint')}
                className={`${inputCls} font-mono`}
              />
            ) : formData.supported_skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {formData.supported_skills.map(s => (
                  <span
                    key={s}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Field>
        </Section>

        {/* Section: Specifics — type-aware UI for hotels, generic KV otherwise */}
        <Section title={t('sign.section.specifics')}>
          {isHotel ? (
            <HotelSpecifics
              specific={formData.specific_fields as Record<string, unknown>}
              editing={editing}
              updateSpecific={updateSpecific}
              arrToStr={arrToStr}
              strToArr={strToArr}
            />
          ) : (
            <GenericSpecifics
              specific={formData.specific_fields as Record<string, unknown>}
              editing={editing}
              updateSpecific={updateSpecific}
            />
          )}
        </Section>
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-white border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3 pb-1 border-b border-border">
        {title}
      </h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">{children}</dl>
    </div>
  )
}

function Field({
  label,
  colSpan = 1,
  children,
}: {
  label: string
  colSpan?: 1 | 2
  children: React.ReactNode
}) {
  return (
    <div className={colSpan === 2 ? 'sm:col-span-2' : ''}>
      <dt className="text-text-muted text-xs uppercase tracking-wider mb-1">{label}</dt>
      <dd className="text-text font-medium">{children}</dd>
    </div>
  )
}

function HotelSpecifics({
  specific,
  editing,
  updateSpecific,
  arrToStr,
  strToArr,
}: {
  specific: Record<string, unknown>
  editing: boolean
  updateSpecific: (key: string, value: unknown) => void
  arrToStr: (a: string[]) => string
  strToArr: (s: string) => string[]
}) {
  const star = typeof specific.star_rating === 'number' ? specific.star_rating : null
  const rooms = Array.isArray(specific.room_types) ? (specific.room_types as string[]) : []
  const checkIn = typeof specific.check_in_time === 'string' ? specific.check_in_time : ''
  const checkOut = typeof specific.check_out_time === 'string' ? specific.check_out_time : ''
  const breakfast = Boolean(specific.breakfast_included)
  const parking = Boolean(specific.parking_available)

  return (
    <>
      <Field label="Star rating">
        {editing ? (
          <select
            value={star ?? ''}
            onChange={e => updateSpecific('star_rating', e.target.value === '' ? null : Number(e.target.value))}
            className={inputCls}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>
            ))}
          </select>
        ) : star ? (
          <span>{'★'.repeat(star)} ({star})</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Field>
      <Field label="Check-in / Check-out">
        {editing ? (
          <div className="flex gap-2">
            <input
              value={checkIn}
              onChange={e => updateSpecific('check_in_time', e.target.value)}
              placeholder="15:00"
              className={inputCls}
            />
            <input
              value={checkOut}
              onChange={e => updateSpecific('check_out_time', e.target.value)}
              placeholder="12:00"
              className={inputCls}
            />
          </div>
        ) : (
          <span className="font-mono text-xs">{checkIn || '—'} / {checkOut || '—'}</span>
        )}
      </Field>
      <Field label="Room types" colSpan={2}>
        {editing ? (
          <input
            value={arrToStr(rooms)}
            onChange={e => updateSpecific('room_types', strToArr(e.target.value))}
            placeholder="Deluxe, Suite, Presidential"
            className={inputCls}
          />
        ) : rooms.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {rooms.map(r => (
              <span key={r} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent border border-accent/20">
                {r}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Field>
      <Field label="Breakfast included">
        {editing ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={breakfast}
              onChange={e => updateSpecific('breakfast_included', e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            <span>{breakfast ? 'Yes' : 'No'}</span>
          </label>
        ) : (
          <span>{breakfast ? '✓ Yes' : '✗ No'}</span>
        )}
      </Field>
      <Field label="Parking available">
        {editing ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={parking}
              onChange={e => updateSpecific('parking_available', e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            <span>{parking ? 'Yes' : 'No'}</span>
          </label>
        ) : (
          <span>{parking ? '✓ Yes' : '✗ No'}</span>
        )}
      </Field>
    </>
  )
}

function GenericSpecifics({
  specific,
  editing,
  updateSpecific,
}: {
  specific: Record<string, unknown>
  editing: boolean
  updateSpecific: (key: string, value: unknown) => void
}) {
  const entries = Object.entries(specific ?? {})
  if (entries.length === 0) {
    return (
      <Field label="—" colSpan={2}>
        <span className="text-text-muted text-xs italic">No type-specific fields</span>
      </Field>
    )
  }
  return (
    <>
      {entries.map(([key, value]) => (
        <Field key={key} label={key}>
          {editing ? (
            <input
              value={String(value ?? '')}
              onChange={e => updateSpecific(key, e.target.value)}
              className={inputCls}
            />
          ) : (
            <span className="text-xs font-mono break-all">{String(value)}</span>
          )}
        </Field>
      ))}
    </>
  )
}
