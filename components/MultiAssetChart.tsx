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

interface Move {
  time: number
  key: string
  changePct: number
  z: number
}

function formatTime(ts: number, range: string) {
  const d = new Date(ts)
  if (range === '5d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomTooltip({ active, payload, label, range }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs">
      <div className="text-gray-400 mb-2">{formatTime(label, range)}</div>
      {payload
        .filter((p: any) => p.value != null)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-gray-300 w-16">{ASSET_BY_KEY[p.dataKey]?.symbol}</span>
            <span
              className="font-mono ml-auto"
              style={{ color: p.value >= 0 ? '#34D399' : '#EF4444' }}
            >
              {p.value >= 0 ? '+' : ''}
              {p.value.toFixed(2)}%
            </span>
          </div>
        ))}
    </div>
  )
}

interface Props {
  data: Record<string, number>[]
  range: string
  loading?: boolean
  stats?: Record<string, AssetStat>
  moves?: Move[]
}

export default function MultiAssetChart({ data, range, loading, stats, moves }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center text-gray-600 text-sm">
        Loading chart data...
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center text-gray-600 text-sm">
        No data available
      </div>
    )
  }

  // Look up the normalized value of a given asset on a given timestamp,
  // so notable-move markers can be placed on the right line.
  const valueAt = new Map<string, number>()
  data.forEach((row) => {
    ASSETS.forEach((a) => {
      const v = row[a.key]
      if (v != null) valueAt.set(`${row.time}:${a.key}`, v)
    })
  })

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => formatTime(v, range)}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={50}
          />
          <YAxis
            tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip range={range} />} />
          <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />

          {ASSETS.map((a) => (
            <Line
              key={a.key}
              type="monotone"
              dataKey={a.key}
              stroke={a.color}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls
              hide={hidden.has(a.key)}
            />
          ))}

          {/* Notable-move markers, placed on the relevant asset line */}
          {moves?.map((m, i) => {
            if (hidden.has(m.key)) return null
            const y = valueAt.get(`${m.time}:${m.key}`)
            if (y == null) return null
            const color = ASSET_BY_KEY[m.key]?.color
            return (
              <ReferenceDot
                key={`${m.key}-${m.time}-${i}`}
                x={m.time}
                y={y}
                r={4}
                fill={color}
                fillOpacity={0.25}
                stroke={color}
                strokeWidth={1.5}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Interactive legend with period returns */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {ASSETS.map((a) => {
          const isHidden = hidden.has(a.key)
          const chg = stats?.[a.key]?.changePct
          return (
            <button
              key={a.key}
              onClick={() => toggle(a.key)}
              className={`flex items-center gap-2 text-xs transition-opacity ${
                isHidden ? 'opacity-35' : 'opacity-100'
              }`}
              title={isHidden ? 'Click to show' : 'Click to hide'}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.color }} />
              <span className="text-gray-300">{a.symbol}</span>
              {chg != null && (
                <span
                  className="font-mono"
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
