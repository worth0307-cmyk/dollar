import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function GET() {
  const steps: Record<string, unknown> = {}

  try {
    // 1. Consent cookie
    const r1 = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    })
    const rawCookies: string[] =
      typeof (r1.headers as any).getSetCookie === 'function'
        ? (r1.headers as any).getSetCookie()
        : []
    const cookie = rawCookies.map((c: string) => c.split(';')[0]).join('; ')
    steps.consent = { status: r1.status, cookieCount: rawCookies.length }

    // 2. Crumb
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
    })
    const crumb = await r2.text()
    steps.crumb = { status: r2.status, crumb: crumb.slice(0, 20) }

    // 3. Test one quote
    const testUrl = `https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d&crumb=${encodeURIComponent(crumb)}`
    const r3 = await fetch(testUrl, {
      headers: { 'User-Agent': UA, Cookie: cookie },
      cache: 'no-store',
    })
    const json = await r3.json()
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
    steps.quote = { status: r3.status, sp500: price ?? null }
  } catch (err: unknown) {
    steps.error = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(steps)
}
