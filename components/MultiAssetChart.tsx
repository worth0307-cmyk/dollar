'use client'

import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { ASSETS, ASSET_BY_KEY } from '@/lib/assets'
import type { AssetStat } from '@/lib/analytics'
import type { MacroEvent } from '@/lib/events'

interface MarketAsset {
  key: string
  price: number | null
  changePercent: number | null
}

interface Move {
  time: number
  key: string
  changePct: number
  z: number
}

// X-axis ticks: compact, no year (avoids crowding)
function formatAxisTick(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '.')
}

// Tooltip date: always includes year so the reader knows which year they're in
function formatTooltipDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function fmtPrice(price: number | null | undefined, key: string) {
  if (price == null) return '—'
  const meta = ASSET_BY_KEY[key]
  return `${meta?.prefix ?? ''}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: meta?.decimals ?? 2,
    maximumFractionDigits: meta?.decimals ?? 2,
  }).format(price)}${meta?.suffix ?? ''}`
}

const EVENT_LINE_COLOR: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
}

function CustomTooltip({ active, payload, label, nearEvent }: any) {
  if (!active || !payload?.length) return null
  const rowData: Record<string, number> = payload[0]?.payload ?? {}

  const items = payload
    .map((p: any) => {
      const baseKey = String(p.dataKey)
      return {
        baseKey,
        color: p.color,
        pct: rowData[baseKey],
        price: rowData[`${baseKey}__p`],
      }
    })
    .filter((it: any) => it.pct != null)
    .sort((a: any, b: any) => {
      const ai = ASSETS.findIndex((x) => x.key === a.baseKey)
      const bi = ASSETS.findIndex((x) => x.key === b.baseKey)
      return ai - bi
    })

  return (
    <div className="bg-gray-900/95 border border-gray-600/60 rounded-xl p-3.5 shadow-2xl text-xs backdrop-blur-sm">
      <div className="text-gray-400 mb-2.5 font-mono text-[11px]">{formatTooltipDate(label)}</div>
      {items.map((it: any) => {
        const meta = ASSET_BY_KEY[it.baseKey]
        return (
          <div key={it.baseKey} className="flex items-center gap-2.5 py-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
            <span className="text-gray-200 w-14 shrink-0">{meta?.symbol}</span>
            <span
              className="font-mono w-16 text-right"
              style={{ color: it.pct >= 0 ? '#34D399' : '#EF4444' }}
            >
              {it.pct >= 0 ? '+' : ''}
              {it.pct.toFixed(2)}%
            </span>
            {it.price != null && (
              <span className="font-mono text-xs ml-1" style={{ color: `${it.color}cc` }}>
                {fmtPrice(it.price, it.baseKey)}
              </span>
            )}
          </div>
        )
      })}
      {nearEvent && (
        <div
          className="mt-2 pt-2 border-t border-gray-700/60 flex items-start gap-1.5"
          style={{ color: EVENT_LINE_COLOR[nearEvent.impact] ?? '#94A3B8' }}
        >
          <span className="shrink-0 mt-px">◈</span>
          <span className="leading-snug">{nearEvent.title}</span>
        </div>
      )}
    </div>
  )
}

interface Props {
  data: Record<string, number>[]
  range: string
  loading?: boolean
  stats?: Record<string, AssetStat>
  moves?: Move[]
  market?: MarketAsset[]
  events?: MacroEvent[]
  anchor: 'period' | 'ytd'
  onAnchorChange: (a: 'period' | 'ytd') => void
  selectedKey?: string | null
  onSelectKey?: (key: string) => void
  selectedMove?: { key: string; time: number } | null
}

export default function MultiAssetChart({
  data,
  range,
  loading,
  stats,
  moves,
  market,
  events,
  anchor,
  onAnchorChange,
  selectedKey,
  onSelectKey,
  selectedMove,
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showEvents, setShowEvents] = useState(false)
  // Pixel Y of the mouse within the plot wrapper, for the horizontal crosshair.
  // Read from the native DOM event (not recharts state) — recharts 3 dropped the
  // chartX/chartY fields its v2 mouse-move callback used to provide.
  const [cursorY, setCursorY] = useState<number | null>(null)

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const { chartData, movesByKey } = useMemo(() => {
    // Use data directly — each row already contains `key` as (price − base) / base × 100
    // and `key__p` as the raw price. No per-asset normalization needed.
    const chartData = data

    // O(1) move lookup: key → Map<time, Move>
    const movesByKey = new Map<string, Map<number, Move>>()
    moves?.forEach((m) => {
      if (!movesByKey.has(m.key)) movesByKey.set(m.key, new Map())
      movesByKey.get(m.key)!.set(m.time, m)
    })

    return { chartData, movesByKey }
  }, [data, moves])

  // Non-news, high/medium impact past events within the chart's time range.
  const chartMin = data[0]?.time as number | undefined
  const chartMax = data[data.length - 1]?.time as number | undefined
  const eventLines = useMemo(() => {
    if (!events || !chartMin || !chartMax) return []
    return events
      .filter((e) => e.source !== 'news' && (e.impact === 'high' || e.impact === 'medium'))
      .map((e) => ({ ...e, ts: new Date(e.date + 'T12:00:00').getTime() }))
      .filter((e) => e.ts >= chartMin && e.ts <= chartMax)
  }, [events, chartMin, chartMax])

  // Nearest event to a given timestamp (for tooltip), within ±1.5 days.
  function nearestEventLine(ts: number): MacroEvent | null {
    if (!showEvents || !eventLines.length) return null
    let best: (typeof eventLines)[0] | null = null
    let bestDiff = Infinity
    for (const e of eventLines) {
      const d = Math.abs(e.ts - ts)
      if (d < 86400000 * 1.5 && d < bestDiff) { bestDiff = d; best = e }
    }
    return best
  }

  if (loading) {
    return (
      <div className="w-full h-[340px] flex items-center justify-center text-gray-500 text-sm">
        <span className="live-dot">加载中…</span>
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="w-full h-[340px] flex items-center justify-center text-gray-500 text-sm">
        暂无数据
      </div>
    )
  }

  return (
    <div className="chart-glow flex flex-col h-full">
      {/* Anchor toggle + event lines toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-gray-500">基准：</span>
        {(['period', 'ytd'] as const).map((a) => (
          <button
            key={a}
            onClick={() => onAnchorChange(a)}
            className={`text-[10px] px-2 py-1 min-h-[36px] rounded font-mono transition-colors ${
              anchor === a
                ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
            title={
              a === 'period'
                ? '所有资产从当前所选时间段起点归一到 0%'
                : '所有资产基准切换为今年 1月1日，各线起点不同'
            }
          >
            {a === 'period' ? '区间起点 = 0%' : 'YTD 年初 = 0%'}
          </button>
        ))}
        {eventLines.length > 0 && (
          <button
            onClick={() => setShowEvents((v) => !v)}
            title={showEvents ? '隐藏宏观事件参考线' : '显示宏观事件参考线（红=重大，橙=中等）'}
            className={`ml-auto text-[10px] px-2 py-1 min-h-[36px] rounded font-mono border transition-colors ${
              showEvents
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                : 'text-gray-500 hover:text-gray-300 border-gray-700'
            }`}
          >
            ◈ 事件线 {eventLines.length}
          </button>
        )}
      </div>

      {/* Chart */}
      <div
        className="relative flex-1 min-h-[240px] sm:min-h-[300px]"
        onMouseMove={(e) => setCursorY(e.clientY - e.currentTarget.getBoundingClientRect().top)}
        onMouseLeave={() => setCursorY(null)}
      >
          {/* Horizontal crosshair — tracks the mouse vertically, complementing
              recharts' built-in vertical cursor line for a full crosshair. */}
          {cursorY != null && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ top: cursorY, borderTop: '1px dashed #4B5563' }}
            />
          )}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatAxisTick}
                tick={{ fill: '#475569', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={50}
              />
              <YAxis
                type="number"
                domain={['auto', 'auto']}
                tick={{ fill: '#475569', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
              />
              <Tooltip
                content={(props: any) => (
                  <CustomTooltip {...props} nearEvent={nearestEventLine(props.label)} />
                )}
                cursor={{ stroke: '#4B5563', strokeWidth: 1, fill: 'none' }}
                wrapperStyle={{ outline: 'none', border: 'none' }}
              />

              <ReferenceLine y={0} stroke="#374151" strokeWidth={1} strokeDasharray="4 2" />

              {showEvents && eventLines.map((e, i) => (
                <ReferenceLine
                  key={`evline-${i}`}
                  x={e.ts}
                  stroke={EVENT_LINE_COLOR[e.impact] ?? '#94A3B8'}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.55}
                />
              ))}

              {ASSETS.map((a) => {
                const isAssetSelected = selectedKey === a.key
                const isDimmed = selectedKey != null && !isAssetSelected
                const assetMoves = movesByKey.get(a.key)

                return (
                  <Line
                    key={a.key}
                    type="monotone"
                    dataKey={a.key}
                    stroke={a.color}
                    strokeWidth={isAssetSelected ? 2.25 : 1.5}
                    strokeOpacity={isDimmed ? 0.1 : 1}
                    activeDot={{ r: isAssetSelected ? 5 : 4, strokeWidth: 0, fillOpacity: 0.9 }}
                    connectNulls
                    hide={hidden.has(a.key)}
                    legendType="none"
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props
                      if (cx == null || cy == null || !assetMoves) return <g key={index} />
                      const move = assetMoves.get(payload?.time)
                      if (!move) return <g key={index} />

                      const isSelected = selectedMove?.key === a.key && selectedMove?.time === move.time
                      // Dots are hidden by default; only the selected move's dot renders.
                      if (!isSelected) return <g key={index} />

                      return (
                        <g key={index}>
                          {/* Pulsing ring */}
                          <circle cx={cx} cy={cy} r={7} fill="none" stroke={a.color} strokeWidth={1.5}>
                            <animate attributeName="r" from="7" to="20" dur="1.5s" repeatCount="indefinite" />
                            <animate attributeName="stroke-opacity" from="0.7" to="0" dur="1.5s" repeatCount="indefinite" />
                          </circle>
                          <circle
                            cx={cx} cy={cy} r={7}
                            fill={a.color}
                            fillOpacity={0.9}
                            stroke={a.color}
                            strokeWidth={2}
                          />
                        </g>
                      )
                    }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
      </div>

      {/* Interactive legend */}
      <div className="mt-4 flex flex-wrap gap-x-2 sm:gap-x-5 gap-y-2">
        {ASSETS.map((a) => {
          const isHidden = hidden.has(a.key)
          const isSelected = selectedKey === a.key
          const isDimmed = selectedKey != null && !isSelected
          const chg = stats?.[a.key]?.changePct
          return (
            <button
              key={a.key}
              onClick={() => {
                toggle(a.key)
                onSelectKey?.(a.key)
              }}
              className={`flex items-center gap-2 text-xs transition-all ${
                isHidden ? 'opacity-30' : isDimmed ? 'opacity-40' : 'opacity-100'
              }`}
              title={isHidden ? '点击显示' : '点击隐藏 / 高亮'}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: a.color,
                  boxShadow: isHidden || isDimmed ? 'none' : `0 0 6px ${a.color}80`,
                }}
              />
              <span className={isSelected ? 'text-white font-medium' : 'text-gray-200'}>{a.symbol}</span>
              {chg != null && (
                <span
                  className="font-mono text-[11px]"
                  style={{ color: chg >= 0 ? '#34D399' : '#EF4444' }}
                >
                  {chg >= 0 ? '+' : ''}
                  {chg.toFixed(1)}%
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
