import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, unknown> = {}

  // Test Stooq (S&P 500)
  try {
    const r = await fetch(
      'https://stooq.com/q/l/?s=%5Espx&f=sd2t2ohlcv&h&e=csv',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }
    )
    const text = await r.text()
    const rows = text.trim().split('\n')
    const cols = rows[1]?.split(',') ?? []
    results.stooq = { status: r.status, close: cols[6] ?? null, sample: rows[1]?.slice(0, 60) }
  } catch (e: unknown) {
    results.stooq = { error: e instanceof Error ? e.message : String(e) }
  }

  // Test CoinGecko (BTC)
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { cache: 'no-store' }
    )
    const json = await r.json()
    results.coingecko = { status: r.status, btcUsd: json?.bitcoin?.usd ?? null }
  } catch (e: unknown) {
    results.coingecko = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json(results)
}
