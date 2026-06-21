'use client'

import { useState } from 'react'
import { ASSETS, ASSET_BY_KEY } from '@/lib/assets'
import type { MacroEvent } from '@/lib/events'

function fmtDate(d: string) {
  const [y, m, dd] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${y}.${m}.${dd} ${months[parseInt(m, 10) - 1]}`
}

const IMPACT_STYLE: Record<string, string> = {
  high:   'bg-red-500/15 text-red-400 border border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  low:    'bg-gray-500/15 text-gray-400 border border-gray-500/25',
}
const IMPACT_LABEL: Record<string, string> = { high: '重大', medium: '中等', low: '次要' }

function EventCard({ event, isUpcoming }: { event: MacroEvent; isUpcoming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasBeatMiss = !!(event.beat || event.miss)
  // Past events with auto-detected outcome show the matched analysis directly
  const autoOutcome = !isUpcoming && event.outcome
  const isNews = event.source === 'news'
  const clickable = hasBeatMiss && !autoOutcome

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div
          className={`w-2.5 h-2.5 rounded-full border-2 mt-0.5 ${
            isUpcoming
              ? 'border-blue-400 bg-transparent animate-pulse'
              : autoOutcome === 'beat'
              ? 'border-emerald-400 bg-emerald-900/50'
              : autoOutcome === 'miss'
              ? 'border-red-400 bg-red-900/50'
              : isNews
              ? 'border-sky-400 bg-sky-900/50'
              : 'border-gray-500 bg-gray-700'
          }`}
        />
        <div className="w-px flex-1 bg-gray-800 mt-1" />
      </div>

      {/* Content row: [title block] [detail] [badge] */}
      <div className="pb-4 flex-1 min-w-0">
        <div
          className={`flex items-start gap-3 ${clickable ? 'cursor-pointer select-none' : ''}`}
          onClick={clickable ? () => setExpanded((e) => !e) : undefined}
        >
          {/* Title block — for news only shows date + badge; title moves to detail */}
          <div className="w-44 shrink-0">
            <span className="text-[11px] font-mono text-gray-100 block">{fmtDate(event.date)}</span>
            {!isNews && <span className="text-sm font-medium text-gray-100">{event.title}</span>}
            <div className="mt-0.5 flex flex-wrap gap-1">
              {isNews && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/25">
                  新闻
                </span>
              )}
              {autoOutcome && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    autoOutcome === 'beat'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : 'bg-red-500/15 text-red-400 border border-red-500/25'
                  }`}
                >
                  {autoOutcome === 'beat' ? '↑ 超预期' : '↓ 不及预期'}
                </span>
              )}
            </div>
          </div>

          {/* Detail — always visible, fills available width */}
          <div className="flex-1 min-w-0">
            {/* News: translated Chinese headline sits at the top of the detail area */}
            {isNews && (
              <p className="text-sm font-medium text-gray-100 leading-snug mb-1">{event.title}</p>
            )}
            <p className="text-xs text-gray-100 leading-relaxed">{event.description}</p>
            <div className="mt-1.5 flex gap-1 flex-wrap">
              {event.assets.map((k) => (
                <span
                  key={k}
                  className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    backgroundColor: `${ASSET_BY_KEY[k]?.color ?? '#888'}18`,
                    color: ASSET_BY_KEY[k]?.color ?? '#888',
                  }}
                >
                  {ASSET_BY_KEY[k]?.symbol ?? k}
                </span>
              ))}
            </div>

            {/* Past events: show only the matched outcome analysis */}
            {autoOutcome && (
              <div className="mt-2">
                {autoOutcome === 'beat' && event.beat && (
                  <div className="text-xs text-emerald-400/80 leading-snug">
                    <span className="font-mono font-medium">↑ 超预期：</span>{event.beat}
                  </div>
                )}
                {autoOutcome === 'miss' && event.miss && (
                  <div className="text-xs text-red-400/80 leading-snug">
                    <span className="font-mono font-medium">↓ 不及预期：</span>{event.miss}
                  </div>
                )}
              </div>
            )}

            {/* Upcoming events: expandable beat/miss scenarios */}
            {!autoOutcome && expanded && hasBeatMiss && (
              <div className="mt-2 space-y-0.5">
                {event.beat && (
                  <div className="text-xs text-emerald-400/80 leading-snug">
                    <span className="font-mono font-medium">↑ 超预期：</span>{event.beat}
                  </div>
                )}
                {event.miss && (
                  <div className="text-xs text-red-400/80 leading-snug">
                    <span className="font-mono font-medium">↓ 不及预期：</span>{event.miss}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Impact badge + expand hint + optional link */}
          <div className="flex items-center gap-1.5 shrink-0 mr-1">
            {clickable && (
              <span className="text-gray-600 text-[10px] leading-none">
                {expanded ? '▲' : '▼'}
              </span>
            )}
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${IMPACT_STYLE[event.impact]}`}>
              {IMPACT_LABEL[event.impact]}
            </span>
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-gray-600 hover:text-blue-400 transition-colors text-[13px] leading-none"
                title="查看详情"
              >
                ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface Props {
  past: MacroEvent[]
  upcoming: MacroEvent[]
}

type FilterKey = 'beat' | 'miss' | 'news'

const FILTERS: Array<{ key: FilterKey; label: string; active: string; dot: string }> = [
  { key: 'beat', label: '超预期', active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-400' },
  { key: 'miss', label: '不及预期', active: 'bg-red-500/15 text-red-400 border-red-500/40', dot: 'bg-red-400' },
  { key: 'news', label: '新闻', active: 'bg-sky-500/15 text-sky-400 border-sky-500/40', dot: 'bg-sky-400' },
]

function matchesFilter(e: MacroEvent, f: FilterKey): boolean {
  if (f === 'news') return e.source === 'news'
  return e.outcome === f
}

export default function MacroEvents({ past, upcoming }: Props) {
  const [tab, setTab] = useState<'past' | 'upcoming'>('upcoming')
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())
  const [assetFilters, setAssetFilters] = useState<Set<string>>(new Set())

  const toggleFilter = (k: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const toggleAssetFilter = (k: string) =>
    setAssetFilters((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const base = tab === 'past' ? past : upcoming
  const events = (() => {
    let result = base
    // Outcome/news filters only make sense on 历史事件; asset filters apply to both tabs.
    if (tab === 'past' && filters.size > 0) result = result.filter((e) => [...filters].some((f) => matchesFilter(e, f)))
    if (assetFilters.size > 0) result = result.filter((e) => e.assets.some((a) => assetFilters.has(a)))
    return result
  })()

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-3 border-b border-gray-800 pb-2.5">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              tab === t
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            {t === 'upcoming' ? '即将发生' : '历史事件'}
            <span className="ml-1.5 text-[11px] opacity-60">
              {t === 'upcoming' ? upcoming.length : past.length}
            </span>
          </button>
        ))}

        {/* Filter chips — outcome/news only on 历史事件; asset chips on both tabs */}
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {tab === 'past' &&
            FILTERS.map((f) => {
              const on = filters.has(f.key)
              const count = past.filter((e) => matchesFilter(e, f.key)).length
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFilter(f.key)}
                  title={`筛选${f.label}（${count}）`}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                    on ? f.active : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${f.dot} ${on ? '' : 'opacity-40'}`} />
                  {f.label}
                  <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          {ASSETS.map((a) => {
            const on = assetFilters.has(a.key)
            const count = base.filter((e) => e.assets.includes(a.key)).length
            return (
              <button
                key={a.key}
                onClick={() => toggleAssetFilter(a.key)}
                title={`筛选 ${a.symbol}（${count}）`}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  on ? 'border-transparent text-gray-900 font-medium' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
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
      </div>

      {/* Scrollable list — pr-3 keeps badge clear of scrollbar */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-3">
        {events.length === 0 ? (
          <div className="text-sm text-gray-100 py-4 text-center">
            {filters.size > 0 || assetFilters.size > 0 ? '无匹配的筛选结果' : '暂无数据'}
          </div>
        ) : (
          events.map((e, i) => (
            <EventCard key={`${e.date}-${i}`} event={e} isUpcoming={tab === 'upcoming'} />
          ))
        )}
      </div>


    </div>
  )
}
