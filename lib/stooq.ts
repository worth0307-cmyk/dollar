import { pfetch } from './pfetch'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const SYM: Record<string, string> = {
  dxy: 'dxy',
  gold: 'xauusd',
  brent: 'ukoil',
  sp500: '^spx',
}

function yyyymmdd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/csv,text/plain,*/*',
  Referer: 'https://stooq.com/',
}

const reqOpts: RequestInit = {
  headers: HEADERS,
  cache: 'no-store',
  signal: AbortSignal.timeout(25_000),
}

// Parse daily history CSV: Date,Open,High,Low,Close,Volume
function parseDailyRows(text: string, label: string) {
  const rows = text
    .trim()
    .split('\n')
    .slice(1) // skip header
    .map((r) => r.split(','))
    .filter((c) => c.length >= 5 && !isNaN(parseFloat(c[4])) && parseFloat(c[4]) > 0)

  if (rows.length === 0) {
    // Show the first 300 chars to help diagnose format issues
    console.error(`[stooq] ${label} — parse failed. Raw response (300 chars):`, text.slice(0, 300))
  }
  return rows
}

// Use 7-day daily history to get current price + prev-close change
export async function fetchStooqQuote(key: string) {
  const sym = SYM[key]
  if (!sym) throw new Error(`Unknown key: ${key}`)
  const d1 = yyyymmdd(new Date(Date.now() - 7 * 86_400_000))
  const d2 = yyyymmdd(new Date())
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&d1=${d1}&d2=${d2}&i=d`
  const res = await pfetch(url, reqOpts)
  if (!res.ok) throw new Error(`Stooq ${key} HTTP ${res.status}`)
  const rows = parseDailyRows(await res.text(), key)
  if (rows.length === 0) throw new Error(`Stooq no data: ${key}`)
  const price = parseFloat(rows[rows.length - 1][4])
  const prevPrice = rows.length >= 2 ? parseFloat(rows[rows.length - 2][4]) : price
  const change = price - prevPrice
  return { price, change, changePercent: prevPrice > 0 ? (change / prevPrice) * 100 : 0 }
}

export async function fetchStooqHistory(key: string, range: string) {
  const sym = SYM[key]
  if (!sym) throw new Error(`Unknown key: ${key}`)
  const daysBack: Record<string, number> = { '5d': 9, '1mo': 36, '3mo': 100, '1y': 375 }
  const days = daysBack[range] ?? 36
  const d1 = yyyymmdd(new Date(Date.now() - days * 86_400_000))
  const d2 = yyyymmdd(new Date())
  const interval = range === '1y' ? 'w' : 'd'
  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}` +
    `&d1=${d1}&d2=${d2}&i=${interval}`
  const res = await pfetch(url, reqOpts)
  if (!res.ok) throw new Error(`Stooq history ${key} HTTP ${res.status}`)
  const rows = parseDailyRows(await res.text(), `${key}/history`)
  if (rows.length === 0) throw new Error(`Stooq no rows: ${key}`)
  return {
    timestamps: rows.map((c) => new Date(c[0]).getTime() / 1000),
    closes: rows.map((c) => parseFloat(c[4])) as (number | null)[],
  }
}
