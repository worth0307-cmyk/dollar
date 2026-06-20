import { NextResponse } from 'next/server'
import { PAST_EVENTS, UPCOMING_EVENTS } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)
  const past = PAST_EVENTS.filter((e) => e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
  const upcoming = UPCOMING_EVENTS.filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
  return NextResponse.json({ past, upcoming })
}
