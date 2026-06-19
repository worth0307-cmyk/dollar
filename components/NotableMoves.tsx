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

function nearestEvent(ts: number, events: MacroEvent[]): MacroEvent | null {
  let best: MacroEvent | null = null
  let bestDiff = Infinity
  for (const e of events) {
    const diff = Math.abs(new Date(e.date).getTime() - ts)
    if (diff / 86400000 <= 21 && diff < bestDiff) {
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
    <div className="space-y-1">
      {moves.map((m, i) => {
        const meta = ASSET_BY_KEY[m.key]
        const up = m.changePct >= 0
        const near = nearestEvent(m.time, events)

        return (
          <div
            key={`${m.key}-${m.time}-${i}`}
            className="flex items-start gap-3 py-1.5 px-2 rounded-md hover:bg-gray-800/60 transition-colors"
          >
            {/* Left: move data */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-mono text-[11px] text-slate-400 shrink-0 w-[5rem]">
                {fmtDate(m.time)}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: meta?.color }}
              />
              <span className="text-[11px] text-slate-300 w-[3.5rem] truncate shrink-0">
                {meta?.symbol}
              </span>
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

            {/* Right: nearest macro event */}
            <div className="w-44 shrink-0">
              {near ? (
                <div
                  className="rounded px-2 py-1 text-[10px] leading-snug border"
                  style={{
                    backgroundColor: `${IMPACT_COLOR[near.impact]}10`,
                    borderColor: `${IMPACT_COLOR[near.impact]}30`,
                  }}
                >
                  <span
                    className="font-mono block mb-0.5"
                    style={{ color: IMPACT_COLOR[near.impact] }}
                  >
                    {fmtEventDate(near.date)}
                  </span>
                  <span className="text-slate-300 leading-tight line-clamp-2" title={near.title}>
                    {near.title}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-700">—</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
