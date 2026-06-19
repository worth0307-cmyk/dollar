'use client'

interface Asset {
  key: string
  name: string
  symbol: string
  price: number | null
  change: number | null
  changePercent: number | null
  error?: boolean
}

const FORMAT: Record<string, Intl.NumberFormatOptions> = {
  dxy: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  btc: { minimumFractionDigits: 0, maximumFractionDigits: 0 },
  brent: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  gold: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
  sp500: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
}

const PREFIX: Record<string, string> = {
  dxy: '',
  btc: '$',
  brent: '$',
  gold: '$',
  sp500: '',
}

const SUFFIX: Record<string, string> = {
  brent: '/bbl',
  gold: '/oz',
  btc: '',
  dxy: '',
  sp500: '',
}

const COLORS: Record<string, string> = {
  dxy: '#60A5FA',
  btc: '#F59E0B',
  brent: '#EF4444',
  gold: '#FCD34D',
  sp500: '#34D399',
}

const ICONS: Record<string, string> = {
  dxy: '$',
  btc: '₿',
  brent: '🛢',
  gold: '◈',
  sp500: '📈',
}

function fmt(value: number, key: string) {
  const opts = FORMAT[key] ?? { maximumFractionDigits: 2 }
  return new Intl.NumberFormat('en-US', opts).format(value)
}

export default function PriceCard({ asset }: { asset: Asset }) {
  const up = (asset.changePercent ?? 0) >= 0
  const color = COLORS[asset.key]

  return (
    <div
      className="rounded-xl bg-gray-900 border border-gray-800 p-4 flex flex-col gap-2 hover:border-gray-600 transition-colors"
      style={{ borderTopColor: color, borderTopWidth: 2 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{ICONS[asset.key]}</span>
          <div>
            <div className="text-xs text-gray-400">{asset.symbol}</div>
            <div className="text-sm font-medium text-gray-200">{asset.name}</div>
          </div>
        </div>
        <div
          className="text-xs px-2 py-0.5 rounded-full font-mono"
          style={{
            backgroundColor: `${color}20`,
            color,
          }}
        >
          {asset.changePercent != null
            ? `${up ? '+' : ''}${asset.changePercent.toFixed(2)}%`
            : '—'}
        </div>
      </div>

      {asset.price != null ? (
        <div className="mt-1">
          <span className="text-2xl font-bold text-white font-mono">
            {PREFIX[asset.key]}
            {fmt(asset.price, asset.key)}
          </span>
          <span className="text-xs text-gray-500 ml-1">{SUFFIX[asset.key]}</span>
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
