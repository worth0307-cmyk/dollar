import { NextResponse } from 'next/server'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { fetchEconomicCalendar, type CalendarDebug } from '@/lib/calendar'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const TTL = 60 * 60_000  // 1 hour — events rarely change intraday, also respects feed rate limit

function staticEvents() {
  const today = new Date().toISOString().slice(0, 10)
  const past = PAST_EVENTS.filter((e) => e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
  const upcoming = UPCOMING_EVENTS.filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
  return { past, upcoming }
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get('debug') === '1'

  const cached = cacheGet(CACHE_KEY)
  if (cached && !debug) return NextResponse.json(cached)

  const diagInfo: CalendarDebug | undefined = debug ? { feeds: {}, matched: [] } : undefined

  try {
    const data = await fetchEconomicCalendar(diagInfo)
    if (data.past.length + data.upcoming.length > 0) {
      cacheSet(CACHE_KEY, data, TTL)
      if (debug) {
        return NextResponse.json({
          source: 'forexfactory',
          pastCount: data.past.length,
          upcomingCount: data.upcoming.length,
          feeds: diagInfo?.feeds,
          matched: diagInfo?.matched,
        })
      }
      return NextResponse.json(data)
    }
    if (debug) {
      return NextResponse.json({ source: 'static', note: 'feed returned 0 matched US events', feeds: diagInfo?.feeds })
    }
  } catch (err) {
    if (debug) return NextResponse.json({ source: 'static', calendarError: String(err), feeds: diagInfo?.feeds })
    console.error('[events] ForexFactory failed, using static data:', err)
  }

  const data = staticEvents()
  if (debug) return NextResponse.json({ source: 'static', ...data })
  return NextResponse.json(data)
}
