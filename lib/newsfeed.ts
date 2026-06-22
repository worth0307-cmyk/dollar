// Multi-source financial news aggregator.
// Each feed is fetched in parallel; a failing feed contributes 0 items
// and never blocks the others. Sources are chosen for being unlikely
// to block Cloudflare Worker datacenter IPs (government sites, small
// independent publishers without CF Bot Management).

import type { MacroEvent } from './events'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { canSpend, recordSpend, recordBlocked, budgetSnapshot } from './aibudget'

interface NewsItem {
  title: string
  url: string
  date: string // YYYY-MM-DD
  source: string
}

// Extended NewsItem carrying per-feed asset hints through the pipeline.
type TaggedItem = NewsItem & { assetHints: string[] }

interface FeedConfig {
  url: string
  name: string
  assetHints: string[] // always merged into inferAssets result
  maxItems: number     // cap per feed before global merge
}

// Free RSS feeds chosen by topic coverage and low likelihood of datacenter IP
// blocks. Each failed feed silently contributes zero items.
const FEEDS: FeedConfig[] = [
  {
    url: 'https://oilprice.com/rss/main',
    name: 'OilPrice.com',
    assetHints: ['brent'],
    maxItems: 5,
  },
  {
    // US Federal Reserve press releases — FOMC statements, rate decisions,
    // supervisory guidance. Government site, never blocks datacenter IPs.
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    name: 'Federal Reserve',
    assetHints: ['dxy'],
    maxItems: 3,
  },
  {
    url: 'https://cointelegraph.com/rss',
    name: 'CoinTelegraph',
    assetHints: ['btc'],
    maxItems: 4,
  },
  {
    url: 'https://www.kitco.com/rss/news.xml',
    name: 'Kitco News',
    assetHints: ['gold'],
    maxItems: 4,
  },
]

// Title keywords → affected assets (keyword-based inference)
const ASSET_SIGNALS: Array<{ re: RegExp; assets: string[] }> = [
  {
    re: /oil|crude|brent|opec|petroleum|refin|hormuz|strait|pipeline|lng|tanker|saudi|aramco|gas|energy/i,
    assets: ['brent'],
  },
  { re: /gold|safe.?haven|bullion|precious metal|silver/i, assets: ['gold'] },
  { re: /dollar|usd|sanction|treasury|forex|fed\b|federal reserve|fomc|rate hike|rate cut/i, assets: ['dxy'] },
  { re: /stock|equit|nasdaq|dow jones|s&p|wall street|market (crash|plunge|surge)/i, assets: ['sp500'] },
  { re: /bitcoin|crypto|btc|digital asset|blockchain|defi/i, assets: ['btc'] },
]

// Words that mark a HIGH-impact event
const HIGH_RE =
  /war|attack|bomb|strike|invasion|close[sd]?|closure|shutdown|seize[sd]?|sanction|crisis|emergency|hostage|blockade|missile|surge|plunge|crash|halt|ban|hack|exploit|default|collapse/i

function inferAssets(title: string, hints: string[] = []): string[] {
  const found = new Set<string>(hints)
  for (const { re, assets } of ASSET_SIGNALS) {
    if (re.test(title)) assets.forEach((a) => found.add(a))
  }
  if (
    found.size === hints.length &&
    /conflict|military|troops|forces|war|tension|israel|iran|russia|ukraine/i.test(title)
  ) {
    found.add('brent')
    found.add('gold')
  }
  return found.size > 0 ? [...found] : ['brent', 'gold']
}

function inferImpact(title: string): 'high' | 'medium' {
  return HIGH_RE.test(title) ? 'high' : 'medium'
}

// Asset key → Chinese name
const ASSET_ZH: Record<string, string> = {
  brent: '布伦特原油',
  gold: '黄金',
  dxy: '美元指数',
  sp500: '美股',
  btc: '比特币',
}

// Headline keywords → Chinese topic phrase for the auto-generated narrative
const ZH_TOPICS: Array<{ re: RegExp; phrase: string }> = [
  // Energy / OilPrice
  { re: /hormuz|strait/i, phrase: '霍尔木兹海峡局势' },
  { re: /opec/i, phrase: 'OPEC+ 产量动态' },
  { re: /sanction|embargo/i, phrase: '制裁与禁运' },
  { re: /war|attack|strike|missile|invasion|conflict|military|troops/i, phrase: '地缘冲突' },
  { re: /pipeline|tanker|refin/i, phrase: '能源基础设施' },
  { re: /supply|output|production|export|barrel/i, phrase: '原油供应' },
  { re: /gas|lng/i, phrase: '天然气市场' },
  { re: /iran|russia|saudi|venezuela|israel|ukraine/i, phrase: '产油国局势' },
  // Fed / macro
  { re: /federal reserve|fomc|rate hike|rate cut|interest rate|monetary policy/i, phrase: '美联储货币政策' },
  { re: /inflation|cpi|pce|core inflation/i, phrase: '通胀数据' },
  { re: /employment|jobs|unemployment|payroll|nonfarm/i, phrase: '就业市场' },
  { re: /dollar|usd|dxy|forex|exchange rate/i, phrase: '美元汇率' },
  // Gold
  { re: /gold|bullion|precious metal|silver/i, phrase: '黄金市场' },
  // Crypto
  { re: /bitcoin|btc|blockchain|defi|crypto/i, phrase: '加密货币市场' },
  { re: /hack|exploit|breach|theft/i, phrase: '安全事件' },
  // Equities
  { re: /stock market|equit|s&p|nasdaq|wall street|earnings/i, phrase: '股市行情' },
  // Generic price action
  { re: /price|surge|plunge|rally|rise|fall|drop/i, phrase: '市场价格波动' },
]

function zhNarrative(title: string, assets: string[], impact: 'high' | 'medium'): string {
  const topics = ZH_TOPICS.filter((t) => t.re.test(title)).map((t) => t.phrase).slice(0, 2)
  const topicStr = topics.length ? topics.join('、') : '宏观金融市场动态'
  const assetStr = assets.map((a) => ASSET_ZH[a]).filter(Boolean).join('、') || '相关资产'
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

// "Wed, 18 Jun 2026 14:30:00 GMT" → "2026-06-18"
function toIsoDate(pubDate: string): string {
  const t = Date.parse(pubDate)
  return Number.isNaN(t)
    ? new Date().toISOString().slice(0, 10)
    : new Date(t).toISOString().slice(0, 10)
}

function parseRss(xml: string, sourceName: string): NewsItem[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
  return items.map((block) => {
    const title = pick(block, 'title').trim()
    const url = pick(block, 'link') || pick(block, 'guid')
    return {
      title,
      url,
      date: toIsoDate(pick(block, 'pubDate')),
      source: sourceName,
    }
  })
}

// Generic dedup — keeps first occurrence of each 3-keyword fingerprint.
function dedup<T extends { title: string }>(items: T[]): T[] {
  const STOPWORDS = /^(the|this|that|with|from|have|will|been|were|they|after|amid|over|into|says|said|about|could|would)$/
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

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Fetch one feed; silently returns [] on any network/parse error.
async function fetchOneFeed(feed: FeedConfig): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(NEWS_TIMEOUT),
    })
    if (!res.ok) return []
    const body = await res.text()
    return parseRss(body, feed.name)
  } catch {
    return []
  }
}

// ── Translation ────────────────────────────────────────────────────────────
const CF_AI_MODEL = '@cf/meta/m2m100-1.2b'

async function cfCreds(): Promise<{ id: string; token: string; source: string }> {
  let id = (process.env.CF_ACCOUNT_ID ?? '').trim()
  let token = (process.env.CF_AI_TOKEN ?? '').trim()
  let source = id && token ? 'process.env' : ''
  if (!id || !token) {
    try {
      const { env } = await getCloudflareContext({ async: true })
      const e = env as Record<string, string | undefined>
      id = id || (e.CF_ACCOUNT_ID ?? '').trim()
      token = token || (e.CF_AI_TOKEN ?? '').trim()
      if (id && token) source = source || 'cf-binding'
    } catch {
      // Not inside a Cloudflare request context (e.g. build/SSG) — process.env only.
    }
  }
  return { id, token, source }
}

const TRANSLATE_EMAIL = (process.env.MYMEMORY_EMAIL ?? 'worth0307@gmail.com').trim()

type AiBinding = { run: (model: string, inputs: unknown) => Promise<unknown> }
async function aiBinding(): Promise<AiBinding | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const ai = (env as Record<string, unknown>).AI as AiBinding | undefined
    return ai && typeof ai.run === 'function' ? ai : null
  } catch {
    return null
  }
}

interface WaiResult {
  zh: string
  configured: boolean
  via?: 'binding' | 'rest'
  blocked?: boolean
  status?: number
  error?: string
}

async function translateViaWorkersAIDetailed(text: string): Promise<WaiResult> {
  const ai = await aiBinding()
  const { id, token } = await cfCreds()
  if (!ai && !(id && token)) {
    return { zh: text, configured: false, error: 'no AI binding; CF_ACCOUNT_ID / CF_AI_TOKEN not set' }
  }

  if (!canSpend()) {
    recordBlocked()
    return { zh: text, configured: true, blocked: true, error: 'daily budget cap reached' }
  }
  recordSpend()
  const inputs = { text, source_lang: 'english', target_lang: 'chinese' }

  if (ai) {
    try {
      const out = (await ai.run(CF_AI_MODEL, inputs)) as { translated_text?: string }
      const translated = out?.translated_text ?? ''
      if (translated && translated.trim() !== text.trim()) {
        return { zh: translated, configured: true, via: 'binding', status: 200 }
      }
      if (!(id && token)) {
        return { zh: text, configured: true, via: 'binding', status: 200, error: 'binding empty/identical result' }
      }
    } catch (e) {
      if (!(id && token)) return { zh: text, configured: true, via: 'binding', error: String(e) }
    }
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${CF_AI_MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT),
      }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { zh: text, configured: true, via: 'rest', status: res.status, error: body.slice(0, 200) }
    }
    const json: { result?: { translated_text?: string } } = await res.json()
    const translated: string = json?.result?.translated_text ?? ''
    if (!translated || translated.trim() === text.trim()) {
      return { zh: text, configured: true, via: 'rest', status: res.status, error: 'empty or identical result' }
    }
    return { zh: translated, configured: true, via: 'rest', status: res.status }
  } catch (e) {
    return { zh: text, configured: true, via: 'rest', error: String(e) }
  }
}

async function translateViaWorkersAI(text: string): Promise<string> {
  return (await translateViaWorkersAIDetailed(text)).zh
}

async function translateViaMyMemory(text: string): Promise<string> {
  try {
    const qs = new URLSearchParams({ q: text, langpair: 'en|zh-CN' })
    if (TRANSLATE_EMAIL) qs.set('de', TRANSLATE_EMAIL)
    const res = await fetch(`https://api.mymemory.translated.net/get?${qs}`, {
      signal: AbortSignal.timeout(TRANSLATE_TIMEOUT),
    })
    if (!res.ok) return text
    const json: { responseStatus?: number; responseData?: { translatedText?: string } } = await res.json()
    if (json?.responseStatus && Number(json.responseStatus) !== 200) return text
    const translated: string = json?.responseData?.translatedText ?? ''
    if (!translated || translated.trim() === text.trim()) return text
    if (/MYMEMORY WARNING|INVALID|USED ALL|NEXT AVAILABLE/i.test(translated)) return text
    return translated
  } catch {
    return text
  }
}

const translationMemo = new Map<string, { zh: string; exp: number }>()
const MEMO_TTL = 24 * 60 * 60_000

async function translateOne(text: string): Promise<string> {
  const memo = translationMemo.get(text)
  if (memo && Date.now() < memo.exp) return memo.zh

  let zh = await translateViaWorkersAI(text)
  if (zh === text) zh = await translateViaMyMemory(text)
  if (zh !== text) {
    if (translationMemo.size > 500) translationMemo.clear()
    translationMemo.set(text, { zh, exp: Date.now() + MEMO_TTL })
  }
  return zh
}

export async function translateProbe(sample: string): Promise<Record<string, unknown>> {
  const { id, token, source } = await cfCreds()
  const aiBindingPresent = !!(await aiBinding())
  const wai = await translateViaWorkersAIDetailed(sample)
  const viaCf = wai.zh
  const viaMyMemory = viaCf !== sample ? '(skipped — Workers AI succeeded)' : await translateViaMyMemory(sample)
  const result = viaCf !== sample ? viaCf : viaMyMemory
  return {
    cfConfigured: wai.configured,
    aiBindingPresent,
    cfCredSource: source || 'none',
    cfAccountIdLen: id.length,
    cfTokenLen: token.length,
    sample,
    workersAI: viaCf !== sample ? viaCf : '(no result)',
    workersAIVia: wai.via ?? null,
    workersAIStatus: wai.status ?? null,
    workersAIError: wai.error ?? null,
    workersAIBlocked: wai.blocked ?? false,
    myMemory: viaMyMemory,
    provider: viaCf !== sample ? 'workers-ai' : result !== sample ? 'mymemory' : 'none (english fallback)',
    result,
    budget: budgetSnapshot(),
  }
}

export { budgetSnapshot }

async function translateAll(titles: string[]): Promise<string[]> {
  const results = await Promise.allSettled(titles.map(translateOne))
  return results.map((r, i) => (r.status === 'fulfilled' ? r.value : titles[i]))
}

export async function fetchGeopoliticalEvents(): Promise<MacroEvent[]> {
  const today = new Date().toISOString().slice(0, 10)

  // Fetch all feeds in parallel; a failing feed silently contributes 0 items.
  const feedResults = await Promise.all(
    FEEDS.map(async (feed) => {
      const items = await fetchOneFeed(feed)
      return { feed, items }
    })
  )

  // Per-feed: drop very short titles, cap to maxItems, tag with asset hints.
  const tagged: TaggedItem[] = []
  for (const { feed, items } of feedResults) {
    const capped = items.filter((a) => a.title.length > 10).slice(0, feed.maxItems)
    for (const item of capped) tagged.push({ ...item, assetHints: feed.assetHints })
  }

  // Global dedup across all feeds, then cap total candidates.
  const candidates = dedup(tagged).slice(0, 15)

  const translated = await translateAll(candidates.map((a) => a.title))

  return candidates
    .map((a, idx): MacroEvent => {
      const rawTitle = a.title
      const zhTitle = translated[idx] ?? rawTitle
      const displayTitle = zhTitle.length > 72 ? zhTitle.slice(0, 69) + '…' : zhTitle
      const impact = inferImpact(rawTitle)
      const assets = inferAssets(rawTitle, a.assetHints)
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

export async function newsProbe(): Promise<Record<string, unknown>> {
  // Per-feed status for the ?debug=1 endpoint
  const feedStatuses = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const items = await fetchOneFeed(feed)
        return {
          name: feed.name,
          url: feed.url,
          ok: items.length > 0,
          itemCount: items.length,
          sample: items[0]?.title ?? null,
        }
      } catch (e) {
        return { name: feed.name, url: feed.url, ok: false, itemCount: 0, error: String(e) }
      }
    })
  )

  // Use first available title for translation probe
  const firstTitle = feedStatuses.find((f) => f.sample)?.sample ?? 'Oil prices rise on supply concerns'
  const translation = await translateProbe(firstTitle)

  const events = await fetchGeopoliticalEvents()
  return {
    feeds: feedStatuses,
    totalEvents: events.length,
    translation,
    sample: events.slice(0, 3).map((e) => ({ date: e.date, title: e.title, assets: e.assets })),
  }
}
