import { describe, it, expect } from 'vitest';
import { buildAgentCard, cardHash, canonicalJson } from '../src/core/card.js';
import { skills } from '../src/routes/skill_loader.js';
import type { AgentConfig, MerchantSettings } from '../src/core/types.js';

const baseConfig: AgentConfig = {
  agentId:           42,
  agentOwnerAddress: '0xOWNER',
  publicUrl:         'https://wumingchu.example.com',
  port:              8787,
  chainId:           84532,
  chainAlias:        'base-sepolia',
  rpcUrl:            'https://sepolia.base.org',
  identityRegistry:  '0xIDENTITY',
  reputationRegistry: '0xREPUTATION',
  bookingEscrow:     null,
  usdcAddress:       '0xUSDC',
  payoutAddress:     '0xPAYOUT',
  llm: { provider: null, baseUrl: null, apiKey: null, model: null },
  tenantId:          null,
};

const baseSettings: MerchantSettings = {
  name:        { en: 'Wuming Chu', zh: '无名初' },
  description: { en: '28-room boutique', zh: '28 间精品房' },
  merchantType: 'hotel',
  location: {
    country: 'CN', city: 'huangshan', address: '黄山',
    coordinates: { lat: 30.13, lng: 118.18 },
    timezone: 'Asia/Shanghai',
  },
  contact: { email: 'stay@wumingchu.com' },
  payment: {
    chain: 'base-sepolia', chainId: 84532,
    payoutAddress: '0xPAYOUT', currency: 'USDC',
    currencyAddress: '0xUSDC',
  },
  languagesSupported: ['zh', 'en'],
};

describe('agent-card builder', () => {
  it('builds a valid card with all required fields', () => {
    const card = buildAgentCard({
      config:       baseConfig,
      settings:     baseSettings,
      skills,
      agentVersion: '0.1.0',
    });
    expect(card.schemaVersion).toBe('1.0');
    expect(card.name).toBe('Wuming Chu');
    expect(card.url).toBe('https://wumingchu.example.com');
    expect(card.skills.length).toBe(skills.length);
    expect(card.skills.find((s) => s.name === 'check_availability')).toBeTruthy();
    expect(card.provenance.agentId).toBe(42);
    expect(card.provenance.chain).toBe('base-sepolia');
  });

  it('embeds concourse payment extension', () => {
    const card = buildAgentCard({
      config: baseConfig, settings: baseSettings, skills, agentVersion: '0.1.0',
    });
    const payment = card.extensions['tourskill.org/v1/payment'] as Record<string, unknown>;
    expect(payment.method).toBe('x402');
    expect(payment.chain).toBe('base-sepolia');
    expect(payment.payoutAddress).toBe('0xPAYOUT');
    expect(payment.currency).toBe('USDC');
  });

  it('embeds i18n extension when names are bilingual', () => {
    const card = buildAgentCard({
      config: baseConfig, settings: baseSettings, skills, agentVersion: '0.1.0',
    });
    const i18n = card.extensions['tourskill.org/v1/i18n'] as Record<string, { en: string; zh?: string }>;
    expect(i18n.name.zh).toBe('无名初');
  });
});

describe('canonical JSON + hash', () => {
  it('produces byte-identical output for two key-equal objects', () => {
    const a = { b: 2, a: 1, nested: { y: 'y', x: 'x' } };
    const b = { nested: { x: 'x', y: 'y' }, a: 1, b: 2 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('cardHash is deterministic across rebuilds', () => {
    const c1 = buildAgentCard({ config: baseConfig, settings: baseSettings, skills, agentVersion: '0.1.0' });
    const c2 = buildAgentCard({ config: baseConfig, settings: baseSettings, skills, agentVersion: '0.1.0' });
    expect(cardHash(c1)).toBe(cardHash(c2));
  });

  it('cardHash changes when content changes', () => {
    const c1 = buildAgentCard({ config: baseConfig, settings: baseSettings, skills, agentVersion: '0.1.0' });
    const settings2 = { ...baseSettings, name: { ...baseSettings.name, en: 'Other Hotel' } };
    const c2 = buildAgentCard({ config: baseConfig, settings: settings2, skills, agentVersion: '0.1.0' });
    expect(cardHash(c1)).not.toBe(cardHash(c2));
  });

  it('cardHash starts with 0x and has 64 hex chars after', () => {
    const c = buildAgentCard({ config: baseConfig, settings: baseSettings, skills, agentVersion: '0.1.0' });
    expect(cardHash(c)).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
