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
// blocks. Each failed feed silently contributes zero items. Coverage maps to
// the five tracked assets: Brent / DXY / BTC / Gold / S&P 500.
const FEEDS: FeedConfig[] = [
  {
    // Energy + geopolitics → Brent. Custom CMS, no datacenter-IP block (verified).
    url: 'https://oilprice.com/rss/main',
    name: 'OilPrice.com',
    assetHints: ['brent'],
    maxItems: 30,
  },
  {
    // US Federal Reserve MONETARY-POLICY press releases only — FOMC statements,
    // rate decisions, policy-implementation notes. The press_monetary feed
    // excludes the regulatory/obituary noise that press_all carried. Government
    // site, never blocks datacenter IPs.
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    name: 'Federal Reserve',
    assetHints: ['dxy'],
    maxItems: 30,
  },
  {
    // Crypto → BTC. WordPress-class feed, no datacenter-IP block (verified).
    url: 'https://cointelegraph.com/rss',
    name: 'CoinTelegraph',
    assetHints: ['btc'],
    maxItems: 30,
  },
  {
    // Commodities news → Gold (+ oil). Same domain as the verified-working
    // stock feed below, so it fetches from the Worker and its article pages
    // open for the reader. feed id news_11 = "Commodities News".
    // (Kitco, 24hGold, Mining.com, SchiffGold all failed: either 0 items from
    // the Worker, or datacenter-IP-blocked article pages.)
    //
    // No fixed assetHint: this feed mixes gold/silver with oil/copper, so we
    // tag by headline keywords instead — gold stories → gold, oil → brent —
    // rather than forcing every item under the gold filter.
    url: 'https://www.investing.com/rss/news_11.rss',
    name: 'Investing.com 商品',
    assetHints: [],
    maxItems: 30,
  },
  {
    // Stock-market news → S&P 500. Clean equities coverage, globally reachable
    // (has a Chinese edition), confirmed feed id news_25 = "Stock Market News".
    url: 'https://www.investing.com/rss/news_25.rss',
    name: 'Investing.com 股市',
    assetHints: ['sp500'],
    maxItems: 30,
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

// Words that mark a HIGH-impact event. Short tokens carry \b guards so common
// financial vocabulary doesn't false-positive (bank→ban, warning→war,
// disclosed→closed, resurgence→surge).
const HIGH_RE =
  /\bwars?\b|attack|bomb|\bstrikes?\b|invasion|\bclose[sd]?\b|closure|shutdown|\bseize[sd]?\b|sanction|crisis|emergency|hostage|blockade|missile|\bsurge[sd]?\b|plunge|crash|\bhalt(?:s|ed)?\b|\bban(?:s|ned)?\b|\bhack(?:s|ed|ing|er)?\b|exploit|default|collapse/i

function inferAssets(title: string, hints: string[] = []): string[] {
  const found = new Set<string>(hints)
  let matched = false
  for (const { re, assets } of ASSET_SIGNALS) {
    if (re.test(title)) {
      assets.forEach((a) => found.add(a))
      matched = true
    }
  }
  // No keyword signal matched but the headline is clearly geopolitical → default
  // to the risk-sensitive pair (oil + gold). Tracking `matched` directly fixes
  // the old `found.size === hints.length` test, which misfired whenever a signal
  // only re-added an asset already present in the feed's hints.
  if (
    !matched &&
    /conflict|military|troops|forces|\bwars?\b|tension|israel|iran|russia|ukraine/i.test(title)
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
  { re: /\bwars?\b|attack|\bstrikes?\b|missile|invasion|conflict|military|troops/i, phrase: '地缘冲突' },
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
  const cp = (n: number) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '')
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => cp(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => cp(Number(n)))
    // &amp; must be decoded LAST so escaped entities like "&amp;lt;" come out
    // as the literal "&lt;" instead of being double-decoded into "<".
    .replace(/&amp;/g, '&')
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

// Generic dedup — keeps first occurrence of each (date + 3-keyword) fingerprint.
// The date is part of the key so recurring, identically-titled events (e.g. the
// monthly "Federal Reserve issues FOMC statement") survive across dates; only
// genuine same-day cross-source duplicates of one story are collapsed.
function dedup<T extends { title: string; date?: string }>(items: T[]): T[] {
  const STOPWORDS = /^(the|this|that|with|from|have|will|been|were|they|after|amid|over|into|says|said|about|could|would)$/
  const seen = new Set<string>()
  return items.filter((a) => {
    const kw = a.title
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.test(w))
      .slice(0, 3)
      .sort()
      .join('|')
    // Titles made entirely of short words can't produce a keyword fingerprint —
    // fall back to the normalized whole title instead of dropping the item.
    const fallback = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
    if (!kw && !fallback) return false
    const fp = `${a.date ?? ''}#${kw || fallback}`
    if (seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

// Round-robin merge: take item 0 from every group, then item 1, etc. This keeps
// each asset class represented even when the global cap trims the list, instead
// of letting whichever feed is listed first fill all the slots.
function roundRobin<T>(groups: T[][], cap: number): T[] {
  const out: T[] = []
  const depth = Math.max(0, ...groups.map((g) => g.length))
  for (let i = 0; i < depth && out.length < cap; i++) {
    for (const g of groups) {
      if (i < g.length) {
        out.push(g[i])
        if (out.length >= cap) break
      }
    }
  }
  return out
}

// Drop items whose pubDate is older than this — keeps the feed fresh and stops
// low-frequency feeds (Fed, Calculated Risk) from surfacing stale headlines.
const MAX_AGE_DAYS = 180
const GLOBAL_CAP = 120
// Only translate the top (newest) TRANSLATE_CAP items — older items fall back to
// their English title. Keeps cold-start translation count safely below the daily
// AI budget cap (85% × 10,000 neurons ÷ 80/call ≈ 106 translations).
const TRANSLATE_CAP = 100

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
  const inputs = { text, source_lang: 'english', target_lang: 'chinese' }

  if (ai) {
    // One recordSpend per real Workers AI invocation — the binding call and a
    // REST fallback are two spends, not one. Over-counting on failures is the
    // safe direction for a budget whose job is to stay inside the free tier.
    recordSpend()
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

  if (!canSpend()) {
    recordBlocked()
    return { zh: text, configured: true, blocked: true, error: 'daily budget cap reached' }
  }
  recordSpend()
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
    // Evict the oldest entry (Map preserves insertion order) instead of wiping
    // the whole memo, which would cause a translation re-spend burst at the cap.
    if (translationMemo.size >= 500) {
      const oldest = translationMemo.keys().next().value
      if (oldest !== undefined) translationMemo.delete(oldest)
    }
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

  const minDate = new Date(Date.now() - MAX_AGE_DAYS * 86400_000).toISOString().slice(0, 10)

  // Per-feed: drop short/stale titles, sort newest-first, cap to maxItems, tag.
  const groups: TaggedItem[][] = feedResults.map(({ feed, items }) =>
    items
      .filter((a) => a.title.length > 10 && a.date >= minDate && a.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, feed.maxItems)
      .map((item) => ({ ...item, assetHints: feed.assetHints }))
  )

  // Round-robin across feeds for balanced asset coverage, dedup near-duplicate
  // stories, then cap the total list.
  const candidates = dedup(roundRobin(groups, GLOBAL_CAP * 2)).slice(0, GLOBAL_CAP)

  const translated = await translateAll(candidates.slice(0, TRANSLATE_CAP).map((a) => a.title))

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
