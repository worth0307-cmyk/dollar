import { NextResponse } from 'next/server'
import { fetchGeopoliticalEvents, newsProbe } from '@/lib/newsfeed'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { MacroEvent } from '@/lib/events'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'geo_news'
const TTL = 4 * 60 * 60_000       // 4h on success
const RETRY_TTL = 10 * 60_000     // 10min on empty/failure, so it retries soon

// Decoupled from /api/events so a slow or failing GDELT never blocks the
// dashboard. The client fetches this separately and merges it into the
// history list.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get('debug') === '1') {
    return NextResponse.json(await newsProbe())
  }

  const cached = cacheGet<MacroEvent[]>(CACHE_KEY)
  if (cached) return NextResponse.json({ news: cached, cached: true })

  try {
    const news = await fetchGeopoliticalEvents()
    cacheSet(CACHE_KEY, news, news.length ? TTL : RETRY_TTL)
    return NextResponse.json({ news })
  } catch (err) {
    // Cache an empty result briefly to avoid hammering GDELT on every request.
    cacheSet(CACHE_KEY, [], RETRY_TTL)
    return NextResponse.json({ news: [], error: String(err) })
  }
}
