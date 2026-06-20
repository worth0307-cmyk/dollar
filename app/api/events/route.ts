import { NextResponse } from 'next/server'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'
import { fetchFinnhubEvents } from '@/lib/finnhub'
import { cacheGet, cacheSet } from '@/lib/cache'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'macro_events'
const TTL = 60 * 60_000  // 1 hour — events rarely change intraday

async function getToken(): Promise<string | undefined> {
  if (process.env.FINNHUB_TOKEN) return process.env.FINNHUB_TOKEN
  try {
    const ctx = await getCloudflareContext({ async: true })
    return (ctx.env as Record<string, string>).FINNHUB_TOKEN
  } catch {
    return undefined
  }
}

export async function GET() {
  const token = await getToken()

  if (token) {
    const cached = cacheGet(CACHE_KEY)
    if (cached) return NextResponse.json(cached)

    try {
      const data = await fetchFinnhubEvents(token)
      cacheSet(CACHE_KEY, data, TTL)
      return NextResponse.json(data)
    } catch (err) {
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
  return NextResponse.json({ past, upcoming })
}
