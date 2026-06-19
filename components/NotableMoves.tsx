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
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${dd}`
}

function fmtEventDate(s: string) {
  const [y, m, dd] = s.split('-')
  return `${y}.${m}.${dd}`
}

// Find the macro event closest in time to a move (within ~60 days).
function nearestEvent(ts: number, events: MacroEvent[]): MacroEvent | null {
  let best: MacroEvent | null = null
  let bestDiff = Infinity
  for (const e of events) {
    const diff = Math.abs(new Date(e.date).getTime() - ts)
    if (diff / 86400000 <= 60 && diff < bestDiff) {
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
      <div className="text-xs text-slate-500 py-6 text-center">
        此区间无明显异动
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-1" style={{ maxHeight: '320px' }}>
      {moves.map((m, i) => {
        const meta = ASSET_BY_KEY[m.key]
        const up = m.changePct >= 0
        const near = nearestEvent(m.time, events)

        return (
          <div
            key={`${m.key}-${m.time}-${i}`}
            className="py-1.5 px-2 rounded-md hover:bg-gray-800/60 transition-colors"
          >
            {/* Line 1: the move itself */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-400 shrink-0">
                {fmtDate(m.time)}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: meta?.color }}
              />
              <span className="text-[11px] text-slate-300 truncate">{meta?.symbol}</span>
              <span
                className={`font-mono font-medium text-[11px] shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {up ? '+' : ''}
                {m.changePct.toFixed(2)}%
              </span>
              <span className="font-mono text-[11px] text-slate-600 ml-auto shrink-0">
                {Math.abs(m.z).toFixed(1)}σ
              </span>
            </div>

            {/* Line 2: the related macro event (indented under the date) */}
            {near && (
              <div className="flex items-center gap-1.5 mt-1 pl-1">
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ backgroundColor: IMPACT_COLOR[near.impact] }}
                />
                <span
                  className="font-mono text-[10px] shrink-0"
                  style={{ color: IMPACT_COLOR[near.impact] }}
                >
                  {fmtEventDate(near.date)}
                </span>
                <span className="text-[10px] text-slate-400 truncate" title={near.title}>
                  {near.title}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
