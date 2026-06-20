import { NextResponse } from 'next/server'
import { fetchYahooHistory } from '@/lib/yahoo'
import { cacheGet, cacheSet } from '@/lib/cache'
import {
  correlationMatrix,
  notableMoves,
  periodStats,
  type PriceMap,
} from '@/lib/analytics'

export const dynamic = 'force-dynamic'

const KEYS = ['dxy', 'btc', 'brent', 'gold', 'sp500']
const TTL = 15 * 60_000
const YTD_BASELINE_TTL = 60 * 60_000 // 1h — daily closes don't change intraday

interface HistoryPayload {
  series: Record<string, number>[]
  correlation: { keys: string[]; matrix: (number | null)[][] }
  moves: ReturnType<typeof notableMoves>
  stats: ReturnType<typeof periodStats>
}

function buildMaps(
  results: PromiseSettledResult<{ timestamps: number[]; closes: (number | null)[] }>[]
): (PriceMap | null)[] {
  return results.map((r) => {
    if (r.status !== 'fulfilled') return null
    const { timestamps, closes } = r.value
    const m: PriceMap = new Map()
    timestamps.forEach((ts, i) => {
      const c = closes[i]
      if (c != null) m.set(new Date(ts * 1000).toISOString().slice(0, 10), c)
    })
    return m
  })
}

// Fetch year-to-date baseline prices (Jan 1 of current year) — cached separately.
async function getYtdBases(): Promise<(number | null)[]> {
  const cacheKey = 'ytd:bases'
  const hit = cacheGet<(number | null)[]>(cacheKey)
  if (hit) return hit

  const year = new Date().getFullYear()
  const ytdStart = `${year}-01-01`

  // Force daily interval so we pick the exact first trading day of the year,
  // not the (less precise) first weekly bar which can be several days off.
  const results = await Promise.allSettled(KEYS.map((k) => fetchYahooHistory(k, '1y', '1d')))
  const bases = buildMaps(results).map((m) => {
    if (!m) return null
    for (const d of [...m.keys()].sort()) {
      if (d >= ytdStart) return m.get(d)!
    }
    return null
  })

  cacheSet(cacheKey, bases, YTD_BASELINE_TTL)
  return bases
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? '1mo'
  const anchor = searchParams.get('anchor') ?? 'period' // 'period' | 'ytd'
  const cacheKey = `history:${range}:${anchor}`

  const hit = cacheGet<HistoryPayload>(cacheKey)
  if (hit) return NextResponse.json(hit, { headers: { 'X-Cache': 'HIT' } })

  // Fetch price data for the requested display range.
  const results = await Promise.allSettled(KEYS.map((k) => fetchYahooHistory(k, range)))
  const maps = buildMaps(results)

  const allDates = new Set<string>()
  maps.forEach((m) => m?.forEach((_, d) => allDates.add(d)))
  const dates = Array.from(allDates).sort()

  // Choose the normalization baseline: period start (default) or YTD Jan 1.
  let bases: (number | null)[]
  if (anchor === 'ytd') {
    bases = await getYtdBases()
  } else {
    bases = KEYS.map((_, i) => {
      const m = maps[i]
      if (!m) return null
      for (const d of dates) {
        const v = m.get(d)
        if (v != null) return v
      }
      return null
    })
  }

  const series = dates.map((d) => {
    const row: Record<string, number> = { time: new Date(d).getTime() }
    KEYS.forEach((key, i) => {
      const m = maps[i]
      const base = bases[i]
      if (!m || base == null) return
      const v = m.get(d)
      if (v != null) {
        row[key] = ((v - base) / base) * 100
        row[`${key}__p`] = v  // raw price for tooltip display
      }
    })
    return row
  })

  const payload: HistoryPayload = {
    series,
    correlation: { keys: KEYS, matrix: correlationMatrix(KEYS, maps) },
    moves: notableMoves(KEYS, maps),
    stats: periodStats(KEYS, maps),
  }

  if (series.length) cacheSet(cacheKey, payload, TTL)
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
  })
}
