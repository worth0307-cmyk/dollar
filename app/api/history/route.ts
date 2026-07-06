import { NextResponse } from 'next/server'
import { fetchYahooHistory } from '@/lib/yahoo'
import { cacheGet, cacheSet, dedupeInflight } from '@/lib/cache'
import { ASSET_KEYS } from '@/lib/assets'
import {
  correlationMatrix,
  notableMoves,
  periodStats,
  type PriceMap,
} from '@/lib/analytics'

export const dynamic = 'force-dynamic'

const KEYS = ASSET_KEYS
const TTL = 15 * 60_000
const YTD_BASELINE_TTL = 60 * 60_000 // 1h — daily closes don't change intraday
const PARTIAL_TTL = 5 * 60_000 // incomplete data (Yahoo hiccup) → retry soon

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

// Shared 1Y daily price maps — fetched once and reused by both getYearMoves()
// and getYtdBases() to avoid hitting Yahoo twice on the same cache miss.
async function get1YMaps(): Promise<(PriceMap | null)[]> {
  const cacheKey = 'raw:1y'
  const hit = cacheGet<(PriceMap | null)[]>(cacheKey)
  if (hit) return hit

  return dedupeInflight(cacheKey, async () => {
    const results = await Promise.allSettled(KEYS.map((k) => fetchYahooHistory(k, '1y', '1d')))
    const maps = buildMaps(results)
    // Don't let a Yahoo outage poison downstream caches (moves, YTD bases) for
    // a full hour: complete data caches normally, partial data retries soon,
    // an all-failed fetch is never cached.
    const okCount = maps.filter((m) => m && m.size > 0).length
    if (okCount === KEYS.length) cacheSet(cacheKey, maps, YTD_BASELINE_TTL)
    else if (okCount > 0) cacheSet(cacheKey, maps, PARTIAL_TTL)
    return maps
  })
}

// Notable moves are computed once over a stable ~1Y window so a day's z-score
// (its "abnormality") is an intrinsic property, independent of the chart range
// being viewed. The route then slices these to the display window — making the
// shorter ranges strict subsets of 1Y instead of re-normalizing σ per range.
async function getYearMoves(): Promise<ReturnType<typeof notableMoves>> {
  const cacheKey = 'moves:1y'
  const hit = cacheGet<ReturnType<typeof notableMoves>>(cacheKey)
  if (hit) return hit

  const maps = await get1YMaps()
  // High cap so we keep every >2σ day in the year; the route caps display to 20.
  const moves = notableMoves(KEYS, maps, 1000, 2)

  const complete = maps.every((m) => m && m.size > 0)
  cacheSet(cacheKey, moves, complete ? YTD_BASELINE_TTL : PARTIAL_TTL)
  return moves
}

// Fetch year-to-date baseline prices — cached separately.
// YTD convention: baseline = the prior year's LAST close, so the first trading
// day of January contributes to the YTD move. Falls back to the first close on
// or after Jan 1 for assets whose history doesn't reach into the prior year.
async function getYtdBases(): Promise<(number | null)[]> {
  const cacheKey = 'ytd:bases'
  const hit = cacheGet<(number | null)[]>(cacheKey)
  if (hit) return hit

  const year = new Date().getFullYear()
  const ytdStart = `${year}-01-01`

  const bases = (await get1YMaps()).map((m) => {
    if (!m) return null
    const dates = [...m.keys()].sort()
    let prior: string | null = null
    for (const d of dates) {
      if (d < ytdStart) prior = d
      else break
    }
    if (prior) return m.get(prior)!
    for (const d of dates) if (d >= ytdStart) return m.get(d)!
    return null
  })

  const complete = bases.every((b) => b != null)
  cacheSet(cacheKey, bases, complete ? YTD_BASELINE_TTL : PARTIAL_TTL)
  return bases
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? '1mo'
  const anchor = searchParams.get('anchor') ?? 'period' // 'period' | 'ytd'
  const cacheKey = `history:${range}:${anchor}`

  const hit = cacheGet<HistoryPayload>(cacheKey)
  if (hit)
    return NextResponse.json(hit, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'HIT' },
    })

  const payload = await dedupeInflight(cacheKey, () => buildPayload(range, anchor, cacheKey))
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
  })
}

async function buildPayload(range: string, anchor: string, cacheKey: string): Promise<HistoryPayload> {
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

  // Stable-σ moves from the 1Y baseline, sliced to the displayed window.
  // 1Y returns ALL qualifying moves in the window (the panel scrolls);
  // shorter ranges cap to keep the list digestible without scrolling.
  const topN = ({ '5d': 10, '1mo': 20, '3mo': 30, '6mo': 40 } as Record<string, number>)[range]
  const yearMoves = await getYearMoves()
  const displayStart = dates.length ? new Date(dates[0]).getTime() : 0
  const filtered = yearMoves.filter((m) => m.time >= displayStart)
  const moves = topN != null ? filtered.slice(0, topN) : filtered

  // Derive anchor-correct changePct from the last non-null series value per key.
  // periodStats() always uses period-start as baseline; series[] already has the
  // anchor-adjusted % baked in (base = period-start or YTD Jan 1 depending on anchor).
  const rawStats = periodStats(KEYS, maps)
  KEYS.forEach((key, i) => {
    let last: number | null = null
    for (let j = series.length - 1; j >= 0; j--) {
      const v = series[j][key]
      if (v != null) { last = v as number; break }
    }
    if (last != null) rawStats[key] = { ...rawStats[key], changePct: last }
  })

  const payload: HistoryPayload = {
    series,
    correlation: { keys: KEYS, matrix: correlationMatrix(KEYS, maps) },
    moves,
    stats: rawStats,
  }

  // Incomplete data (an asset's fetch failed) caches briefly so it heals fast.
  const complete = maps.every((m) => m && m.size > 0)
  if (series.length) cacheSet(cacheKey, payload, complete ? TTL : PARTIAL_TTL)
  return payload
}
