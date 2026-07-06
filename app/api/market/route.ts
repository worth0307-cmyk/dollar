import { NextResponse } from 'next/server'
import { fetchYahooQuote } from '@/lib/yahoo'
import { cacheGet, cacheSet, dedupeInflight } from '@/lib/cache'
import { ASSETS as ASSET_META } from '@/lib/assets'

export const dynamic = 'force-dynamic'

// Serialized subset of the shared asset registry (lib/assets is the single
// source of truth for keys/labels — adding an asset there flows through here).
const ASSETS = ASSET_META.map(({ key, symbol, name }) => ({ key, symbol, name }))

const CACHE_KEY = 'market'
const TTL = 60_000 // 60 seconds

export async function GET() {
  const hit = cacheGet<typeof ASSETS>(CACHE_KEY)
  if (hit)
    return NextResponse.json(hit, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'HIT' },
    })

  const data = await dedupeInflight(CACHE_KEY, async () => {
    const results = await Promise.allSettled(
      ASSETS.map(async (a) => ({ ...a, ...(await fetchYahooQuote(a.key)) }))
    )
    const rows = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      console.error(`[market] ${ASSETS[i].key} failed:`, (r as PromiseRejectedResult).reason)
      return { ...ASSETS[i], price: null, change: null, changePercent: null, error: true }
    })

    // Only cache if at least one asset returned a real, finite price. (`!= null`
    // alone would also accept an undefined/NaN price slipping through.)
    if (rows.some((a) => Number.isFinite(a.price))) cacheSet(CACHE_KEY, rows, TTL)
    return rows
  })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
