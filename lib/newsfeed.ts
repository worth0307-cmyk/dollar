// OilPrice.com RSS — free, energy/geopolitics focused, no per-IP rate limit.
// Covers crude oil, OPEC, sanctions, and supply-disruption headlines.
// We infer affected assets from the headline and classify impact level.

import type { MacroEvent } from './events'
import { canSpend, recordSpend, recordBlocked, budgetSnapshot } from './aibudget'

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

// ── Translation ────────────────────────────────────────────────────────────
// Primary: Cloudflare Workers AI (m2m100). The model runs INSIDE Cloudflare's
// network, so it is never blocked or rate-limited by the shared egress IP the
// way third-party services (MyMemory / Google) are. Needs two env vars set in
// the Cloudflare deployment:
//   CF_ACCOUNT_ID  — your Cloudflare account id
//   CF_AI_TOKEN    — an API token with the "Workers AI" permission
// Fallback: MyMemory (best-effort, free, no key) → original English title.
const CF_AI_MODEL = '@cf/meta/m2m100-1.2b'

// Read creds lazily and trimmed on every call. Lazy: under @opennextjs/cloudflare
// env bindings are only reliably present in request scope, not at module-eval
// time — reading at top level could capture `undefined` on a cold isolate.
// Trimmed: a stray newline/space pasted into the dashboard would otherwise
// corrupt the Authorization header and silently 400/401 the request.
function cfCreds(): { id: string; token: string } {
  return {
    id: (process.env.CF_ACCOUNT_ID ?? '').trim(),
    token: (process.env.CF_AI_TOKEN ?? '').trim(),
  }
}

// MyMemory raises its anonymous per-IP quota when a contact email is supplied.
const TRANSLATE_EMAIL = (process.env.MYMEMORY_EMAIL ?? 'worth0307@gmail.com').trim()

// Detailed Workers AI call — returns the translation plus diagnostics (HTTP
// status, error snippet, whether it was budget-blocked) so the ?debug endpoint
// can pinpoint why a title stayed English. `zh === text` means "no translation".
interface WaiResult {
  zh: string
  configured: boolean
  blocked?: boolean
  status?: number
  error?: string
}

async function translateViaWorkersAIDetailed(text: string): Promise<WaiResult> {
  const { id, token } = cfCreds()
  if (!id || !token) return { zh: text, configured: false, error: 'CF_ACCOUNT_ID / CF_AI_TOKEN not set' }
  // Daily budget guard: once 70% of the free neuron allowance is reached, stop
  // calling Workers AI and fall back to English — never spill into paid usage.
  if (!canSpend()) {
    recordBlocked()
    return { zh: text, configured: true, blocked: true, error: 'daily budget cap reached' }
  }
  try {
    recordSpend() // count the attempt up-front (conservative)
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${CF_AI_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, source_lang: 'english', target_lang: 'chinese' }),
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT),
      }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { zh: text, configured: true, status: res.status, error: body.slice(0, 200) }
    }
    const json: any = await res.json()
    const translated: string = json?.result?.translated_text ?? ''
    if (!translated || translated.trim() === text.trim()) {
      return { zh: text, configured: true, status: res.status, error: 'empty or identical result' }
    }
    return { zh: translated, configured: true, status: res.status }
  } catch (e) {
    return { zh: text, configured: true, error: String(e) }
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
    const json = await res.json()
    // MyMemory returns HTTP 200 even on quota/errors; the true status lives in
    // the body. responseStatus !== 200 means quota exhausted / bad langpair etc.
    if (json?.responseStatus && Number(json.responseStatus) !== 200) return text
    const translated: string = json?.responseData?.translatedText ?? ''
    if (!translated || translated.trim() === text.trim()) return text
    if (/MYMEMORY WARNING|INVALID|USED ALL|NEXT AVAILABLE/i.test(translated)) return text
    return translated
  } catch {
    return text
  }
}

// Per-isolate memo so the same headline is never translated (or budget-spent)
// twice across the 4h news-cache cycles. Only successful translations memoed.
const translationMemo = new Map<string, { zh: string; exp: number }>()
const MEMO_TTL = 24 * 60 * 60_000

async function translateOne(text: string): Promise<string> {
  const memo = translationMemo.get(text)
  if (memo && Date.now() < memo.exp) return memo.zh

  let zh = await translateViaWorkersAI(text)
  if (zh === text) {
    // Workers AI unconfigured, failed, or budget-capped → best-effort free fallback.
    zh = await translateViaMyMemory(text)
  }
  if (zh !== text) {
    if (translationMemo.size > 500) translationMemo.clear()
    translationMemo.set(text, { zh, exp: Date.now() + MEMO_TTL })
  }
  return zh
}

// Exposed for the ?debug=1 endpoint so translation can be verified live,
// bypassing the news cache. Surfaces the Workers AI HTTP status / error so a
// failing title can be diagnosed (bad token, wrong account id, model, quota…).
export async function translateProbe(sample: string): Promise<Record<string, unknown>> {
  const { id, token } = cfCreds()
  const wai = await translateViaWorkersAIDetailed(sample)
  const viaCf = wai.zh
  const viaMyMemory = viaCf !== sample ? '(skipped — Workers AI succeeded)' : await translateViaMyMemory(sample)
  const result = viaCf !== sample ? viaCf : viaMyMemory
  return {
    cfConfigured: wai.configured,
    cfAccountIdLen: id.length, // length only — never expose the value
    cfTokenLen: token.length,
    sample,
    workersAI: viaCf !== sample ? viaCf : '(no result)',
    workersAIStatus: wai.status ?? null,
    workersAIError: wai.error ?? null,
    workersAIBlocked: wai.blocked ?? false,
    myMemory: viaMyMemory,
    provider: viaCf !== sample ? 'workers-ai' : result !== sample ? 'mymemory' : 'none (english fallback)',
    result,
    budget: budgetSnapshot(),
  }
}

// Fresh budget snapshot for the /api/news response (drives the on-screen badge).
export { budgetSnapshot }

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
    const translation = await translateProbe(items[0]?.title ?? 'Oil prices rise on supply concerns')
    return {
      url: FEED_URL,
      httpStatus: status,
      bodyStart: body.slice(0, 160),
      itemCount: items.length,
      eventCount: events.length,
      translation,
      sample: events.slice(0, 3).map((e) => ({ date: e.date, title: e.title, assets: e.assets })),
    }
  } catch (e) {
    return { url: FEED_URL, fetchError: String(e) }
  }
}
