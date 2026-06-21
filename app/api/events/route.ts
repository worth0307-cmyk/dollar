import { NextResponse } from 'next/server'
import type { MacroEvent } from '@/lib/events'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { RELEASE_EVENTS } from '@/lib/releases'
import { upcomingFomcEvents } from '@/lib/fomc'
import { fetchCalendarFromFF, type CalendarDebug } from '@/lib/calendar'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const TTL = 60 * 60_000  // 1 hour

// Historical list = narrative events + data releases (manual + auto-detected).
// Geopolitical news is fetched separately by the client via /api/news and
// merged there, so a slow feed never delays this response.
// `autoReleases` are beat/miss events derived live from the calendar feed; they
// take precedence over a manual RELEASES entry on the same date+title.
function buildPast(autoReleases: MacroEvent[] = []) {
  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<string>()
  const out: MacroEvent[] = []
  // Auto-detected releases first so they win same-date/title de-dup over manual.
  for (const e of [...autoReleases, ...PAST_EVENTS, ...RELEASE_EVENTS]) {
    if (e.date > today) continue
    const key = `${e.date}::${e.title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40)
}

// Static upcoming = hand-curated agenda + auto-generated FOMC meetings.
// FOMC dates come from lib/fomc.ts so future meetings never need hand-entry;
// a manual entry on the same date wins (keeps richer custom descriptions).
function staticUpcoming() {
  const today = new Date().toISOString().slice(0, 10)
  const manual = UPCOMING_EVENTS.filter((e) => e.date > today)
  const manualDates = new Set(manual.map((e) => e.date))
  const fomc = upcomingFomcEvents().filter((e) => !manualDates.has(e.date))
  return [...manual, ...fomc].sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get('debug') === '1'

  const cached = cacheGet(CACHE_KEY)
  if (cached) {
    if (debug) return NextResponse.json({ source: 'cache', ...cached })
    return NextResponse.json(cached)
  }

  const diagInfo: CalendarDebug | undefined = debug ? { feeds: {}, matched: [] } : undefined

  let past = buildPast()
  let upcoming = staticUpcoming()
  let upcomingSource = 'static'
  let pastSource = 'static'

  try {
    const { upcoming: ffUpcoming, releases: ffReleases } = await fetchCalendarFromFF(diagInfo)

    // Auto-detected releases (beat/miss from the feed's `actual`) fold into past.
    if (ffReleases.length > 0) {
      past = buildPast(ffReleases)
      pastSource = 'static+auto-releases'
    }

    if (ffUpcoming.length > 0) {
      // Merge: FF provides near-term events (this + next week) with live forecasts;
      // static + auto-FOMC cover the rest of the horizon.
      const ffKeys = new Set(ffUpcoming.map((e) => `${e.date}::${e.title}`))
      const staticFuture = staticUpcoming().filter((e) => !ffKeys.has(`${e.date}::${e.title}`))
      upcoming = [...ffUpcoming, ...staticFuture]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 15)
      upcomingSource = 'forexfactory+static'
    }
  } catch (err) {
    if (debug) {
      return NextResponse.json({
        source: 'hybrid',
        pastSource,
        upcomingSource: 'static (ff failed)',
        calendarError: String(err),
        past,
        upcoming,
        feeds: diagInfo?.feeds,
      })
    }
    console.error('[events] ForexFactory failed, using static data:', err)
  }

  const merged = { past, upcoming }
  cacheSet(CACHE_KEY, merged, TTL)

  if (debug) {
    return NextResponse.json({
      source: 'hybrid',
      pastSource,
      pastCount: past.length,
      upcomingSource,
      upcomingCount: upcoming.length,
      feeds: diagInfo?.feeds,
      matched: diagInfo?.matched,
    })
  }

  return NextResponse.json(merged)
}
