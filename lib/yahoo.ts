const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
}

const INTERVAL_MAP: Record<string, string> = {
  '1d': '5m',
  '5d': '60m',
  '1mo': '1d',
  '3mo': '1d',
  '1y': '1wk',
}

export async function fetchQuote(symbol: string) {
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`Yahoo fetch failed: ${symbol} ${res.status}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}`)
  const meta = result.meta
  const price: number = meta.regularMarketPrice
  const prev: number = meta.previousClose ?? meta.chartPreviousClose ?? price
  return {
    symbol,
    price,
    change: price - prev,
    changePercent: ((price - prev) / prev) * 100,
  }
}

export async function fetchHistory(symbol: string, range: string) {
  const interval = INTERVAL_MAP[range] ?? '1d'
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Yahoo history failed: ${symbol} ${res.status}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No history for ${symbol}`)
  return {
    timestamps: result.timestamp as number[],
    closes: result.indicators.quote[0].close as (number | null)[],
  }
}
