import { NextResponse } from 'next/server'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { fetchEconomicCalendar, type CalendarDebug } from '@/lib/calendar'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const TTL = 60 * 60_000  // 1 hour — respects ForexFactory's rate limit (2 req / 5 min)

function staticUpcoming() {
  const today = new Date().toISOString().slice(0, 10)
  return UPCOMING_EVENTS.filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
}

function staticFallback() {
  const today = new Date().toISOString().slice(0, 10)
  const past = PAST_EVENTS.filter((e) => e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
  return { past, upcoming: staticUpcoming() }
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get('debug') === '1'

  // Use cache in both normal and debug mode to avoid rate-limiting ForexFactory.
  const cached = cacheGet(CACHE_KEY)
  if (cached) {
    if (debug) return NextResponse.json({ source: 'cache', ...cached })
    return NextResponse.json(cached)
  }

  const diagInfo: CalendarDebug | undefined = debug ? { feeds: {}, matched: [] } : undefined

  try {
    const data = await fetchEconomicCalendar(diagInfo)

    // If FF returned no upcoming events (e.g. end of week/weekend),
    // supplement with static upcoming events so the tab is never empty.
    const upcoming = data.upcoming.length > 0 ? data.upcoming : staticUpcoming()
    const merged = { past: data.past, upcoming }

    if (merged.past.length + merged.upcoming.length > 0) {
      cacheSet(CACHE_KEY, merged, TTL)
      if (debug) {
        return NextResponse.json({
          source: 'forexfactory',
          pastCount: merged.past.length,
          upcomingCount: merged.upcoming.length,
          upcomingSource: data.upcoming.length > 0 ? 'ff' : 'static',
          feeds: diagInfo?.feeds,
          matched: diagInfo?.matched,
        })
      }
      return NextResponse.json(merged)
    }

    if (debug) {
      return NextResponse.json({
        source: 'static',
        note: 'FF returned 0 matched US events',
        feeds: diagInfo?.feeds,
        matched: diagInfo?.matched,
      })
    }
  } catch (err) {
    if (debug) return NextResponse.json({ source: 'static', calendarError: String(err), feeds: diagInfo?.feeds })
    console.error('[events] ForexFactory failed, using static data:', err)
  }

  return NextResponse.json(staticFallback())
}
