'use client'

import { useState } from 'react'
import { ASSET_BY_KEY } from '@/lib/assets'
import type { MacroEvent } from '@/lib/events'

interface Move {
  time: number
  key: string
  changePct: number
  z: number
}

interface Props {
  moves: Move[]
  past: MacroEvent[]
  upcoming: MacroEvent[]
}

type Tab = 'moves' | 'upcoming' | 'past'

function fmtMoveDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function fmtEventDate(s: string) {
  const [y, m, dd] = s.split('-')
  return `${y}.${m}.${dd}`
}

const IMPACT_COLOR: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#94A3B8',
}
const IMPACT_LABEL: Record<string, string> = { high: '重大', medium: '中等', low: '次要' }

function nearestEvent(ts: number, events: MacroEvent[]): MacroEvent | null {
  let best: MacroEvent | null = null
  let bestDiff = Infinity
  for (const e of events) {
    const diff = Math.abs(new Date(e.date).getTime() - ts)
    if (diff / 86400000 <= 14 && diff < bestDiff) {
      bestDiff = diff
      best = e
    }
  }
  return best
}

function MovesPanel({ moves, allEvents }: { moves: Move[]; allEvents: MacroEvent[] }) {
  if (!moves.length) {
    return (
      <div className="text-xs text-gray-500 py-8 text-center">此区间无明显异动</div>
    )
  }
  return (
    <div className="space-y-0.5">
      {moves.map((m, i) => {
        const meta = ASSET_BY_KEY[m.key]
        const up = m.changePct >= 0
        const near = nearestEvent(m.time, allEvents)
        return (
          <div
            key={`${m.key}-${m.time}-${i}`}
            className="py-1.5 px-2 rounded-md hover:bg-gray-800/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] text-gray-500 shrink-0 w-[5.5rem]">
                {fmtMoveDate(m.time)}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta?.color }} />
                <span className="text-[11px] text-gray-300 w-[3.5rem] truncate">{meta?.symbol}</span>
              </span>
              <span
                className={`font-mono font-medium text-[11px] shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {up ? '+' : ''}
                {m.changePct.toFixed(2)}%
              </span>
              <span className="font-mono text-[11px] text-gray-600 ml-auto shrink-0">
                {Math.abs(m.z).toFixed(1)}σ
              </span>
            </div>
            {near && (
              <div className="flex items-center gap-1.5 mt-0.5 pl-[5.5rem] min-w-0">
                <span
                  className="text-[10px] px-1 py-px rounded shrink-0"
                  style={{
                    color: IMPACT_COLOR[near.impact],
                    backgroundColor: `${IMPACT_COLOR[near.impact]}20`,
                  }}
                >
                  {fmtEventDate(near.date)}
                </span>
                <span className="text-[10px] text-gray-500 truncate">{near.title}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EventsPanel({ events, isUpcoming }: { events: MacroEvent[]; isUpcoming: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  if (!events.length) {
    return <div className="text-xs text-gray-500 py-8 text-center">暂无数据</div>
  }
  return (
    <div className="space-y-0.5">
      {events.map((e, i) => (
        <div
          key={`${e.date}-${i}`}
          className="py-1.5 px-2 rounded-md cursor-pointer hover:bg-gray-800/60 transition-colors"
          onClick={() => setOpenIdx(openIdx === i ? null : i)}
        >
          <div className="flex items-start gap-2 min-w-0">
            <div
              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isUpcoming ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: IMPACT_COLOR[e.impact] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] text-gray-500 block">{fmtEventDate(e.date)}</span>
                  <span className="text-xs text-gray-300 leading-tight">{e.title}</span>
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium"
                  style={{
                    color: IMPACT_COLOR[e.impact],
                    backgroundColor: `${IMPACT_COLOR[e.impact]}20`,
                  }}
                >
                  {IMPACT_LABEL[e.impact]}
                </span>
              </div>
              {openIdx === i && (
                <div className="mt-1.5 animate-fade-up">
                  <p className="text-[11px] text-gray-400 leading-relaxed">{e.description}</p>
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {e.assets.map((k) => (
                      <span
                        key={k}
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{
                          backgroundColor: `${ASSET_BY_KEY[k]?.color ?? '#888'}18`,
                          color: ASSET_BY_KEY[k]?.color ?? '#888',
                        }}
                      >
                        {ASSET_BY_KEY[k]?.symbol ?? k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MovesAndEvents({ moves, past, upcoming }: Props) {
  const [tab, setTab] = useState<Tab>('moves')
  const allEvents = [...past, ...upcoming]

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'moves', label: '异动', count: moves.length },
    { key: 'upcoming', label: '即将事件', count: upcoming.length },
    { key: 'past', label: '历史事件', count: past.length },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-3 border-b border-gray-800 pb-2.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              tab === t.key
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] opacity-60">{t.count}</span>
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-500 self-center hidden sm:block">
          {tab === 'moves' ? '圆点 = 关联宏观事件' : '点击展开详情'}
        </span>
      </div>

      {/* Scrollable content panel */}
      <div className="overflow-y-auto max-h-64">
        {tab === 'moves' && <MovesPanel moves={moves} allEvents={allEvents} />}
        {tab === 'upcoming' && <EventsPanel events={upcoming} isUpcoming />}
        {tab === 'past' && <EventsPanel events={past} isUpcoming={false} />}
      </div>
    </div>
  )
}
