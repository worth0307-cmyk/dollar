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
      className="card-glow rounded-xl bg-gray-900/80 border border-gray-700/60 p-4 flex flex-col gap-2 backdrop-blur-sm"
      style={
        {
          borderTopColor: color,
          borderTopWidth: 2,
          '--glow': `${color}30`,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none" style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
            {meta?.icon}
          </span>
          <div>
            <div className="text-[10px] text-gray-500 font-mono tracking-wide">{asset.symbol}</div>
            <div className="text-sm font-medium text-gray-200">{asset.name}</div>
          </div>
        </div>
        <div
          className="text-xs px-2 py-0.5 rounded-full font-mono font-medium tracking-wide"
          style={{
            backgroundColor: `${color}18`,
            color,
            boxShadow: `0 0 8px ${color}30`,
          }}
        >
          {asset.changePercent != null
            ? `${up ? '+' : ''}${asset.changePercent.toFixed(2)}%`
            : '—'}
        </div>
      </div>

      {/* Price */}
      {asset.price != null ? (
        <div className="mt-1">
          <span
            className="text-2xl font-bold font-mono"
            style={{
              color: '#f1f5f9',
              textShadow: `0 0 12px ${color}30`,
            }}
          >
            {meta?.prefix}
            {fmt(asset.price, meta?.decimals ?? 2)}
          </span>
          <span className="text-xs text-gray-600 ml-1">{meta?.suffix}</span>
        </div>
      ) : (
        <div className="text-2xl text-gray-700">—</div>
      )}

      {/* Change */}
      {asset.change != null && (
        <div className={`text-xs font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          <span style={{ textShadow: up ? '0 0 8px #34D39950' : '0 0 8px #EF444450' }}>
            {up ? '▲' : '▼'} {Math.abs(asset.change).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}
