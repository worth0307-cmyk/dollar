'use client'

import { ASSET_BY_KEY } from '@/lib/assets'

interface Asset {
  key: string
  name: string
  symbol: string
  price: number | null
  change: number | null
  changePercent: number | null
  error?: boolean
}

function fmt(value: number, decimals: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export default function PriceCard({ asset }: { asset: Asset }) {
  const meta = ASSET_BY_KEY[asset.key]
  const color = meta?.color ?? '#9CA3AF'
  const up = (asset.changePercent ?? 0) >= 0

  return (
    <div
      className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex flex-col gap-2 hover:border-gray-600 transition-colors"
      style={{ borderTopColor: color, borderTopWidth: 2 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta?.icon}</span>
          <div>
            <div className="text-xs text-gray-400">{asset.symbol}</div>
            <div className="text-sm font-medium text-gray-200">{asset.name}</div>
          </div>
        </div>
        <div
          className="text-xs px-2 py-0.5 rounded-full font-mono"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {asset.changePercent != null
            ? `${up ? '+' : ''}${asset.changePercent.toFixed(2)}%`
            : '—'}
        </div>
      </div>

      {asset.price != null ? (
        <div className="mt-1">
          <span className="text-2xl font-bold text-white font-mono">
            {meta?.prefix}
            {fmt(asset.price, meta?.decimals ?? 2)}
          </span>
          <span className="text-xs text-gray-500 ml-1">{meta?.suffix}</span>
        </div>
      ) : (
        <div className="text-2xl text-gray-600">—</div>
      )}

      {asset.change != null && (
        <div className={`text-xs font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '▲' : '▼'} {Math.abs(asset.change).toFixed(2)}
        </div>
      )}
    </div>
  )
}
