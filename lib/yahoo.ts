const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Two interchangeable API hosts — we try both before giving up, which smooths
// over the intermittent connect-timeouts seen behind the proxy.
const HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
]

const TIMEOUT = 20_000

interface Session {
  cookie: string
  crumb: string
  exp: number
}

// Module-level cache; persists across requests within one server process.
let _session: Session | null = null

function invalidate() {
  _session = null
}

// Crumb auth is only needed as a fallback — the chart endpoint is normally
// public. Build a session lazily and reuse it for ~23h.
async function getSession(): Promise<Session> {
  if (_session && Date.now() < _session.exp) return _session

  // Step 1: grab consent cookies. fc.yahoo.com is flaky, so fall back to the
  // main finance host, which also sets the A1 cookie getcrumb accepts.
  let cookie = ''
  for (const url of ['https://fc.yahoo.com/', 'https://finance.yahoo.com/']) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT),
      })
      const raw: string[] =
        typeof (r.headers as any).getSetCookie === 'function'
          ? (r.headers as any).getSetCookie()
          : []
      const c = raw.map((x) => x.split(';')[0]).filter(Boolean).join('; ')
      if (c) {
        cookie = c
        break
      }
    } catch {
      // try next host
    }
  }

  // Step 2: exchange the cookie for a crumb (try both API hosts).
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/v1/test/getcrumb`, {
        headers: { 'User-Agent': UA, Cookie: cookie },
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!r.ok) continue
      const crumb = await r.text()
      if (crumb && !crumb.includes('<')) {
        _session = { cookie, crumb, exp: Date.now() + 23 * 3600 * 1000 }
        return _session
      }
    } catch {
      // try next host
    }
  }

  throw new Error('Could not establish Yahoo session (crumb)')
}

const INTERVAL: Record<string, string> = {
  '5d': '1d',
  '1mo': '1d',
  '3mo': '1d',
  '1y': '1wk',
}

const KEY_TO_SYMBOL: Record<string, string> = {
  dxy: 'DX-Y.NYB',
  gold: 'GC=F',
  brent: 'BZ=F',
  sp500: '^GSPC',
  btc: 'BTC-USD',
}

// Fetch a chart result. The /v8/finance/chart endpoint is normally public, so
// we try it WITHOUT a crumb first (no fc.yahoo.com round-trip on the happy
// path). Only on a 401/403 do we establish a session and retry with the crumb.
// Both API hosts are attempted before failing.
async function chart(symbol: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  let lastErr: unknown = null

  for (const host of HOSTS) {
    const base = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}`
    try {
      let res = await fetch(`${base}?${qs}`, {
        headers: { 'User-Agent': UA },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT),
      })

      // Public access refused — fall back to the authenticated crumb flow.
      if (res.status === 401 || res.status === 403) {
        const s = await getSession()
        res = await fetch(`${base}?${qs}&crumb=${encodeURIComponent(s.crumb)}`, {
          headers: { 'User-Agent': UA, Cookie: s.cookie },
          cache: 'no-store',
          signal: AbortSignal.timeout(TIMEOUT),
        })
        if (res.status === 401 || res.status === 403) invalidate()
      }

      if (!res.ok) {
        lastErr = new Error(`Yahoo ${symbol} HTTP ${res.status}`)
        continue
      }

      const json = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result) {
        lastErr = new Error(`Empty result for ${symbol}`)
        continue
      }
      return result
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr ?? new Error(`Yahoo fetch failed for ${symbol}`)
}

export async function fetchYahooQuote(key: string) {
  const sym = KEY_TO_SYMBOL[key]
  if (!sym) throw new Error(`Unknown key: ${key}`)
  return fetchQuote(sym)
}

export async function fetchYahooHistory(key: string, range: string) {
  const sym = KEY_TO_SYMBOL[key]
  if (!sym) throw new Error(`Unknown key: ${key}`)
  return fetchHistory(sym, range)
}

export async function fetchQuote(symbol: string) {
  const result = await chart(symbol, { interval: '1d', range: '1d' })
  const meta = result.meta
  const price: number = meta.regularMarketPrice
  const prev: number = meta.previousClose ?? meta.chartPreviousClose ?? price
  return {
    symbol,
    price,
    change: price - prev,
    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
  }
}

export async function fetchHistory(symbol: string, range: string) {
  const interval = INTERVAL[range] ?? '1d'
  const result = await chart(symbol, { interval, range })
  return {
    timestamps: result.timestamp as number[],
    closes: result.indicators.quote[0].close as (number | null)[],
  }
}
