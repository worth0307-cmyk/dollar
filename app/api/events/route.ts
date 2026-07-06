import { NextResponse } from 'next/server'
import type { MacroEvent } from '@/lib/events'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { RELEASE_EVENTS } from '@/lib/releases'
import { upcomingFomcEvents, expiredFomcEvents } from '@/lib/fomc'
import { fetchCalendarFromFF, type CalendarDebug } from '@/lib/calendar'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const TTL = 60 * 60_000  // 1 hour
const FAIL_TTL = 5 * 60_000 // ForexFactory down → static fallback retries sooner

// Historical list = narrative events + data releases (manual + auto-detected).
// Geopolitical news is fetched separately by the client via /api/news and
// merged there, so a slow feed never delays this response.
// `autoReleases` are beat/miss events derived live from the calendar feed; they
// take precedence over a manual RELEASES entry on the same date+title.
// UPCOMING_EVENTS whose date has passed are also included automatically — this
// way an event never disappears into a void when its date crosses "today".
function buildPast(autoReleases: MacroEvent[] = []) {
  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<string>()
  // FOMC entries reach this merge from several generators with different titles
  // (manual, auto-SEP, FF template) — dedupe that family by date, first wins.
  const fomcDates = new Set<string>()
  const out: MacroEvent[] = []
  // Expired upcoming events — strictly before today, so a scheduled event stays
  // under 即将发生 for the whole of its calendar day instead of jumping into
  // history at UTC midnight, hours before it actually happens. (Releases with
  // an `actual` value are genuinely published and may carry today's date.)
  const expiredUpcoming = UPCOMING_EVENTS
    .filter((e) => e.date < today)
    .map((e) => ({ ...e, type: 'past' as const }))
  // Auto-detected releases first so they win same-date/title de-dup over manual.
  // expiredFomcEvents last — it is only the fallback archive for auto-generated
  // FOMC entries; any richer manual entry on the same date takes precedence.
  for (const e of [...autoReleases, ...PAST_EVENTS, ...expiredUpcoming, ...RELEASE_EVENTS, ...expiredFomcEvents()]) {
    if (e.date > today) continue
    const key = `${e.date}::${e.title}`
    if (seen.has(key)) continue
    if (e.title.includes('FOMC')) {
      if (fomcDates.has(e.date)) continue
      fomcDates.add(e.date)
    }
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
  // >= today: an event stays on the agenda for the whole of its calendar day.
  const manual = UPCOMING_EVENTS.filter((e) => e.date >= today)
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
  let ffOk = false

  try {
    const { upcoming: ffUpcoming, releases: ffReleases } = await fetchCalendarFromFF(diagInfo)
    ffOk = true

    // Auto-detected releases (beat/miss from the feed's `actual`) fold into past.
    if (ffReleases.length > 0) {
      past = buildPast(ffReleases)
      pastSource = 'static+auto-releases'
    }

    if (ffUpcoming.length > 0) {
      // Merge: FF provides near-term events (this + next week) with live forecasts;
      // static + auto-FOMC cover the rest of the horizon.
      const ffKeys = new Set(ffUpcoming.map((e) => `${e.date}::${e.title}`))
      // FOMC arrives with different titles per generator (FF template vs
      // auto-SEP "FOMC 利率决议 + SEP 经济预测") — also drop same-date FOMC
      // statics so a SEP meeting inside the FF window doesn't show twice.
      const ffFomcDates = new Set(
        ffUpcoming.filter((e) => e.title.includes('FOMC')).map((e) => e.date)
      )
      const staticFuture = staticUpcoming().filter(
        (e) =>
          !ffKeys.has(`${e.date}::${e.title}`) &&
          !(e.title.includes('FOMC') && ffFomcDates.has(e.date))
      )
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
  // Static fallback (FF down) caches briefly so live data returns quickly.
  cacheSet(CACHE_KEY, merged, ffOk ? TTL : FAIL_TTL)

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
