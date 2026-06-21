// GDELT Project — free global news event database, no API key required.
// Doc 2.0 API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
// Returns recent English news articles matching geopolitical/commodity keywords.
// We infer affected assets from article titles and classify impact level.

import type { MacroEvent } from './events'

interface GdeltArticle {
  url: string
  title: string
  seendate: string // "YYYYMMDDTHHMMSSZ"
  domain: string
  language?: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

// Title keywords → affected assets
const ASSET_SIGNALS: Array<{ re: RegExp; assets: string[] }> = [
  {
    re: /oil|crude|brent|opec|petroleum|refin|hormuz|strait|pipeline|lng|tanker|saudi|aramco|energy supply/i,
    assets: ['brent'],
  },
  { re: /gold|safe.?haven|bullion|precious metal/i, assets: ['gold'] },
  { re: /dollar|usd|sanction|treasury|forex/i, assets: ['dxy'] },
  { re: /stock|equit|nasdaq|dow jones|s&p 500|market (crash|plunge|surge)/i, assets: ['sp500'] },
  { re: /bitcoin|crypto|btc|digital asset/i, assets: ['btc'] },
]

// Words that mark a HIGH-impact event
const HIGH_RE =
  /war|attack|bomb|strike|invasion|close[sd]?|closure|shutdown|seize[sd]?|sanction|crisis|emergency|hostage|blockade|missile/i

function inferAssets(title: string): string[] {
  const found = new Set<string>()
  for (const { re, assets } of ASSET_SIGNALS) {
    if (re.test(title)) assets.forEach((a) => found.add(a))
  }
  // Generic conflict → oil + gold
  if (found.size === 0 && /conflict|military|troops|forces|war|tension/i.test(title)) {
    found.add('brent')
    found.add('gold')
  }
  return found.size > 0 ? [...found] : ['brent', 'gold']
}

function inferImpact(title: string): 'high' | 'medium' {
  return HIGH_RE.test(title) ? 'high' : 'medium'
}

// "20260621T143500Z" → "2026-06-21"
function parseGdeltDate(s: string): string {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return new Date().toISOString().slice(0, 10)
  return `${m[1]}-${m[2]}-${m[3]}`
}

// Naïve deduplication: extract the 3 most significant words from each title;
// if another article has the same fingerprint (same day coverage), skip it.
function dedup(articles: GdeltArticle[]): GdeltArticle[] {
  const STOPWORDS = /^(the|this|that|with|from|have|will|been|were|they|after|amid|over|into|says|said)$/
  const seen = new Set<string>()
  return articles.filter((a) => {
    const words = a.title
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.test(w))
      .slice(0, 3)
      .sort()
      .join('|')
    if (seen.has(words)) return false
    seen.add(words)
    return true
  })
}

// Broad energy + geopolitical keyword set. We cast a wide net and filter
// by asset relevance after parsing, rather than trying to pre-narrow the query.
const GDELT_QUERY = [
  'Hormuz OR OPEC OR "oil sanctions" OR "oil attack" OR "oil tanker"',
  'OR "pipeline attack" OR "energy crisis" OR "gas pipeline" OR "crude oil"',
  'OR "trade war" OR "military strike" OR "economic sanctions" OR blockade',
  'OR "Strait of Malacca" OR "oil supply" OR "oil price"',
].join(' ')

export async function fetchGeopoliticalEvents(): Promise<MacroEvent[]> {
  const qs = new URLSearchParams({
    query: GDELT_QUERY,
    mode: 'artlist',
    maxrecords: '60',
    timespan: '30d',
    sort: 'datedesc',
    sourcelang: 'english',
    format: 'json',
  })

  const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${qs}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`GDELT ${res.status}`)

  const data: GdeltResponse = await res.json()
  if (!data.articles?.length) return []

  const today = new Date().toISOString().slice(0, 10)

  return dedup(data.articles)
    .filter((a) => a.language == null || a.language === 'English')
    .slice(0, 12)
    .map((a): MacroEvent => {
      const title = a.title.length > 72 ? a.title.slice(0, 69) + '…' : a.title
      return {
        date: parseGdeltDate(a.seendate),
        title,
        description: `${a.domain} 报道`,
        impact: inferImpact(a.title),
        assets: inferAssets(a.title),
        type: 'past',
        url: a.url,
        source: 'news',
      }
    })
    .filter((e) => e.date <= today)
}
