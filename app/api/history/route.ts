import { NextResponse } from 'next/server'
import { fetchHistory } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

const SYMBOLS = ['^DXY', 'BTC-USD', 'BZ=F', 'GC=F', '^GSPC']
const KEYS = ['dxy', 'btc', 'brent', 'gold', 'sp500']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') ?? '1mo'

  const results = await Promise.allSettled(SYMBOLS.map((s) => fetchHistory(s, range)))

  // Find a reference timestamp array (first success)
  const ref = results.find(
    (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchHistory>>> =>
      r.status === 'fulfilled'
  )
  if (!ref) return NextResponse.json({ error: 'All fetches failed' }, { status: 502 })

  const refTimestamps = ref.value.timestamps

  // Build chart rows keyed by timestamp bucket (each result may have slightly different timestamps)
  const rows: Record<string, Record<string, number>> = {}

  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const { timestamps, closes } = r.value
    // Find first non-null close as base
    const base = closes.find((c) => c != null)
    if (base == null) return
    timestamps.forEach((ts, j) => {
      const c = closes[j]
      if (c == null) return
      const key = String(ts)
      if (!rows[key]) rows[key] = { time: ts * 1000 }
      rows[key][KEYS[i]] = ((c - base) / base) * 100
    })
  })

  // Sort by timestamp and only include rows that have at least one asset value
  const chartData = refTimestamps
    .map((ts) => rows[String(ts)])
    .filter(Boolean)

  return NextResponse.json(chartData, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
