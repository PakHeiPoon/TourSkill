import { CheckCircle2, Wrench, MapPinned } from 'lucide-react'

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
    title: 'Decentralized merchant registry',
    detail: '28 merchants registered on 0G Chain via ERC-8004. Every entry has a verifiable owner wallet, profile hash, and on-chain register tx.',
  },
  {
    status: 'live',
    title: 'Personal AI agent SKILL.md',
    detail: 'One-line install lets any agent (Claude Code, Cursor, custom) discover merchants, personalize ranking, and invoke skills.',
  },
  {
    status: 'live',
    title: 'Wallet identity dashboard',
    detail: 'Every wallet gets a profile page showing its registered merchants, with chainscan-linked proof of registration.',
  },

  // ─── Building ───
  {
    status: 'building',
    title: 'Merchant-side agent SKILL.md',
    detail: 'Mirror skill for merchant agents to register, publish profile, and respond to incoming user-agent calls — closing the A2A loop.',
  },
  {
    status: 'building',
    title: 'x402 native micropayments',
    detail: 'Payment settlement at the HTTP layer — agent pays agent per call. The first A2A registry to have payments built into the protocol.',
  },
  {
    status: 'building',
    title: 'Portable user preferences',
    detail: 'Wallet-bound profile (dietary, allergens, budget, languages) that any agent can read — preferences travel with you, not the platform.',
  },

  // ─── Planned ───
  {
    status: 'planned',
    title: 'On-chain reputation system',
    detail: 'Merchants and users earn verifiable reputation from completed transactions. Trust scores live on-chain, not in walled gardens.',
  },
  {
    status: 'planned',
    title: 'SIWE authentication',
    detail: 'Sign-In with Ethereum for write operations. Per-wallet rate limits, sovereign profile editing, and bot-resistant API access.',
  },
  {
    status: 'planned',
    title: 'Multi-chain expansion',
    detail: 'Beyond 0G testnet to 0G mainnet, then bridge identity to other EVM chains (Base, Arbitrum, Optimism).',
  },
]

const STATUS_META: Record<RoadmapStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  live:     { label: 'Live',     cls: 'bg-primary-soft text-primary border-primary/30',   icon: CheckCircle2 },
  building: { label: 'Building', cls: 'bg-accent-soft text-accent border-accent/30',     icon: Wrench },
  planned:  { label: 'Planned',  cls: 'bg-surface-2 text-text-muted border-border-strong', icon: MapPinned },
}

export default function Roadmap(): React.JSX.Element {
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
          <span>Roadmap</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight mb-3">
          What's shipped, what's next
        </h2>
        <p className="text-text-muted max-w-xl mx-auto">
          Open registry · merchant agents · payments · reputation. Built in the open.
        </p>
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
                  {meta.label}
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
