// Single source of truth for how each asset is labelled and styled.
export interface AssetMeta {
  key: string
  symbol: string
  name: string
  color: string
  icon: string
  prefix: string
  suffix: string
  decimals: number
}

export const ASSETS: AssetMeta[] = [
  { key: 'dxy', symbol: 'DXY', name: 'USD Index', color: '#60A5FA', icon: '$', prefix: '', suffix: '', decimals: 2 },
  // USD/JPY sits next to DXY — both are dollar-strength gauges. Quoted as yen
  // per dollar, so a rising line means a stronger dollar / weaker yen.
  // Icon is the pair ($¥), not a bare ¥ — this tracks an exchange rate, not the
  // yen itself; it also mirrors DXY's $ since both gauge dollar strength.
  { key: 'usdjpy', symbol: 'USD/JPY', name: 'Dollar-Yen', color: '#A78BFA', icon: '$¥', prefix: '¥', suffix: '', decimals: 2 },
  { key: 'btc', symbol: 'BTC', name: 'Bitcoin', color: '#F59E0B', icon: '₿', prefix: '$', suffix: '', decimals: 0 },
  { key: 'brent', symbol: 'Brent', name: 'Brent Crude', color: '#EF4444', icon: '🛢', prefix: '$', suffix: '/bbl', decimals: 2 },
  { key: 'gold', symbol: 'Gold', name: 'Gold', color: '#FCD34D', icon: '◈', prefix: '$', suffix: '/oz', decimals: 1 },
  { key: 'sp500', symbol: 'S&P 500', name: 'S&P 500', color: '#34D399', icon: '📈', prefix: '', suffix: '', decimals: 1 },
]

export const ASSET_KEYS = ASSETS.map((a) => a.key)

export const ASSET_BY_KEY: Record<string, AssetMeta> = Object.fromEntries(
  ASSETS.map((a) => [a.key, a])
)
