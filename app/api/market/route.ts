import { NextResponse } from 'next/server'
import { fetchYahooQuote } from '@/lib/yahoo'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const ASSETS = [
  { key: 'dxy', symbol: 'DXY', name: 'USD Index' },
  { key: 'btc', symbol: 'BTC', name: 'Bitcoin' },
  { key: 'brent', symbol: 'Brent', name: 'Brent Crude' },
  { key: 'gold', symbol: 'Gold', name: 'Gold' },
  { key: 'sp500', symbol: 'S&P 500', name: 'S&P 500' },
]

const CACHE_KEY = 'market'
const TTL = 60_000 // 60 seconds

export async function GET() {
  const hit = cacheGet<typeof ASSETS>(CACHE_KEY)
  if (hit) return NextResponse.json(hit, { headers: { 'X-Cache': 'HIT' } })

  const results = await Promise.allSettled(
    ASSETS.map(async (a) => ({ ...a, ...(await fetchYahooQuote(a.key)) }))
  )
  const data = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    console.error(`[market] ${ASSETS[i].key} failed:`, (r as PromiseRejectedResult).reason)
    return { ...ASSETS[i], price: null, change: null, changePercent: null, error: true }
  })

  // Only cache if at least one asset returned real data
  if (data.some((a) => a.price !== null)) cacheSet(CACHE_KEY, data, TTL)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
