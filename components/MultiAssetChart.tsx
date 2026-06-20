'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
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

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '.')
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
  // Lines plot a normalized `key__n` value; real % and price live on the row
  // under `key` and `key__p`. Resolve the base key to show true figures.
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
      <div className="text-gray-400 mb-2.5 font-mono text-[11px]">{formatTime(label)}</div>
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
  onSelectMove?: (m: { key: string; time: number }) => void
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
  onSelectMove,
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hoveredDot, setHoveredDot] = useState<string | null>(null)

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // Per-asset min/max of the % series, so each line can be scaled independently
  // to fill the full plot height (small-multiples overlaid in one frame).
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

  // Augment each row with `key__n`: the independently-scaled 0–100 value the
  // line actually plots. Real % (`key`) and price (`key__p`) stay for tooltip.
  const chartData = data.map((row) => {
    const out: Record<string, number> = { ...row }
    ASSETS.forEach((a) => {
      const v = row[a.key]
      if (v != null) out[`${a.key}__n`] = normalize(a.key, v)
    })
    return out
  })

  // Move markers need their y in the same normalized coordinate space.
  const yAt = new Map<string, number>()
  data.forEach((row) =>
    ASSETS.forEach((a) => {
      const v = row[a.key]
      if (v != null) yAt.set(`${row.time}:${a.key}`, normalize(a.key, v))
    })
  )

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

      {/* Chart — fills remaining card height so it stays level with Correlation */}
      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTime}
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
            <Tooltip content={<CustomTooltip />} />

            {ASSETS.map((a) => {
              const isSelected = selectedKey === a.key
              const isDimmed = selectedKey != null && !isSelected
              return (
                <Line
                  key={a.key}
                  type="monotone"
                  dataKey={`${a.key}__n`}
                  stroke={a.color}
                  strokeWidth={isSelected ? 2.25 : 1.5}
                  strokeOpacity={isDimmed ? 0.1 : 1}
                  dot={false}
                  activeDot={{ r: isSelected ? 5 : 4, strokeWidth: 0, fillOpacity: 0.9 }}
                  connectNulls
                  hide={hidden.has(a.key)}
                  legendType="none"
                />
              )
            })}

            {moves?.map((m, i) => {
              if (hidden.has(m.key)) return null
              if (selectedKey != null && m.key !== selectedKey) return null
              const y = yAt.get(`${m.time}:${m.key}`)
              if (y == null) return null
              const color = ASSET_BY_KEY[m.key]?.color
              const dotKey = `${m.key}-${m.time}`
              const isSelected = selectedMove?.key === m.key && selectedMove?.time === m.time
              const isHovered = hoveredDot === dotKey
              return (
                <ReferenceDot
                  key={`${m.key}-${m.time}-${i}`}
                  x={m.time}
                  y={y}
                  r={isSelected ? 7 : isHovered ? 6 : 4}
                  fill={color}
                  fillOpacity={isSelected ? 0.9 : isHovered ? 0.7 : 0.3}
                  stroke={color}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectMove?.({ key: m.key, time: m.time })}
                  onMouseEnter={() => setHoveredDot(dotKey)}
                  onMouseLeave={() => setHoveredDot(null)}
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
