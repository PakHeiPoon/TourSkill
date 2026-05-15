/**
 * Inbound auth for the merchant-agent.
 *
 * Two schemes (declared in agent-card's `authentication.schemes`):
 *
 * 1. `bearer` — opaque session token, minted via /auth/challenge →
 *    /auth/verify (mirrors Concourse backend's flow exactly so the same
 *    EIP-191 challenge-response works).
 *
 * 2. `eip191` — direct per-request signature for one-shot agent calls
 *    (no session state). Useful for agent-to-agent traffic where the
 *    caller doesn't want to mint and store a token.
 *
 * Storage: in-memory Map for v1. The merchant-agent is single-process by
 * default; multi-tenant deployment swaps in a shared store. Either way
 * the interface is the same.
 *
 * No bearer token is required for *publicly readable* skills (those with
 * `pricing.free === true` and no caller-binding semantics). Token is
 * required for skills with `idempotencyKey === 'required'` (booking) and
 * for any /admin/* route.
 */

import { createHash, randomBytes } from 'node:crypto';
import { recoverMessageAddress, type Address } from 'viem';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;       // 5 min
const TOKEN_TTL_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ChallengeRow { wallet: string; message: string; expiresAt: number }
interface TokenRow     { wallet: string; expiresAt: number }

const challenges = new Map<string, ChallengeRow>(); // nonce → row
const tokens     = new Map<string, TokenRow>();     // sha256(token) → row

function purge(): void {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k);
  for (const [k, v] of tokens)     if (v.expiresAt < now) tokens.delete(k);
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// ─── Challenge mint ───────────────────────────────────────────────────

export function mintChallenge(walletAddress: string): {
  nonce: string; message: string; expiresAt: string;
} {
  purge();
  const wallet = walletAddress.toLowerCase();
  const nonce  = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const expiresIso = new Date(expiresAt).toISOString();

  const message =
    'Concourse merchant-agent — authorize this session\n\n' +
    `Wallet: ${wallet}\n` +
    `Nonce:  ${nonce}\n` +
    `Expires: ${expiresIso}\n\n` +
    'Signing is free (off-chain). It binds your session to this agent.';

  challenges.set(nonce, { wallet, message, expiresAt });
  return { nonce, message, expiresAt: expiresIso };
}

// ─── Verify + mint token ──────────────────────────────────────────────

export async function verifyAndMintToken(
  walletAddress: string,
  nonce: string,
  signature: `0x${string}`,
): Promise<{ token: string; wallet: string; expiresAt: string }> {
  purge();
  const wallet = walletAddress.toLowerCase();
  const ch = challenges.get(nonce);
  if (!ch) throw new AuthError('Invalid or expired nonce', 400);
  if (ch.wallet !== wallet) throw new AuthError('Wallet does not match nonce', 400);

  // Recover signer
  let recovered: Address;
  try {
    recovered = await recoverMessageAddress({
      message:   ch.message,
      signature,
    });
  } catch (e) {
    throw new AuthError(`Malformed signature: ${(e as Error).message}`, 400);
  }
  if (recovered.toLowerCase() !== wallet) {
    throw new AuthError('Signature does not recover to wallet', 403);
  }

  // Burn nonce (one-shot)
  challenges.delete(nonce);

  // Mint token
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(tokenHash, { wallet, expiresAt });

  return {
    token,
    wallet,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

// ─── Resolve a bearer token to its wallet ─────────────────────────────

export function resolveToken(token: string): string | null {
  if (!token) return null;
  purge();
  const row = tokens.get(sha256Hex(token));
  return row ? row.wallet : null;
}

// ─── Verify a per-request EIP-191 sig (no bearer) ─────────────────────

/**
 * Direct mode. Caller submits:
 *   Authorization: EIP191 <0xSIG>
 *   X-Agent-Address: 0xCALLER
 *   X-Request-Hash:  0xSHA256_OF_REQUEST_BODY
 *   X-Request-Nonce: 0xRANDOM_NONCE   (deduped per-process)
 */
const seenNonces = new Map<string, number>();   // nonce → expiresAt
const NONCE_WINDOW_MS = 5 * 60 * 1000;

export async function verifyEip191Direct(args: {
  signature:    `0x${string}`;
  agentAddress: string;
  requestHash:  `0x${string}`;
  nonce:        string;
}): Promise<string> {
  const { signature, agentAddress, requestHash, nonce } = args;

  // Burn-on-use nonce
  const now = Date.now();
  for (const [k, v] of seenNonces) if (v < now) seenNonces.delete(k);
  if (seenNonces.has(nonce)) throw new AuthError('Replayed nonce', 400);
  seenNonces.set(nonce, now + NONCE_WINDOW_MS);

  // The signed message is the canonical "auth challenge" with the
  // request-hash bound in. This is intentionally a different shape from
  // the session-mint message above so a session-mint signature can never
  // be replayed as a per-request signature.
  const message =
    'Concourse merchant-agent — direct request\n\n' +
    `Caller:       ${agentAddress.toLowerCase()}\n` +
    `Request-Hash: ${requestHash}\n` +
    `Nonce:        ${nonce}\n`;

  let recovered: Address;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch (e) {
    throw new AuthError(`Malformed signature: ${(e as Error).message}`, 400);
  }

  if (recovered.toLowerCase() !== agentAddress.toLowerCase()) {
    throw new AuthError('Signature does not recover to caller', 403);
  }

  return agentAddress.toLowerCase();
}

// ─── Errors ───────────────────────────────────────────────────────────

export class AuthError extends Error {
  public readonly status: number;
  constructor(msg: string, status = 401) {
    super(msg);
    this.status = status;
    this.name = 'AuthError';
  }
}

// ─── Test hooks ───────────────────────────────────────────────────────

/** @internal Reset all in-memory auth state. Used by tests. */
export function _resetAuthState(): void {
  challenges.clear();
  tokens.clear();
  seenNonces.clear();
}
