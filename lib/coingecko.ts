const BASE = 'https://api.coingecko.com/api/v3'
const opts = () => ({ cache: 'no-store' as const, signal: AbortSignal.timeout(8000) })

export async function fetchBtcQuote() {
  const res = await fetch(
    `${BASE}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`,
    opts()
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
  const res = await fetch(
    `${BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    opts()
  )
  if (!res.ok) throw new Error(`CoinGecko history ${res.status}`)
  const json = await res.json()
  const prices: [number, number][] = json.prices
  return {
    timestamps: prices.map(([ts]) => Math.floor(ts / 1000)),
    closes: prices.map(([, p]) => p) as (number | null)[],
  }
}
