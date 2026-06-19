import { NextResponse } from 'next/server'
import { fetchQuote } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

const ASSETS = [
  { key: 'dxy', symbol: '^DXY', name: 'USD Index' },
  { key: 'btc', symbol: 'BTC-USD', name: 'Bitcoin' },
  { key: 'brent', symbol: 'BZ=F', name: 'Brent Crude' },
  { key: 'gold', symbol: 'GC=F', name: 'Gold' },
  { key: 'sp500', symbol: '^GSPC', name: 'S&P 500' },
]

export async function GET() {
  const results = await Promise.allSettled(
    ASSETS.map(async (a) => {
      const q = await fetchQuote(a.symbol)
      return { ...a, ...q }
    })
  )
  const data = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ...ASSETS[i], price: null, change: null, changePercent: null, error: true }
  )
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
