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

export default function PriceCard({
  asset,
  selected,
  onSelect,
  periodChg,
  anchorLabel,
}: {
  asset: Asset
  selected?: boolean
  onSelect?: () => void
  periodChg?: number | null
  anchorLabel?: string
}) {
  const meta = ASSET_BY_KEY[asset.key]
  const color = meta?.color ?? '#9CA3AF'
  const up = (asset.changePercent ?? 0) >= 0

  return (
    <div
      onClick={onSelect}
      className="card-glow rounded-xl bg-gray-900/80 border border-gray-700/60 p-4 flex flex-col gap-2 backdrop-blur-sm transition-all h-full"
      style={
        {
          borderTopColor: color,
          borderTopWidth: 2,
          '--glow': `${color}30`,
          cursor: onSelect ? 'pointer' : 'default',
          ...(selected
            ? {
                boxShadow: `0 0 0 2px ${color}60, 0 0 24px ${color}30`,
                backgroundColor: `color-mix(in srgb, ${color} 8%, #111827)`,
              }
            : {}),
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

      {/* Change row: 24h absolute + period cumulative — mt-auto pins to card bottom */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        {asset.change != null && (
          <div className={`text-xs font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            <span style={{ textShadow: up ? '0 0 8px #34D39950' : '0 0 8px #EF444450' }}>
              {up ? '▲' : '▼'} {Math.abs(asset.change).toFixed(2)}
            </span>
          </div>
        )}
        {periodChg != null && (
          <div className="text-[10px] font-mono text-gray-500 ml-auto">
            <span className="text-gray-600">{anchorLabel ?? '区间'} </span>
            <span style={{ color: periodChg >= 0 ? '#34D399' : '#EF4444' }}>
              {periodChg >= 0 ? '+' : ''}{periodChg.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
