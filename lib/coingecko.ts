import { pfetch } from './pfetch'

const BASE = 'https://api.coingecko.com/api/v3'

const reqOpts: RequestInit = {
  cache: 'no-store',
  signal: AbortSignal.timeout(25_000),
}

export async function fetchBtcQuote() {
  const res = await pfetch(
    `${BASE}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`,
    reqOpts
  )
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const json = await res.json()
  const usd: number = json.bitcoin.usd
  const pct: number = json.bitcoin.usd_24h_change
  const prev = usd / (1 + pct / 100)
  return { price: usd, changePercent: pct, change: usd - prev }
}

const DAYS: Record<string, string> = { '5d': '7', '1mo': '30', '3mo': '90', '1y': '365' }

export async function fetchBtcHistory(range: string) {
  const days = DAYS[range] ?? '30'
  const res = await pfetch(
    `${BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    reqOpts
  )
  if (!res.ok) throw new Error(`CoinGecko history ${res.status}`)
  const json = await res.json()
  const prices: [number, number][] = json.prices
  return {
    timestamps: prices.map(([ts]) => Math.floor(ts / 1000)),
    closes: prices.map(([, p]) => p) as (number | null)[],
  }
}
