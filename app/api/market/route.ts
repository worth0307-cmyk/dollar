import { NextResponse } from 'next/server'
import { fetchStooqQuote } from '@/lib/stooq'
import { fetchBtcQuote } from '@/lib/coingecko'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const ASSETS = [
  { key: 'dxy', symbol: 'DXY', name: 'USD Index' },
  { key: 'btc', symbol: 'BTC-USD', name: 'Bitcoin' },
  { key: 'brent', symbol: 'UKOIL', name: 'Brent Crude' },
  { key: 'gold', symbol: 'XAUUSD', name: 'Gold' },
  { key: 'sp500', symbol: '^SPX', name: 'S&P 500' },
]

async function fetchAsset(key: string) {
  return key === 'btc' ? fetchBtcQuote() : fetchStooqQuote(key)
}

const CACHE_KEY = 'market'
const TTL = 60_000 // 60 seconds

export async function GET() {
  const hit = cacheGet<typeof ASSETS>(CACHE_KEY)
  if (hit) return NextResponse.json(hit, { headers: { 'X-Cache': 'HIT' } })

  const results = await Promise.allSettled(
    ASSETS.map(async (a) => ({ ...a, ...(await fetchAsset(a.key)) }))
  )
  const data = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ...ASSETS[i], price: null, change: null, changePercent: null, error: true }
  )

  cacheSet(CACHE_KEY, data, TTL)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
