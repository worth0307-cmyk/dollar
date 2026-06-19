import { NextResponse } from 'next/server'
import { fetchStooqHistory } from '@/lib/stooq'
import { fetchBtcHistory } from '@/lib/coingecko'
import { cacheGet, cacheSet } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const KEYS = ['dxy', 'btc', 'brent', 'gold', 'sp500']
const TTL = 5 * 60_000 // 5 minutes for history

async function fetchHistory(key: string, range: string) {
  return key === 'btc' ? fetchBtcHistory(range) : fetchStooqHistory(key, range)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? '1mo'
  const cacheKey = `history:${range}`

  const hit = cacheGet<Record<string, number>[]>(cacheKey)
  if (hit) return NextResponse.json(hit, { headers: { 'X-Cache': 'HIT' } })

  const results = await Promise.allSettled(KEYS.map((k) => fetchHistory(k, range)))

  type DMap = Map<string, number>
  const maps: (DMap | null)[] = results.map((r) => {
    if (r.status !== 'fulfilled') return null
    const { timestamps, closes } = r.value
    const m = new Map<string, number>()
    timestamps.forEach((ts, i) => {
      const c = closes[i]
      if (c != null) {
        const d = new Date(ts * 1000).toISOString().slice(0, 10)
        m.set(d, c)
      }
    })
    return m
  })

  const allDates = new Set<string>()
  maps.forEach((m) => m?.forEach((_, d) => allDates.add(d)))
  const dates = Array.from(allDates).sort()

  const bases = KEYS.map((_, i) => {
    const m = maps[i]
    if (!m) return null
    for (const d of dates) {
      const v = m.get(d)
      if (v != null) return v
    }
    return null
  })

  const chartData = dates.map((d) => {
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

  cacheSet(cacheKey, chartData, TTL)
  return NextResponse.json(chartData, { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } })
}
