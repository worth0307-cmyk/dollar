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

// Asset key → Chinese name, for the auto-generated impact narrative.
const ASSET_ZH: Record<string, string> = {
  brent: '布伦特原油',
  gold: '黄金',
  dxy: '美元',
  sp500: '美股',
  btc: '比特币',
}

// English headline keywords → Chinese topic phrase, so the (English) headline
// gets a Chinese gist line in the same style as the 超预期/不及预期 analysis.
const ZH_TOPICS: Array<{ re: RegExp; phrase: string }> = [
  { re: /hormuz|strait/i, phrase: '霍尔木兹海峡局势' },
  { re: /opec/i, phrase: 'OPEC+ 产量动态' },
  { re: /sanction|embargo/i, phrase: '制裁与禁运' },
  { re: /war|attack|strike|missile|invasion|conflict|military|troops/i, phrase: '地缘冲突' },
  { re: /pipeline|tanker|refin/i, phrase: '能源基础设施' },
  { re: /supply|output|production|export|barrel/i, phrase: '原油供应' },
  { re: /gas|lng/i, phrase: '天然气市场' },
  { re: /iran|russia|saudi|venezuela|israel|ukraine/i, phrase: '产油国局势' },
  { re: /price|surge|plunge|rally|rise|fall|drop/i, phrase: '油价波动' },
]

// Auto-generated Chinese impact line — keeps the news feature fully automatic
// while presenting a Chinese summary alongside the source headline.
function zhNarrative(title: string, assets: string[], impact: 'high' | 'medium'): string {
  const topics = ZH_TOPICS.filter((t) => t.re.test(title)).map((t) => t.phrase).slice(0, 2)
  const topicStr = topics.length ? topics.join('、') : '能源市场动态'
  const assetStr = assets.map((a) => ASSET_ZH[a]).filter(Boolean).join('、') || '能源资产'
  const lead = impact === 'high' ? '重大' : ''
  return `${lead}${topicStr} → 关注${assetStr}波动`
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
const TRANSLATE_TIMEOUT = 5_000

const FEED_URL = 'https://oilprice.com/rss/main'

// MyMemory free translation — no API key, 1000 req/day limit.
// Falls back to the original English title on any error.
async function translateOne(text: string): Promise<string> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`
    const res = await fetch(url, { signal: AbortSignal.timeout(TRANSLATE_TIMEOUT) })
    if (!res.ok) return text
    const json = await res.json()
    const translated: string = json?.responseData?.translatedText ?? ''
    // MyMemory returns the original text (or error strings) when translation fails
    if (!translated || translated === text || /MYMEMORY|QUERY|ERROR/i.test(translated)) return text
    return translated
  } catch {
    return text
  }
}

async function translateAll(titles: string[]): Promise<string[]> {
  const results = await Promise.allSettled(titles.map(translateOne))
  return results.map((r, i) => (r.status === 'fulfilled' ? r.value : titles[i]))
}

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

async function toEvents(items: NewsItem[]): Promise<MacroEvent[]> {
  const today = new Date().toISOString().slice(0, 10)
  const candidates = dedup(items)
    .filter((a) => a.title.length > 10)
    .slice(0, 12)

  // Translate all headlines in parallel; falls back to English on any error.
  const translated = await translateAll(candidates.map((a) => a.title))

  return candidates
    .map((a, idx): MacroEvent => {
      const rawTitle = a.title
      const zhTitle = translated[idx] ?? rawTitle
      const displayTitle = zhTitle.length > 72 ? zhTitle.slice(0, 69) + '…' : zhTitle
      const impact = inferImpact(rawTitle)
      const assets = inferAssets(rawTitle)
      return {
        date: a.date,
        title: displayTitle,
        description: zhNarrative(rawTitle, assets, impact),
        impact,
        assets,
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
    const events = await toEvents(items)
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
