/**
 * Wallet challenge-response auth helper.
 *
 * Flow (browser-side):
 *   1. POST /v1/auth/challenge  { wallet_address }  → { nonce, message }
 *   2. MetaMask personal_sign(message)               → 65-byte signature
 *   3. POST /v1/auth/verify  { wallet, nonce, sig } → { token, expires_at }
 *   4. Cache { token, wallet, expiresAt } in sessionStorage so the same
 *      tab doesn't re-prompt MetaMask on every PATCH.
 *
 * Why sessionStorage (not localStorage):
 *   - Tokens are short-lived session credentials (30-day TTL on the
 *     server). Leaving them in localStorage means they survive tab close
 *     and persist across any same-origin script — a bigger blast radius
 *     than sessionStorage, which is per-tab and cleared on close.
 *   - If the user needs a longer-lived handoff (passing the token to an
 *     off-machine agent), the ProfilePage "Install to agent" card surfaces
 *     the token explicitly for the user to copy — no silent persistence.
 */

import { BrowserProvider } from 'ethers'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://api.tourskill.paking.xyz'
const STORAGE_PREFIX = 'concourse_auth:'

interface StoredSession {
  token: string
  wallet: string
  expiresAt: string
}

function storageKey(wallet: string): string {
  return STORAGE_PREFIX + wallet.toLowerCase()
}

export function getCachedToken(wallet: string): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey(wallet))
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    // Treat anything within 60s of expiry as already expired so we
    // never hand back a token that dies mid-request.
    if (new Date(s.expiresAt).getTime() - Date.now() < 60_000) {
      sessionStorage.removeItem(storageKey(wallet))
      return null
    }
    if (s.wallet.toLowerCase() !== wallet.toLowerCase()) return null
    return s.token
  } catch {
    return null
  }
}

export function clearCachedToken(wallet: string): void {
  try {
    sessionStorage.removeItem(storageKey(wallet))
  } catch {
    /* ignore */
  }
}

/**
 * Run the full challenge → sign → verify dance for the given wallet.
 * Prompts MetaMask exactly once (the personal_sign step). Caches the
 * resulting token in sessionStorage keyed by wallet.
 */
export async function mintToken(wallet: string): Promise<{ token: string; expiresAt: string }> {
  // 1. Challenge
  const chalRes = await fetch(`${API_BASE}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: wallet }),
  })
  if (!chalRes.ok) {
    throw new Error(`Challenge failed (${chalRes.status}): ${await chalRes.text()}`)
  }
  const { nonce, message } = (await chalRes.json()) as { nonce: string; message: string }

  // 2. personal_sign via MetaMask (no gas)
  const eth = (window as Window & { ethereum?: unknown }).ethereum
  if (!eth) throw new Error('MetaMask not found')
  const provider = new BrowserProvider(eth as any)
  const signer = await provider.getSigner()
  const signature = await signer.signMessage(message)

  // 3. Verify → mint
  const verRes = await fetch(`${API_BASE}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: wallet, nonce, signature }),
  })
  if (!verRes.ok) {
    throw new Error(`Verify failed (${verRes.status}): ${await verRes.text()}`)
  }
  const { token, expires_at } = (await verRes.json()) as { token: string; expires_at: string }

  // 4. Cache
  try {
    sessionStorage.setItem(
      storageKey(wallet),
      JSON.stringify({ token, wallet: wallet.toLowerCase(), expiresAt: expires_at }),
    )
  } catch {
    /* sessionStorage disabled — caller still gets the token */
  }

  return { token, expiresAt: expires_at }
}

/**
 * Return a valid bearer token, minting a new one via MetaMask if none is
 * cached. Call this right before any PATCH that needs auth.
 */
export async function ensureToken(wallet: string): Promise<string> {
  const cached = getCachedToken(wallet)
  if (cached) return cached
  const { token } = await mintToken(wallet)
  return token
}
