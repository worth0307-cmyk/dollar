const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Stooq symbol mapping
const SYM: Record<string, string> = {
  dxy: 'dxy',
  gold: 'xauusd',
  brent: 'ukoil',
  sp500: '^spx',
}

function yyyymmdd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

// Returns CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
export async function fetchStooqQuote(key: string) {
  const sym = SYM[key]
  if (!sym) throw new Error(`Unknown key: ${key}`)
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Stooq ${key} HTTP ${res.status}`)
  const text = await res.text()
  const rows = text.trim().split('\n')
  if (rows.length < 2) throw new Error(`Stooq empty: ${key}`)
  const cols = rows[1].split(',')
  // cols: [Symbol, Date, Time, Open, High, Low, Close, Volume]
  const open = parseFloat(cols[3])
  const close = parseFloat(cols[6])
  if (isNaN(open) || isNaN(close)) throw new Error(`Stooq bad data: ${key} → ${rows[1]}`)
  const change = close - open
  return { price: close, change, changePercent: (change / open) * 100 }
}

// Returns CSV: Date,Open,High,Low,Close,Volume
export async function fetchStooqHistory(key: string, range: string) {
  const sym = SYM[key]
  if (!sym) throw new Error(`Unknown key: ${key}`)
  const daysBack: Record<string, number> = { '5d': 9, '1mo': 36, '3mo': 100, '1y': 375 }
  const days = daysBack[range] ?? 36
  const d1 = new Date(Date.now() - days * 86_400_000)
  const interval = range === '1y' ? 'w' : 'd'
  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}` +
    `&d1=${yyyymmdd(d1)}&d2=${yyyymmdd(new Date())}&i=${interval}`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Stooq history ${key} HTTP ${res.status}`)
  const text = await res.text()
  const rows = text.trim().split('\n').slice(1) // skip header
  const timestamps: number[] = []
  const closes: (number | null)[] = []
  for (const row of rows) {
    const c = row.split(',')
    if (c.length < 5) continue
    const ts = new Date(c[0]).getTime() / 1000
    const close = parseFloat(c[4])
    if (!isNaN(ts) && !isNaN(close)) {
      timestamps.push(ts)
      closes.push(close)
    }
  }
  if (timestamps.length === 0) throw new Error(`Stooq no rows: ${key}`)
  return { timestamps, closes }
}
