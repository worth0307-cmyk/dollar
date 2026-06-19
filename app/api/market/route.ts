import { NextResponse } from 'next/server'
import { fetchStooqQuote } from '@/lib/stooq'
import { fetchBtcQuote } from '@/lib/coingecko'

export const dynamic = 'force-dynamic'

const ASSETS = [
  { key: 'dxy', symbol: 'DXY', name: 'USD Index' },
  { key: 'btc', symbol: 'BTC-USD', name: 'Bitcoin' },
  { key: 'brent', symbol: 'UKOIL', name: 'Brent Crude' },
  { key: 'gold', symbol: 'XAUUSD', name: 'Gold' },
  { key: 'sp500', symbol: '^SPX', name: 'S&P 500' },
]

async function fetchAsset(key: string) {
  return key === 'btc' ? fetchBtcQuote() : fetchStooqQuote(key)
}

export async function GET() {
  const results = await Promise.allSettled(
    ASSETS.map(async (a) => ({ ...a, ...(await fetchAsset(a.key)) }))
  )
  const data = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ...ASSETS[i], price: null, change: null, changePercent: null, error: true }
  )
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
