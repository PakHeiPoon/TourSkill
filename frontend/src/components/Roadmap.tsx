import { CheckCircle2, Wrench, MapPinned } from 'lucide-react'
import { useT } from '../i18n'

type RoadmapStatus = 'live' | 'building' | 'planned'

interface RoadmapItem {
  status: RoadmapStatus
  title: string
  detail: string
}

const ITEMS: RoadmapItem[] = [
  // ─── Live ───
  {
    status: 'live',
    title: 'ERC-8004 registries on Base Sepolia',
    detail: 'IdentityRegistry · ReputationRegistry · ValidationRegistry — all three deployed and Basescan-verified, evmVersion cancun, 73 Foundry tests at 100% coverage.',
  },
  {
    status: 'live',
    title: 'Merchant-agent template (open source)',
    detail: 'Hono + Drizzle + better-sqlite3 reference implementation. EIP-191 challenge auth, 5 hotel skills, canonical-JSON agent-card with SHA-256 header. 36 vitest tests green.',
  },
  {
    status: 'live',
    title: 'First live agent — wumingchu (#1)',
    detail: 'Wuming Chu · Huangshan Hidden Retreat live at wumingchu.tourskill.paking.xyz on Fly Tokyo. Registered as agentId 1 on IdentityRegistry, byte-equivalent hash on chain and URL.',
  },
  {
    status: 'live',
    title: 'Trustless discovery in /explorer',
    detail: 'This page reads IdentityRegistry directly via ethers v6 — no backend proxy. Each agent fetches its own card, browser computes SHA-256, compares with on-chain commit, then calls skills against the agent URL.',
  },

  // ─── Building ───
  {
    status: 'building',
    title: 'Mainnet via canonical registry',
    detail: 'Deploy switch lands Concourse agents on the shared ERC-8004 mainnet address (0x8004A169…A432). 8004scan and the broader ecosystem auto-index us — no custom indexer required.',
  },
  {
    status: 'building',
    title: 'MCP server route on agent',
    detail: 'Same business logic, second wire format. Any MCP client (Claude Desktop, custom agents) can list and invoke skills as native tools alongside the existing REST surface.',
  },
  {
    status: 'building',
    title: 'Frontend full rewire to Base',
    detail: 'Retire the legacy 0G demo grid. /merchant/sign writes to Base IdentityRegistry via MetaMask. Profile pages, Explorer, and skill execution all read live on-chain truth.',
  },

  // ─── Planned ───
  {
    status: 'planned',
    title: 'x402 paid-skill micropayments',
    detail: 'Stateless per-call USDC payments via EIP-3009 transferWithAuthorization — the standard Coinbase x402 handshake, used as Coinbase published it. Separate from booking-level settlement.',
  },
  {
    status: 'planned',
    title: 'BookingEscrow + ReputationRegistry',
    detail: 'EIP-712 Seaport-style escrow for held funds, time-locked release, dispute window. Settled bookings auto-authorize feedback in ReputationRegistry — Sybil-resistant reviews by construction.',
  },
  {
    status: 'planned',
    title: 'Multi-tenant SaaS + @concourse/cli',
    detail: 'Platform-hosted multi-tenant runtime so 95% of merchants get zero-ops SaaS pricing (free tier + paid). Independent npm CLI for developers integrating the protocol from any language.',
  },
]

const STATUS_META: Record<RoadmapStatus, { labelKey: string; cls: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  live:     { labelKey: 'roadmap.status.live',     cls: 'bg-primary-soft text-primary border-primary/30',   icon: CheckCircle2 },
  building: { labelKey: 'roadmap.status.building', cls: 'bg-accent-soft text-accent border-accent/30',     icon: Wrench },
  planned:  { labelKey: 'roadmap.status.planned',  cls: 'bg-surface-2 text-text-muted border-border-strong', icon: MapPinned },
}

export default function Roadmap(): React.JSX.Element {
  const { t } = useT()
  const grouped: Record<RoadmapStatus, RoadmapItem[]> = {
    live:     ITEMS.filter(i => i.status === 'live'),
    building: ITEMS.filter(i => i.status === 'building'),
    planned:  ITEMS.filter(i => i.status === 'planned'),
  }

  return (
    <section className="w-full max-w-5xl mx-auto px-4 mt-32">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-text/5 border border-border px-3 py-1 rounded-full text-text-muted text-xs font-medium mb-4">
          <MapPinned className="w-3.5 h-3.5" />
          <span>{t('roadmap.badge')}</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight mb-3">
          {t('roadmap.title')}
        </h2>
        <p className="text-text-muted max-w-xl mx-auto">{t('roadmap.subtitle')}</p>
      </div>

      <div className="grid gap-8">
        {(['live', 'building', 'planned'] as const).map(status => {
          const meta = STATUS_META[status]
          const items = grouped[status]
          if (items.length === 0) return null
          const Icon = meta.icon
          return (
            <div key={status}>
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wider ${meta.cls}`}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {t(meta.labelKey)}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {items.map(item => (
                  <article
                    key={item.title}
                    className={`p-5 rounded-2xl bg-surface border transition-colors ${
                      status === 'live'
                        ? 'border-primary/30 hover:border-primary/60'
                        : status === 'building'
                          ? 'border-accent/30 hover:border-accent/60'
                          : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <h3 className="text-text font-semibold text-sm mb-2 leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-text-muted text-xs leading-relaxed">
                      {item.detail}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
