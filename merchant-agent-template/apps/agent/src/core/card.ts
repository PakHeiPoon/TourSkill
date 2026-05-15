/**
 * agent-card.json builder + canonical-form SHA-256 hash.
 *
 * The off-chain JSON document this agent serves at
 * `/.well-known/agent-card.json`. Its structure follows the A2A standard
 * (https://google.github.io/A2A/) with Concourse-specific extensions in
 * the `extensions` field, namespaced by `tourskill.org/v1/*`.
 *
 * Hash discipline:
 *   - The same Card produces the same SHA-256 hash byte-for-byte.
 *   - Achieved via canonical JSON: keys sorted, no whitespace, UTF-8.
 *   - This hash is what we commit to IdentityRegistry on chain.
 *   - Clients verify by re-hashing the served bytes; mismatch = abort.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { AgentConfig, MerchantSettings, SkillDef } from './types.js';

// ─── Skill description shape exposed to consumers ────────────────────

interface SkillCardEntry {
  name:           string;
  description:    string;
  inputSchema:    unknown;
  outputSchema:   unknown;
  endpoint:       string;
  pricing?:       SkillDef<unknown, unknown>['pricing'];
  idempotencyKey?: SkillDef<unknown, unknown>['idempotencyKey'];
}

// ─── Card structure (matches docs/architecture/03_AGENT_CARD_SPEC.md) ─

export interface AgentCard {
  schemaVersion: '1.0';
  name:          string;
  description:   string;
  url:           string;
  version:       string;
  skills:        SkillCardEntry[];
  capabilities: {
    streaming:             boolean;
    pushNotifications:     boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes:           ('bearer' | 'eip191')[];
    challengeEndpoint: string;
    verifyEndpoint:    string;
  };
  interfaces: string[];
  extensions: {
    'tourskill.org/v1/payment':       unknown;
    'tourskill.org/v1/cancellation'?: unknown;
    'tourskill.org/v1/location':      unknown;
    'tourskill.org/v1/merchant':      unknown;
    'tourskill.org/v1/i18n'?:         unknown;
  };
  provenance: {
    agentId:  number | null;
    registry: string | null;
    chain:    string;
    owner:    string;
  };
}

// ─── Build card from runtime state ───────────────────────────────────

export interface BuildCardArgs {
  config:       AgentConfig;
  settings:     MerchantSettings;
  skills:       SkillDef<unknown, unknown>[];
  agentVersion: string;                            // semver of THIS template
}

export function buildAgentCard(args: BuildCardArgs): AgentCard {
  const { config, settings, skills, agentVersion } = args;

  const en = settings.name.en ?? '';
  const enDesc = settings.description.en ?? '';

  return {
    schemaVersion: '1.0',
    name:          en,
    description:   enDesc,
    url:           config.publicUrl,
    version:       agentVersion,
    skills: skills.map((s) => ({
      name:           s.name,
      description:    s.description,
      inputSchema:    zodToJsonSchema(s.inputSchema),
      outputSchema:   zodToJsonSchema(s.outputSchema),
      endpoint:       s.endpoint,
      ...(s.pricing       !== undefined ? { pricing: s.pricing }                 : {}),
      ...(s.idempotencyKey !== undefined ? { idempotencyKey: s.idempotencyKey } : {}),
    })),
    capabilities: {
      streaming:              false,
      pushNotifications:      false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes:           ['bearer', 'eip191'],
      challengeEndpoint: '/auth/challenge',
      verifyEndpoint:    '/auth/verify',
    },
    interfaces: ['application/json'],
    extensions: {
      'tourskill.org/v1/payment': {
        method:          'x402',
        chain:           settings.payment.chain,
        chainId:         settings.payment.chainId,
        payoutAddress:   settings.payment.payoutAddress,
        currency:        settings.payment.currency,
        currencyAddress: settings.payment.currencyAddress,
        ...(settings.payment.escrow ? { escrow: settings.payment.escrow } : {}),
      },
      ...(settings.cancellationPolicy
        ? { 'tourskill.org/v1/cancellation': settings.cancellationPolicy }
        : {}),
      'tourskill.org/v1/location': settings.location,
      'tourskill.org/v1/merchant': {
        type:               settings.merchantType,
        ...(settings.tags          ? { tags:          settings.tags }          : {}),
        ...(settings.priceLevel !== undefined ? { priceLevel: settings.priceLevel } : {}),
        languagesSupported: settings.languagesSupported,
        ...(settings.specifics     ? { specifics:     settings.specifics }     : {}),
      },
      'tourskill.org/v1/i18n': {
        name:        settings.name,
        description: settings.description,
      },
    },
    provenance: {
      agentId:  config.agentId,
      registry: config.identityRegistry,
      chain:    config.chainAlias,
      owner:    config.agentOwnerAddress,
    },
  };
}

// ─── Canonical JSON + SHA-256 ────────────────────────────────────────

/**
 * Stringify with sorted keys + no whitespace. Same input = same output
 * across machines. We commit a SHA-256 of THIS exact string to chain.
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(sortKeysDeep(obj));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hash, 0x-prefixed lowercase hex. */
export function cardHash(card: AgentCard): `0x${string}` {
  const bytes = Buffer.from(canonicalJson(card), 'utf-8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  return `0x${digest}`;
}

// ─── Lightweight Zod → JSON Schema (no extra dep) ────────────────────

/**
 * We don't ship `zod-to-json-schema` to avoid the dep. The JSON Schema
 * we emit just describes the shape minimally (type, properties, required).
 * Consumers (LLM tool callers) only need this to know which fields exist;
 * they don't fully validate against it. Strict validation lives in the
 * Hono route handlers, which use the live Zod schema directly.
 */
function zodToJsonSchema(schema: z.ZodType<unknown>): unknown {
  return zodToJsonSchemaInner(schema);
}

function zodToJsonSchemaInner(s: unknown): unknown {
  if (!s || typeof s !== 'object') return { type: 'unknown' };
  const def = (s as { _def?: { typeName?: string } })._def;
  const t   = def?.typeName ?? '';

  switch (t) {
    case 'ZodString':   return { type: 'string' };
    case 'ZodNumber':   return { type: 'number' };
    case 'ZodBoolean':  return { type: 'boolean' };
    case 'ZodLiteral':  return { type: typeof (def as { value: unknown }).value, const: (def as { value: unknown }).value };
    case 'ZodEnum':     return { type: 'string', enum: (def as { values: string[] }).values };
    case 'ZodArray': {
      const inner = (def as { type: unknown }).type;
      return { type: 'array', items: zodToJsonSchemaInner(inner) };
    }
    case 'ZodObject': {
      const shape = (def as { shape: () => Record<string, unknown> }).shape();
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        const inner = v as { isOptional?: () => boolean };
        props[k] = zodToJsonSchemaInner(v);
        if (typeof inner.isOptional !== 'function' || !inner.isOptional()) required.push(k);
      }
      return { type: 'object', properties: props, required };
    }
    case 'ZodOptional': return zodToJsonSchemaInner((def as { innerType: unknown }).innerType);
    case 'ZodDefault':  return zodToJsonSchemaInner((def as { innerType: unknown }).innerType);
    case 'ZodNullable': return zodToJsonSchemaInner((def as { innerType: unknown }).innerType);
    case 'ZodRecord':   return { type: 'object', additionalProperties: true };
    case 'ZodUnknown':
    case 'ZodAny':      return {};
    default:            return { type: 'unknown' };
  }
}
