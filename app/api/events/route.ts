import { NextResponse } from 'next/server'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { RELEASE_EVENTS } from '@/lib/releases'
import { fetchUpcomingFromFF, type CalendarDebug } from '@/lib/calendar'
import { fetchGeopoliticalEvents, gdeltProbe } from '@/lib/newsfeed'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const NEWS_CACHE_KEY = 'geo_news'
const TTL = 60 * 60_000       // 1 hour for main events
const NEWS_TTL = 4 * 60 * 60_000  // 4 hours for GDELT news

// Historical list = narrative events + data releases + geopolitical news
async function buildPast() {
  const today = new Date().toISOString().slice(0, 10)
  const curated = [...PAST_EVENTS, ...RELEASE_EVENTS].filter((e) => e.date <= today)

  // Geopolitical news — cached separately so a GDELT outage doesn't block the page
  let newsEvents = cacheGet<Awaited<ReturnType<typeof fetchGeopoliticalEvents>>>(NEWS_CACHE_KEY) ?? []
  if (!newsEvents.length) {
    try {
      newsEvents = await fetchGeopoliticalEvents()
      if (newsEvents.length) cacheSet(NEWS_CACHE_KEY, newsEvents, NEWS_TTL)
    } catch (err) {
      console.error('[events] GDELT fetch failed:', err)
    }
  }

  // Keep ALL curated events (fixed, small set) and append news (≤12) so a
  // curated event is never pushed out by news. 40 > 24 curated + 12 news.
  return [...curated, ...newsEvents]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40)
}

function staticUpcoming() {
  const today = new Date().toISOString().slice(0, 10)
  return UPCOMING_EVENTS.filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const debug = params.get('debug') === '1'

  // ?debug=news — probe GDELT directly, bypassing all caches.
  if (params.get('debug') === 'news') {
    return NextResponse.json(await gdeltProbe())
  }

  const cached = cacheGet(CACHE_KEY)
  if (cached) {
    if (debug) return NextResponse.json({ source: 'cache', ...cached })
    return NextResponse.json(cached)
  }

  const past = await buildPast()
  const diagInfo: CalendarDebug | undefined = debug ? { feeds: {}, matched: [] } : undefined

  let upcoming = staticUpcoming()
  let upcomingSource = 'static'

  try {
    const ffUpcoming = await fetchUpcomingFromFF(diagInfo)
    if (ffUpcoming.length > 0) {
      upcoming = ffUpcoming
      upcomingSource = 'forexfactory'
    }
  } catch (err) {
    if (debug) {
      return NextResponse.json({
        source: 'hybrid',
        pastSource: 'static',
        upcomingSource: 'static (ff failed)',
        calendarError: String(err),
        past,
        upcoming,
        feeds: diagInfo?.feeds,
      })
    }
    console.error('[events] ForexFactory failed, using static upcoming:', err)
  }

  const merged = { past, upcoming }
  // If no news came through, cache for only 10 min so GDELT is retried sooner
  // (instead of being stuck behind the 1h cache).
  const hasNews = past.some((e) => e.source === 'news')
  cacheSet(CACHE_KEY, merged, hasNews ? TTL : 10 * 60_000)

  if (debug) {
    return NextResponse.json({
      source: 'hybrid',
      pastSource: 'static',
      pastCount: past.length,
      newsCount: past.filter((e) => e.source === 'news').length,
      upcomingSource,
      upcomingCount: upcoming.length,
      feeds: diagInfo?.feeds,
      matched: diagInfo?.matched,
    })
  }

  return NextResponse.json(merged)
}
