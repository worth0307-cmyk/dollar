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
const TTL = 5 * 60_000

interface HistoryPayload {
  series: Record<string, number>[]
  correlation: { keys: string[]; matrix: (number | null)[][] }
  moves: ReturnType<typeof notableMoves>
  stats: ReturnType<typeof periodStats>
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? '1mo'
  const cacheKey = `history:${range}`

  const hit = cacheGet<HistoryPayload>(cacheKey)
  if (hit) return NextResponse.json(hit, { headers: { 'X-Cache': 'HIT' } })

  const results = await Promise.allSettled(KEYS.map((k) => fetchYahooHistory(k, range)))

  // Raw price per asset keyed by date — feeds both the chart and the analytics.
  const maps: (PriceMap | null)[] = results.map((r) => {
    if (r.status !== 'fulfilled') return null
    const { timestamps, closes } = r.value
    const m: PriceMap = new Map()
    timestamps.forEach((ts, i) => {
      const c = closes[i]
      if (c != null) m.set(new Date(ts * 1000).toISOString().slice(0, 10), c)
    })
    return m
  })

  const allDates = new Set<string>()
  maps.forEach((m) => m?.forEach((_, d) => allDates.add(d)))
  const dates = Array.from(allDates).sort()

  // Baseline = first available price per asset, for % normalization.
  const bases = KEYS.map((_, i) => {
    const m = maps[i]
    if (!m) return null
    for (const d of dates) {
      const v = m.get(d)
      if (v != null) return v
    }
    return null
  })

  const series = dates.map((d) => {
    const row: Record<string, number> = { time: new Date(d).getTime() }
    KEYS.forEach((key, i) => {
      const m = maps[i]
      const base = bases[i]
      if (!m || base == null) return
      const v = m.get(d)
      if (v != null) row[key] = ((v - base) / base) * 100
    })
    return row
  })

  const payload: HistoryPayload = {
    series,
    correlation: { keys: KEYS, matrix: correlationMatrix(KEYS, maps) },
    moves: notableMoves(KEYS, maps),
    stats: periodStats(KEYS, maps),
  }

  // Only cache a payload that actually carries data.
  if (series.length) cacheSet(cacheKey, payload, TTL)
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
  })
}
