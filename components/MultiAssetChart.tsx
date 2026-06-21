'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { ASSETS, ASSET_BY_KEY } from '@/lib/assets'
import type { AssetStat } from '@/lib/analytics'

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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rowData: Record<string, number> = payload[0]?.payload ?? {}

  const items = payload
    .map((p: any) => {
      const baseKey = String(p.dataKey).replace(/__n$/, '')
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
  anchor,
  onAnchorChange,
  selectedKey,
  onSelectKey,
  selectedMove,
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const ranges = new Map<string, { min: number; max: number }>()
  ASSETS.forEach((a) => {
    let min = Infinity
    let max = -Infinity
    data.forEach((row) => {
      const v = row[a.key]
      if (v != null) {
        if (v < min) min = v
        if (v > max) max = v
      }
    })
    if (min !== Infinity) ranges.set(a.key, { min, max })
  })

  const normalize = (key: string, v: number) => {
    const r = ranges.get(key)
    if (!r) return 50
    const span = r.max - r.min
    return span > 0 ? ((v - r.min) / span) * 100 : 50
  }

  const chartData = data.map((row) => {
    const out: Record<string, number> = { ...row }
    ASSETS.forEach((a) => {
      const v = row[a.key]
      if (v != null) out[`${a.key}__n`] = normalize(a.key, v)
    })
    return out
  })

  // O(1) move lookup: key → Map<time, Move>
  const movesByKey = new Map<string, Map<number, Move>>()
  moves?.forEach((m) => {
    if (!movesByKey.has(m.key)) movesByKey.set(m.key, new Map())
    movesByKey.get(m.key)!.set(m.time, m)
  })

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
      {/* Anchor toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-gray-500">基准：</span>
        {(['period', 'ytd'] as const).map((a) => (
          <button
            key={a}
            onClick={() => onAnchorChange(a)}
            className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
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
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[240px] sm:min-h-[300px]">
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
                domain={[-8, 108]}
                tick={false}
                tickLine={false}
                axisLine={false}
                width={8}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: '#4B5563', strokeWidth: 1, fill: 'none' }}
                wrapperStyle={{ outline: 'none', border: 'none' }}
              />

              {ASSETS.map((a) => {
                const isAssetSelected = selectedKey === a.key
                const isDimmed = selectedKey != null && !isAssetSelected
                const assetMoves = movesByKey.get(a.key)

                return (
                  <Line
                    key={a.key}
                    type="monotone"
                    dataKey={`${a.key}__n`}
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
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
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
