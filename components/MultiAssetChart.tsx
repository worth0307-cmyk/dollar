'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

const ASSET_CONFIG = {
  dxy: { name: 'DXY', color: '#60A5FA' },
  btc: { name: 'BTC', color: '#F59E0B' },
  brent: { name: 'Brent', color: '#EF4444' },
  gold: { name: 'Gold', color: '#FCD34D' },
  sp500: { name: 'S&P 500', color: '#34D399' },
} as const

type AssetKey = keyof typeof ASSET_CONFIG

function formatTime(ts: number, range: string) {
  const d = new Date(ts)
  if (range === '1d') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  if (range === '5d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false })
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
            <span className="text-gray-300 w-16">{ASSET_CONFIG[p.dataKey as AssetKey]?.name}</span>
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
}

export default function MultiAssetChart({ data, range, loading }: Props) {
  if (loading) {
    return (
      <div className="w-full h-72 flex items-center justify-center text-gray-600 text-sm">
        Loading chart data...
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="w-full h-72 flex items-center justify-center text-gray-600 text-sm">
        No data available
      </div>
    )
  }

  // Thin out data points for performance if too many
  const maxPoints = 300
  const step = Math.max(1, Math.floor(data.length / maxPoints))
  const chartData = step > 1 ? data.filter((_, i) => i % step === 0) : data

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(v) => formatTime(v, range)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={58}
        />
        <Tooltip content={<CustomTooltip range={range} />} />
        <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          formatter={(value) => (
            <span style={{ color: ASSET_CONFIG[value as AssetKey]?.color ?? '#fff' }}>
              {ASSET_CONFIG[value as AssetKey]?.name ?? value}
            </span>
          )}
        />
        {(Object.keys(ASSET_CONFIG) as AssetKey[]).map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={ASSET_CONFIG[key].color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
