// OilPrice.com RSS — free, energy/geopolitics focused, no per-IP rate limit.
// Covers crude oil, OPEC, sanctions, and supply-disruption headlines.
// We infer affected assets from the headline and classify impact level.

import type { MacroEvent } from './events'

interface NewsItem {
  title: string
  url: string
  date: string // YYYY-MM-DD
  source: string
}

// Title keywords → affected assets
const ASSET_SIGNALS: Array<{ re: RegExp; assets: string[] }> = [
  {
    re: /oil|crude|brent|opec|petroleum|refin|hormuz|strait|pipeline|lng|tanker|saudi|aramco|gas|energy/i,
    assets: ['brent'],
  },
  { re: /gold|safe.?haven|bullion|precious metal/i, assets: ['gold'] },
  { re: /dollar|usd|sanction|treasury|forex|fed\b/i, assets: ['dxy'] },
  { re: /stock|equit|nasdaq|dow jones|s&p|wall street|market (crash|plunge|surge)/i, assets: ['sp500'] },
  { re: /bitcoin|crypto|btc|digital asset/i, assets: ['btc'] },
]

// Words that mark a HIGH-impact event
const HIGH_RE =
  /war|attack|bomb|strike|invasion|close[sd]?|closure|shutdown|seize[sd]?|sanction|crisis|emergency|hostage|blockade|missile|surge|plunge|crash/i

function inferAssets(title: string): string[] {
  const found = new Set<string>()
  for (const { re, assets } of ASSET_SIGNALS) {
    if (re.test(title)) assets.forEach((a) => found.add(a))
  }
  if (found.size === 0 && /conflict|military|troops|forces|war|tension|israel|iran|russia|ukraine/i.test(title)) {
    found.add('brent')
    found.add('gold')
  }
  return found.size > 0 ? [...found] : ['brent', 'gold']
}

function inferImpact(title: string): 'high' | 'medium' {
  return HIGH_RE.test(title) ? 'high' : 'medium'
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? decodeEntities(m[1]) : ''
}

// "Wed, 18 Jun 2026 14:30:00 GMT" → "2026-06-21"
function toIsoDate(pubDate: string): string {
  const t = Date.parse(pubDate)
  return Number.isNaN(t)
    ? new Date().toISOString().slice(0, 10)
    : new Date(t).toISOString().slice(0, 10)
}

function parseRss(xml: string): NewsItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
  return items.map((block) => {
    const title = pick(block, 'title').trim()
    const url = pick(block, 'link') || pick(block, 'guid')
    return {
      title,
      url,
      date: toIsoDate(pick(block, 'pubDate')),
      source: 'OilPrice.com',
    }
  })
}

// Drop near-duplicate stories by a 3-keyword fingerprint of the title.
function dedup(items: NewsItem[]): NewsItem[] {
  const STOPWORDS = /^(the|this|that|with|from|have|will|been|were|they|after|amid|over|into|says|said|about|could|would|amid)$/
  const seen = new Set<string>()
  return items.filter((a) => {
    const fp = a.title
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.test(w))
      .slice(0, 3)
      .sort()
      .join('|')
    if (!fp || seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

const NEWS_TIMEOUT = 10_000

const FEED_URL = 'https://oilprice.com/rss/main'

async function rawFetch(): Promise<{ status: number; body: string }> {
  const res = await fetch(FEED_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(NEWS_TIMEOUT),
  })
  const body = await res.text()
  return { status: res.status, body }
}

function toEvents(items: NewsItem[]): MacroEvent[] {
  const today = new Date().toISOString().slice(0, 10)
  return dedup(items)
    .filter((a) => a.title.length > 10)
    .slice(0, 12)
    .map((a): MacroEvent => {
      const title = a.title.length > 72 ? a.title.slice(0, 69) + '…' : a.title
      return {
        date: a.date,
        title,
        description: `${a.source} 报道`,
        impact: inferImpact(a.title),
        assets: inferAssets(a.title),
        type: 'past',
        url: a.url,
        source: 'news',
      }
    })
    .filter((e) => e.date <= today)
}

export async function fetchGeopoliticalEvents(): Promise<MacroEvent[]> {
  const { status, body } = await rawFetch()
  if (status !== 200) throw new Error(`OilPrice RSS HTTP ${status}: ${body.slice(0, 120)}`)
  return toEvents(parseRss(body))
}

// Diagnostics for the ?debug=1 endpoint — never throws.
export async function newsProbe(): Promise<Record<string, unknown>> {
  try {
    const { status, body } = await rawFetch()
    const items = parseRss(body)
    const events = toEvents(items)
    return {
      url: FEED_URL,
      httpStatus: status,
      bodyStart: body.slice(0, 160),
      itemCount: items.length,
      eventCount: events.length,
      sample: events.slice(0, 3).map((e) => ({ date: e.date, title: e.title, assets: e.assets })),
    }
  } catch (e) {
    return { url: FEED_URL, fetchError: String(e) }
  }
}
