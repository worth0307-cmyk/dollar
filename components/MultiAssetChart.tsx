'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
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

function CustomTooltip({ active, payload, label, market }: any) {
  if (!active || !payload?.length) return null
  const priceMap = new Map((market ?? []).map((a: MarketAsset) => [a.key, a]))

  return (
    <div className="bg-gray-900/95 border border-gray-600/60 rounded-xl p-3.5 shadow-2xl text-xs backdrop-blur-sm">
      <div className="text-gray-400 mb-2.5 font-mono text-[11px]">{formatTime(label)}</div>
      {payload
        .filter((p: any) => p.value != null)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => {
          const meta = ASSET_BY_KEY[p.dataKey]
          const asset = priceMap.get(p.dataKey) as MarketAsset | undefined
          return (
            <div key={p.dataKey} className="flex items-center gap-2.5 py-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-gray-300 w-14 shrink-0">{meta?.symbol}</span>
              <span
                className="font-mono w-16 text-right"
                style={{ color: p.value >= 0 ? '#34D399' : '#EF4444' }}
              >
                {p.value >= 0 ? '+' : ''}
                {p.value.toFixed(2)}%
              </span>
              {asset?.price != null && (
                <span className="font-mono text-gray-500 text-[10px] ml-1">
                  {fmtPrice(asset.price, p.dataKey)}
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
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // Build a fast lookup: timestamp → { key → pct } for move markers.
  const pctAt = new Map<string, number>()
  data.forEach((row) =>
    ASSETS.forEach((a) => {
      const v = row[a.key]
      if (v != null) pctAt.set(`${row.time}:${a.key}`, v)
    })
  )

  const anchorLabel = anchor === 'period' ? '区间' : 'YTD'

  if (loading) {
    return (
      <div className="w-full h-[340px] flex items-center justify-center text-gray-600 text-sm">
        <span className="live-dot">加载中…</span>
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="w-full h-[340px] flex items-center justify-center text-gray-600 text-sm">
        暂无数据
      </div>
    )
  }

  return (
    <div className="chart-glow">
      {/* Anchor toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-gray-600">基准：</span>
        {(['period', 'ytd'] as const).map((a) => (
          <button
            key={a}
            onClick={() => onAnchorChange(a)}
            className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
              anchor === a
                ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                : 'text-gray-600 hover:text-gray-400 border border-transparent'
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

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
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
            tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
            tick={{ fill: '#475569', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip market={market} />} />
          <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" label={{ value: `${anchorLabel} 基准`, position: 'insideTopLeft', fill: '#475569', fontSize: 10 }} />

          {/* Glow layer — wide + translucent version of each line */}
          {ASSETS.map((a) => (
            <Line
              key={`${a.key}-glow`}
              type="monotone"
              dataKey={a.key}
              stroke={a.color}
              strokeWidth={7}
              strokeOpacity={0.12}
              dot={false}
              activeDot={false}
              connectNulls
              hide={hidden.has(a.key)}
              legendType="none"
              isAnimationActive={false}
            />
          ))}

          {/* Actual lines */}
          {ASSETS.map((a) => (
            <Line
              key={a.key}
              type="monotone"
              dataKey={a.key}
              stroke={a.color}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fillOpacity: 0.9 }}
              connectNulls
              hide={hidden.has(a.key)}
              legendType="none"
            />
          ))}

          {/* Notable-move markers */}
          {moves?.map((m, i) => {
            if (hidden.has(m.key)) return null
            const y = pctAt.get(`${m.time}:${m.key}`)
            if (y == null) return null
            const color = ASSET_BY_KEY[m.key]?.color
            return (
              <ReferenceDot
                key={`${m.key}-${m.time}-${i}`}
                x={m.time}
                y={y}
                r={4}
                fill={color}
                fillOpacity={0.3}
                stroke={color}
                strokeWidth={1.5}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Interactive legend */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {ASSETS.map((a) => {
          const isHidden = hidden.has(a.key)
          const chg = stats?.[a.key]?.changePct
          return (
            <button
              key={a.key}
              onClick={() => toggle(a.key)}
              className={`flex items-center gap-2 text-xs transition-all ${
                isHidden ? 'opacity-30' : 'opacity-100'
              }`}
              title={isHidden ? '点击显示' : '点击隐藏'}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: a.color,
                  boxShadow: isHidden ? 'none' : `0 0 6px ${a.color}80`,
                }}
              />
              <span className="text-gray-300">{a.symbol}</span>
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
