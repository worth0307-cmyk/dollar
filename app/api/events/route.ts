import { NextResponse } from 'next/server'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { fetchFinnhubEvents } from '@/lib/finnhub'
import { cacheGet, cacheSet } from '@/lib/cache'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const TTL = 60 * 60_000  // 1 hour — events rarely change intraday

async function getToken(diag?: Record<string, unknown>): Promise<string | undefined> {
  if (process.env.FINNHUB_TOKEN) {
    if (diag) diag.tokenSource = 'process.env'
    return process.env.FINNHUB_TOKEN
  }
  try {
    const ctx = await getCloudflareContext({ async: true })
    const t = (ctx.env as Record<string, string>).FINNHUB_TOKEN
    if (diag) {
      diag.tokenSource = t ? 'cf-context' : 'cf-context-empty'
      diag.cfEnvKeys = Object.keys(ctx.env as object)
    }
    return t
  } catch (err) {
    if (diag) diag.cfContextError = String(err)
    return undefined
  }
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get('debug') === '1'
  const diag: Record<string, unknown> = {}

  const token = await getToken(diag)
  diag.tokenFound = !!token
  diag.tokenLen = token?.length ?? 0

  if (token) {
    const cached = cacheGet(CACHE_KEY)
    if (cached && !debug) return NextResponse.json(cached)

    try {
      const data = await fetchFinnhubEvents(token)
      cacheSet(CACHE_KEY, data, TTL)
      if (debug) {
        return NextResponse.json({
          source: 'finnhub',
          pastCount: data.past.length,
          upcomingCount: data.upcoming.length,
          sampleTitles: data.past.slice(0, 3).map((e) => e.title),
          ...diag,
        })
      }
      return NextResponse.json(data)
    } catch (err) {
      diag.finnhubError = String(err)
      console.error('[events] Finnhub failed, falling back to static data:', err)
    }
  }

  // Fallback: hardcoded static events from lib/events.ts
  const today = new Date().toISOString().slice(0, 10)
  const past = PAST_EVENTS.filter((e) => e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
  const upcoming = UPCOMING_EVENTS.filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)

  if (debug) {
    return NextResponse.json({ source: 'static', ...diag })
  }
  return NextResponse.json({ past, upcoming })
}
