'use client'

import { ASSET_BY_KEY } from '@/lib/assets'
import type { MacroEvent } from '@/lib/events'

interface Move {
  time: number
  key: string
  changePct: number
  z: number
}

const IMPACT_COLOR: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#94A3B8',
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function fmtEventDate(s: string) {
  const [y, m, dd] = s.split('-')
  return `${y}.${m}.${dd}`
}

function nearestEvent(ts: number, events: MacroEvent[]): MacroEvent | null {
  const moveDate = new Date(ts).toISOString().slice(0, 10)
  let best: MacroEvent | null = null
  let bestDiff = Infinity
  for (const e of events) {
    if (e.date > moveDate) continue // only look backward
    const diff = (ts - new Date(e.date).getTime()) / 86400000
    if (diff <= 45 && diff < bestDiff) {
      bestDiff = diff
      best = e
    }
  }
  return best
}

export default function NotableMoves({
  moves,
  events = [],
}: {
  moves: Move[]
  events?: MacroEvent[]
}) {
  if (!moves?.length) {
    return (
      <div className="text-sm text-slate-500 py-6 text-center">此区间无明显异动</div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-0.5" style={{ maxHeight: '320px' }}>
      {moves.map((m, i) => {
        const meta = ASSET_BY_KEY[m.key]
        const up = m.changePct >= 0
        const near = nearestEvent(m.time, events)

        return (
          <div
            key={`${m.key}-${m.time}-${i}`}
            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-800/60 transition-colors min-w-0"
          >
            {/* Date */}
            <span className="font-mono text-sm text-slate-300 shrink-0">
              {fmtDate(m.time)}
            </span>

            {/* Asset dot + symbol */}
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta?.color }} />
            <span className="text-sm text-slate-200 w-[3.25rem] shrink-0">{meta?.symbol}</span>

            {/* Change % */}
            <span className={`font-mono font-medium text-sm shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{m.changePct.toFixed(2)}%
            </span>

            {/* Nearest event — fills the red-box area between % and σ */}
            <div className="flex-1 min-w-0 mx-1">
              {near && (
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className="font-mono text-xs shrink-0"
                    style={{ color: IMPACT_COLOR[near.impact] }}
                  >
                    {fmtEventDate(near.date)}
                  </span>
                  <span className="text-xs text-gray-100 truncate" title={near.title}>
                    {near.title}
                  </span>
                </div>
              )}
            </div>

            {/* σ */}
            <span className="font-mono text-sm text-slate-500 shrink-0">
              {Math.abs(m.z).toFixed(1)}σ
            </span>
          </div>
        )
      })}
    </div>
  )
}
