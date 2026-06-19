const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BASE = 'https://query2.finance.yahoo.com/v8/finance/chart'

interface Session {
  cookie: string
  crumb: string
  exp: number
}

// Module-level cache; persists across requests within one server process
let _session: Session | null = null

async function getSession(): Promise<Session> {
  if (_session && Date.now() < _session.exp) return _session

  // Step 1: hit fc.yahoo.com to get a consent cookie
  const r1 = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
  })
  const rawCookies: string[] =
    typeof (r1.headers as any).getSetCookie === 'function'
      ? (r1.headers as any).getSetCookie()
      : []
  const cookie = rawCookies.map((c) => c.split(';')[0]).join('; ')

  // Step 2: get crumb using that cookie
  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  if (!r2.ok) throw new Error(`Crumb fetch failed: ${r2.status}`)
  const crumb = await r2.text()
  if (!crumb || crumb.includes('<')) throw new Error('Invalid crumb response')

  _session = { cookie, crumb, exp: Date.now() + 23 * 3600 * 1000 }
  return _session
}

function invalidate() {
  _session = null
}

const INTERVAL: Record<string, string> = {
  '1d': '5m',
  '5d': '60m',
  '1mo': '1d',
  '3mo': '1d',
  '1y': '1wk',
}

export async function fetchQuote(symbol: string) {
  const s = await getSession()
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d&crumb=${encodeURIComponent(s.crumb)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Cookie: s.cookie },
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) {
    invalidate()
    throw new Error(`Yahoo auth error ${res.status} for ${symbol}`)
  }
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`)

  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`Empty result for ${symbol}`)

  const { meta } = result
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
  const s = await getSession()
  const interval = INTERVAL[range] ?? '1d'
  const url = `${BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&crumb=${encodeURIComponent(s.crumb)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Cookie: s.cookie },
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) {
    invalidate()
    throw new Error(`Yahoo auth error ${res.status} for ${symbol} history`)
  }
  if (!res.ok) throw new Error(`Yahoo history ${symbol} HTTP ${res.status}`)

  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`Empty history for ${symbol}`)

  return {
    timestamps: result.timestamp as number[],
    closes: result.indicators.quote[0].close as (number | null)[],
  }
}
