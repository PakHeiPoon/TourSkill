import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ExternalLink, Copy, Check, X } from 'lucide-react'

const REGISTRY_CONTRACT = '0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543'
const CHAINSCAN_ADDRESS = 'https://chainscan-galileo.0g.ai/address'
const CHAINSCAN_TX = 'https://chainscan-galileo.0g.ai/tx'

interface OnChainBadgeProps {
  walletAddress?: string | null
  did?: string | null
  profileHash?: string | null
  registerTxHash?: string | null
}

function shortHex(s: string | null | undefined, head = 6, tail = 4): string {
  if (!s) return ''
  if (s.length <= head + tail + 2) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

function shortDid(did: string | null | undefined): string {
  if (!did) return ''
  // did:tourskill:merchant:fc41644bf15f → did:tourskill:merchant:fc41…
  const parts = did.split(':')
  if (parts.length < 4) return did
  const last = parts[parts.length - 1]
  return parts.slice(0, -1).join(':') + ':' + last.slice(0, 4) + '…'
}

interface CopyButtonProps {
  value: string
  label?: string
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState<boolean>(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore — older browsers
    }
  }
  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-primary hover:bg-primary-soft transition-colors"
      aria-label={`Copy ${label ?? 'value'}`}
    >
      {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

export default function OnChainBadge({ walletAddress, did, profileHash, registerTxHash }: OnChainBadgeProps): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLButtonElement>(null)

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (badgeRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div className="relative inline-block">
      <button
        ref={badgeRef}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-soft border border-primary/30 rounded-md text-[10px] font-semibold text-primary hover:bg-primary/15 hover:border-primary/50 transition-colors"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
        <span>on-chain</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          className="absolute z-30 right-0 mt-2 w-[320px] bg-white rounded-xl shadow-2xl shadow-text/10 border border-border p-4 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              On-chain proof
            </h4>
            <button
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-surface-2 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>

          <dl className="space-y-3 text-xs">
            {walletAddress && (
              <div>
                <dt className="text-text-muted font-medium mb-1">Owner wallet</dt>
                <dd className="flex items-center gap-1.5 font-mono text-text">
                  <span>{shortHex(walletAddress)}</span>
                  <CopyButton value={walletAddress} label="wallet address" />
                  <a
                    href={`${CHAINSCAN_ADDRESS}/${walletAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary-hover font-sans font-medium"
                  >
                    <span>chainscan</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </dd>
              </div>
            )}

            {did && (
              <div>
                <dt className="text-text-muted font-medium mb-1">Merchant DID</dt>
                <dd className="flex items-center gap-1.5 font-mono text-text">
                  <span className="truncate">{shortDid(did)}</span>
                  <CopyButton value={did} label="DID" />
                </dd>
              </div>
            )}

            {profileHash && (
              <div>
                <dt className="text-text-muted font-medium mb-1">Profile hash</dt>
                <dd className="flex items-center gap-1.5 font-mono text-text">
                  <span className="truncate">{shortHex(profileHash, 8, 4)}</span>
                  <CopyButton value={profileHash} label="profile hash" />
                </dd>
              </div>
            )}

            <div>
              <dt className="text-text-muted font-medium mb-1">Registry contract</dt>
              <dd className="flex items-center gap-1.5 font-mono text-text">
                <span>{shortHex(REGISTRY_CONTRACT)}</span>
                <a
                  href={`${CHAINSCAN_ADDRESS}/${REGISTRY_CONTRACT}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary-hover font-sans font-medium"
                >
                  <span>view</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </dd>
            </div>
          </dl>

          {registerTxHash && (
            <a
              href={`${CHAINSCAN_TX}/${registerTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-hover transition-colors"
            >
              <span>View register tx on chainscan</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <p className="mt-3 pt-3 border-t border-border text-[10px] text-text-muted leading-relaxed">
            Anchored on 0G Galileo testnet (chainId 16602) via the
            ERC-8004 MerchantRegistry contract.
          </p>
        </div>
      )}
    </div>
  )
}
