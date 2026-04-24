import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Terminal } from 'lucide-react'

/**
 * AgentLoopDemo — static terminal-style animation of the SKILL.md flow.
 *
 * Plays automatically when scrolled into view. Loops with a pause between runs.
 * No network calls — pure marketing demo. Real interactive demo lives at /demo.
 */

type LineKind =
  | 'prompt'      // > User: ...
  | 'header'      // [Step 1/4] ...
  | 'comment'     // grey explainer
  | 'json'        // structured output
  | 'arrow'       //   → result
  | 'success'     // ✓ confirmation
  | 'spacer'      // empty line

interface DemoLine {
  kind: LineKind
  text: string
  delay?: number  // ms before this line appears (defaults to 350ms)
}

const SCRIPT: DemoLine[] = [
  { kind: 'prompt', text: 'Find me dinner in Hangzhou tomorrow, party of 4 — budget under ¥100/pp', delay: 0 },
  { kind: 'spacer', text: '' },

  { kind: 'header', text: '[Step 1/4] Classifying intent…', delay: 700 },
  { kind: 'json', text: '{ category: "restaurant", city: "hangzhou", date: "2026-04-25",' },
  { kind: 'json', text: '  party_size: 4, budget_per_person: 100 }' },
  { kind: 'spacer', text: '' },

  { kind: 'header', text: '[Step 2/4] POST /v1/discover  →  on-chain registry', delay: 600 },
  { kind: 'arrow', text: '→ 3 candidates returned (verified DIDs):' },
  { kind: 'comment', text: '   • Zhi Wei Guan         did:tourskill:merchant:ad8a…' },
  { kind: 'comment', text: '   • Green Tea Restaurant did:tourskill:merchant:fa5d…' },
  { kind: 'comment', text: '   • Grandma\'s Kitchen    did:tourskill:merchant:fc41…' },
  { kind: 'spacer', text: '' },

  { kind: 'header', text: '[Step 3/4] Personalizing rank from your memory…', delay: 700 },
  { kind: 'comment', text: '   reading prefs: budget ≤¥100, prefers home-style Zhejiang' },
  { kind: 'arrow', text: '→ #1  Grandma\'s Kitchen     score=6   ¥65/pp' },
  { kind: 'arrow', text: '→ #2  Zhi Wei Guan          score=3   ¥50/pp' },
  { kind: 'arrow', text: '→ #3  Green Tea Restaurant  score=3   ¥80/pp' },
  { kind: 'spacer', text: '' },

  { kind: 'header', text: '[Step 4/4] POST /v1/merchants/{merchant_id}/reserve_table', delay: 700 },
  { kind: 'success', text: '✓ Reservation RES-69CB7F4B confirmed' },
  { kind: 'success', text: '✓ Tomorrow 19:00 · party of 4 · window seat' },
  { kind: 'success', text: '✓ x402 settlement: 0.0021 0G  ·  hash: 0xb496f9ee…' },
  { kind: 'spacer', text: '' },

  { kind: 'header', text: 'Done in 4 calls · no OTA · agent-to-agent.', delay: 500 },
]

const LINE_DELAY_DEFAULT = 350
const LOOP_PAUSE = 4500

function lineColor(kind: LineKind): string {
  switch (kind) {
    case 'prompt':  return 'text-white'
    case 'header':  return 'text-amber-400 font-semibold'
    case 'comment': return 'text-slate-400'
    case 'json':    return 'text-emerald-300'
    case 'arrow':   return 'text-teal-300'
    case 'success': return 'text-green-400'
    case 'spacer':  return ''
  }
}

function linePrefix(kind: LineKind): string {
  if (kind === 'prompt') return '> '
  return ''
}

export default function AgentLoopDemo(): React.JSX.Element {
  const [visibleCount, setVisibleCount] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const timeoutsRef = useRef<number[]>([])

  // Cleanup any pending timers
  const clearAllTimers = (): void => {
    timeoutsRef.current.forEach(id => window.clearTimeout(id))
    timeoutsRef.current = []
  }

  // Schedule the full script
  const playScript = (): void => {
    clearAllTimers()
    setVisibleCount(0)
    setIsPlaying(true)

    let cumulative = 200
    SCRIPT.forEach((line, idx) => {
      cumulative += line.delay ?? LINE_DELAY_DEFAULT
      const id = window.setTimeout(() => {
        setVisibleCount(idx + 1)
      }, cumulative)
      timeoutsRef.current.push(id)
    })

    // Schedule loop restart
    const finishId = window.setTimeout(() => {
      setIsPlaying(false)
      const restartId = window.setTimeout(() => playScript(), LOOP_PAUSE)
      timeoutsRef.current.push(restartId)
    }, cumulative + 800)
    timeoutsRef.current.push(finishId)
  }

  // Auto-start when scrolled into view; pause when out
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (timeoutsRef.current.length === 0) playScript()
        } else {
          clearAllTimers()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearAllTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep terminal scrolled to the latest line
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleCount])

  return (
    <section ref={containerRef} className="w-full max-w-4xl mx-auto px-4 mt-32">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-text/5 border border-border px-3 py-1 rounded-full text-text-muted text-xs font-medium mb-4">
          <Terminal className="w-3.5 h-3.5" />
          <span>Live demo · no real charges</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-text tracking-tight mb-3">
          Watch your agent work
        </h2>
        <p className="text-text-muted max-w-xl mx-auto">
          Four HTTP calls. One on-chain receipt. No platform in between.
        </p>
      </div>

      {/* Terminal window */}
      <div className="rounded-xl overflow-hidden shadow-2xl shadow-text/15 border border-text/10">
        {/* Mac-style chrome bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="text-slate-400 text-xs font-mono">
            tourskill agent · {isPlaying ? 'running' : 'idle'}
          </div>
          <button
            onClick={() => playScript()}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium transition-colors"
            aria-label="Replay demo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Replay</span>
          </button>
        </div>

        {/* Terminal body */}
        <div
          ref={scrollRef}
          className="bg-slate-900 px-5 py-5 font-mono text-sm leading-[1.65] h-[380px] overflow-y-auto"
        >
          {SCRIPT.slice(0, visibleCount).map((line, idx) => (
            <div
              key={idx}
              className={`${lineColor(line.kind)} animate-in fade-in slide-in-from-left-1 duration-300`}
            >
              {line.kind === 'spacer' ? <>&nbsp;</> : (
                <>
                  <span className="text-slate-600 select-none">{linePrefix(line.kind)}</span>
                  {line.text}
                </>
              )}
            </div>
          ))}
          {/* Blinking cursor */}
          {isPlaying && visibleCount < SCRIPT.length && (
            <span className="inline-block w-2 h-4 bg-teal-300 align-middle animate-pulse" />
          )}
          {visibleCount === SCRIPT.length && !isPlaying && (
            <div className="text-slate-500 mt-3 text-xs">
              ── replays in a few seconds ──
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-text-muted text-sm mt-6">
        Want to actually try it?{' '}
        <a
          href="https://backend-lilac-xi-18.vercel.app/skills/user-client/SKILL.md"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:text-primary-hover font-semibold"
        >
          Install the skill →
        </a>
      </p>
    </section>
  )
}
