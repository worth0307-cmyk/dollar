'use client'

import { useRef, useEffect, useState } from 'react'
import { ASSETS, ASSET_BY_KEY } from '@/lib/assets'
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
  let best: MacroEvent | null = null
  let bestDiff = Infinity
  for (const e of events) {
    const diffDays = (ts - new Date(e.date).getTime()) / 86400000
    // Backward up to 30 days (post-event reaction), forward up to 3 days
    // (pre-event positioning / anticipation trading)
    if (diffDays > 30 || diffDays < -3) continue
    const absDiff = Math.abs(diffDays)
    if (absDiff < bestDiff) {
      bestDiff = absDiff
      best = e
    }
  }
  return best
}

export default function NotableMoves({
  moves,
  events = [],
  selectedMove,
  onSelectMove,
}: {
  moves: Move[]
  events?: MacroEvent[]
  selectedMove?: { key: string; time: number } | null
  onSelectMove?: (m: { key: string; time: number }) => void
}) {
  const [filter, setFilter] = useState<Set<string>>(new Set())
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const toggleFilter = (key: string) =>
    setFilter((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  useEffect(() => {
    if (!selectedMove) return
    const key = `${selectedMove.key}-${selectedMove.time}`
    const el = rowRefs.current.get(key)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedMove])

  const displayed = filter.size > 0 ? moves.filter((m) => filter.has(m.key)) : moves

  if (!moves?.length) {
    return (
      <div className="text-sm text-slate-500 py-6 text-center">此区间无明显异动</div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Asset filter chips */}
      <div className="flex gap-1 flex-wrap mb-2">
        {ASSETS.map((a) => {
          const on = filter.has(a.key)
          const count = moves.filter((m) => m.key === a.key).length
          return (
            <button
              key={a.key}
              onClick={() => toggleFilter(a.key)}
              title={`筛选 ${a.symbol}（${count}）`}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 min-h-[36px] rounded-md border transition-colors ${
                on
                  ? 'border-transparent text-gray-900 font-medium'
                  : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
              style={on ? { backgroundColor: a.color, borderColor: a.color } : {}}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: on ? 'rgba(0,0,0,0.4)' : a.color }}
              />
              {a.symbol}
              <span className={on ? 'opacity-70' : 'opacity-60'}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
      {displayed.length === 0 ? (
        <div className="text-sm text-slate-500 py-6 text-center">无匹配记录</div>
      ) : displayed.map((m, i) => {
        const meta = ASSET_BY_KEY[m.key]
        const up = m.changePct >= 0
        const near = nearestEvent(m.time, events)
        const rowKey = `${m.key}-${m.time}`
        const isSelected = selectedMove?.key === m.key && selectedMove?.time === m.time
        const color = meta?.color ?? '#888'

        return (
          <div
            key={`${rowKey}-${i}`}
            ref={(el) => {
              if (el) rowRefs.current.set(rowKey, el)
              else rowRefs.current.delete(rowKey)
            }}
            className="flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors min-w-0 cursor-pointer hover:bg-gray-800/60"
            style={
              isSelected
                ? {
                    backgroundColor: `${color}18`,
                    boxShadow: `inset 0 0 0 1px ${color}40`,
                  }
                : undefined
            }
            onClick={() => onSelectMove?.({ key: m.key, time: m.time })}
          >
            {/* Date — abbreviated on narrow screens to leave room for event title */}
            <span className="font-mono text-[11px] sm:text-sm text-slate-300 shrink-0">
              <span className="hidden sm:inline">{fmtDate(m.time)}</span>
              <span className="sm:hidden">{fmtDate(m.time).slice(5)}</span>
            </span>

            {/* Asset dot + symbol */}
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta?.color }} />
            <span className="text-sm text-slate-200 w-[3.25rem] shrink-0">{meta?.symbol}</span>

            {/* Change % */}
            <span className={`font-mono font-medium text-sm shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{m.changePct.toFixed(2)}%
            </span>

            {/* Nearest event — blank is legitimate (no macro event in the
                causal window), shown explicitly rather than left empty. */}
            <div className="flex-1 min-w-0 mx-1">
              {!near && (
                <span className="text-xs text-gray-700 italic">无关联事件</span>
              )}
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
                  {near.url && (
                    <a
                      href={near.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-600 hover:text-blue-400 transition-colors text-[13px] leading-none shrink-0"
                      title="查看详情"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↗
                    </a>
                  )}
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
    </div>
  )
}
