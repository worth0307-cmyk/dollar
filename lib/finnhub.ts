import type { MacroEvent } from './events'

interface FinnhubEvent {
  actual: number | null
  country: string
  estimate: number | null
  event: string
  impact: string | number
  prev: number | null
  time: string
  unit: string
}

type EventTemplate = {
  title: string
  description: string
  assets: string[]
  beat: string
  miss: string
  url: string
  // 'positive' = actual > estimate means beat; 'negative' = actual < estimate means beat
  // undefined = no numeric comparison available (e.g. Jackson Hole speech)
  beatDirection?: 'positive' | 'negative'
}

const TEMPLATES: Array<{ keywords: string[]; template: EventTemplate }> = [
  {
    keywords: ['fomc', 'federal funds rate', 'fed interest rate', 'interest rate decision', 'monetary policy statement'],
    template: {
      title: 'FOMC 利率决议',
      description: '美联储公开市场委员会利率决策，直接影响美元走势及全球风险偏好。',
      assets: ['dxy', 'sp500', 'gold', 'btc'],
      beat: '鸽派惊喜/降息落地 → DXY↓，黄金+美股+BTC齐升，风险偏好回暖',
      miss: '鹰派/维持不变 → DXY↑，金价承压，美股震荡，降息预期延后',
      url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
      beatDirection: 'negative', // lower rate than expected = dovish = beat
    },
  },
  {
    keywords: ['cpi', 'consumer price index', 'core cpi', 'inflation rate'],
    template: {
      title: 'CPI 通胀数据',
      description: '美国消费者价格指数，衡量通胀水平，直接影响Fed货币政策预期。',
      assets: ['dxy', 'gold', 'sp500'],
      beat: 'CPI高于预期（通胀顽固）→ DXY↑，金价承压，美股回落，降息预期推迟',
      miss: 'CPI低于预期（通胀降温）→ DXY↓，黄金+美股走强，降息预期升温',
      url: 'https://www.bls.gov/cpi/',
      beatDirection: 'positive',
    },
  },
  {
    keywords: ['pce', 'personal consumption expenditure', 'core pce'],
    template: {
      title: 'PCE 通胀数据',
      description: '美联储首选通胀指标，对Fed政策预期的影响权重高于CPI。',
      assets: ['dxy', 'gold', 'sp500'],
      beat: 'PCE高于预期 → DXY↑，黄金承压，美股回落，鹰派预期升温',
      miss: 'PCE低于预期 → DXY↓，黄金+美股走强，降息概率上升',
      url: 'https://www.bea.gov/data/personal-consumption-expenditures-price-index',
      beatDirection: 'positive',
    },
  },
  {
    keywords: ['nonfarm', 'non-farm', 'nfp', 'payroll'],
    template: {
      title: '非农就业数据',
      description: '美国非农就业报告，反映劳动市场健康程度，是Fed双重使命的核心指标之一。',
      assets: ['dxy', 'sp500', 'gold'],
      beat: '就业超预期（劳动市场强劲）→ DXY↑，降息预期降温，美股短期震荡',
      miss: '就业不及预期（劳动市场走弱）→ DXY↓，降息预期升温，黄金避险走强',
      url: 'https://www.bls.gov/news.release/empsit.htm',
      beatDirection: 'positive',
    },
  },
  {
    keywords: ['gdp', 'gross domestic product'],
    template: {
      title: 'GDP 经济增长数据',
      description: '美国国内生产总值增速，衡量整体经济活动，影响市场对衰退/软着陆的判断。',
      assets: ['dxy', 'sp500', 'brent'],
      beat: 'GDP超预期（经济韧性强）→ DXY↑，美股+布伦特走强，衰退担忧缓解',
      miss: 'GDP不及预期（经济走弱）→ 布伦特+美股承压，黄金避险走强',
      url: 'https://www.bea.gov/data/gdp/gross-domestic-product',
      beatDirection: 'positive',
    },
  },
  {
    keywords: ['jackson hole', 'economic symposium'],
    template: {
      title: 'Jackson Hole 全球央行年会',
      description: '美联储主席在怀俄明州的讲话通常为下半年政策定基调，历史上多次出现市场异动。',
      assets: ['dxy', 'sp500', 'gold', 'btc'],
      beat: '鲍威尔明确降息信号 → DXY大跌，黄金+美股+BTC飙升',
      miss: '措辞审慎，不给降息承诺 → DXY↑，黄金震荡，美股回调',
      url: 'https://www.kansascityfed.org/research/jackson-hole-economic-symposium/',
      // no beatDirection: speech has no numeric actual vs estimate
    },
  },
  {
    keywords: ['retail sales'],
    template: {
      title: '零售销售数据',
      description: '美国零售额月度变动，反映消费需求强弱，是GDP先行指标。',
      assets: ['dxy', 'sp500'],
      beat: '消费超预期（内需强劲）→ 经济韧性确认，DXY↑，美股短期走强',
      miss: '消费不及预期（内需走弱）→ 经济走弱信号，DXY↓，美股承压',
      url: 'https://www.census.gov/retail/',
      beatDirection: 'positive',
    },
  },
  {
    keywords: ['unemployment rate', 'jobless claims', 'initial jobless'],
    template: {
      title: '就业市场数据',
      description: '美国失业率/申请失业金人数，与非农一同构成Fed双重使命核心指标。',
      assets: ['dxy', 'sp500'],
      beat: '失业率低于预期（就业强劲）→ DXY↑，降息预期降温，美股短期震荡',
      miss: '失业率高于预期（就业走弱）→ DXY↓，降息预期升温，避险情绪升',
      url: 'https://www.bls.gov/news.release/empsit.htm',
      beatDirection: 'negative', // lower unemployment = better = beat
    },
  },
  {
    keywords: ['pmi', 'purchasing managers', 'ism manufacturing', 'ism services'],
    template: {
      title: 'PMI 采购经理人指数',
      description: '制造业/服务业PMI是经济活动先行指标，50以上代表扩张。',
      assets: ['dxy', 'sp500', 'brent'],
      beat: 'PMI超预期（经济扩张）→ DXY↑，美股+布伦特走强，需求预期改善',
      miss: 'PMI不及预期（收缩加剧）→ 衰退担忧升温，布伦特承压，黄金避险',
      url: 'https://www.ismworld.org/',
      beatDirection: 'positive',
    },
  },
  {
    keywords: ['ppi', 'producer price index'],
    template: {
      title: 'PPI 生产者价格指数',
      description: '生产者价格指数是CPI的先行指标，反映供应链通胀压力。',
      assets: ['dxy', 'sp500'],
      beat: 'PPI超预期 → 通胀上游压力上升，DXY↑，美股短期承压',
      miss: 'PPI低于预期 → 通胀压力减弱，DXY↓，市场降息预期温和升温',
      url: 'https://www.bls.gov/ppi/',
      beatDirection: 'positive',
    },
  },
]

function findTemplate(eventName: string): EventTemplate | null {
  const lower = eventName.toLowerCase()
  for (const { keywords, template } of TEMPLATES) {
    if (keywords.some((kw) => lower.includes(kw))) return template
  }
  return null
}

function mapImpact(raw: string | number): 'high' | 'medium' | 'low' {
  const v = String(raw)
  if (v === '3') return 'high'
  if (v === '2') return 'medium'
  return 'low'
}

function buildDescription(
  base: string,
  actual: number | null,
  estimate: number | null,
  prev: number | null,
  unit: string
): string {
  let desc = base
  if (actual != null) {
    desc += ` 实际值：${actual}${unit}`
    if (estimate != null) {
      const diff = actual - estimate
      const sign = diff >= 0 ? '+' : ''
      desc += `（市场预期 ${estimate}${unit}，偏差 ${sign}${diff.toFixed(2)}${unit}）`
    }
    if (prev != null) desc += `，前值 ${prev}${unit}`
    desc += '。'
  } else if (estimate != null) {
    desc += ` 市场预期 ${estimate}${unit}`
    if (prev != null) desc += `，前值 ${prev}${unit}`
    desc += '。'
  }
  return desc
}

export async function fetchFinnhubEvents(token: string): Promise<{
  past: MacroEvent[]
  upcoming: MacroEvent[]
}> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const pastFrom = new Date(today)
  pastFrom.setDate(pastFrom.getDate() - 90)

  const upcomingTo = new Date(today)
  upcomingTo.setDate(upcomingTo.getDate() + 180)

  const from = pastFrom.toISOString().slice(0, 10)
  const to = upcomingTo.toISOString().slice(0, 10)

  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}`,
    { headers: { 'X-Finnhub-Token': token } }
  )
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)

  const json = await res.json()
  const raw: FinnhubEvent[] = json.economicCalendar ?? []

  const past: MacroEvent[] = []
  const upcoming: MacroEvent[] = []
  const seen = new Set<string>()

  for (const e of raw) {
    if (e.country !== 'US') continue
    const impact = mapImpact(e.impact)
    if (impact === 'low') continue

    const template = findTemplate(e.event)
    if (!template) continue

    const date = e.time.slice(0, 10)
    const key = `${date}::${template.title}`
    if (seen.has(key)) continue
    seen.add(key)

    const isPast = date <= todayStr
    const unit = e.unit ?? ''

    // Auto-detect beat/miss for past events that have both actual and estimate
    let outcome: 'beat' | 'miss' | undefined
    if (isPast && e.actual != null && e.estimate != null && template.beatDirection) {
      const diff = e.actual - e.estimate
      const beatWhen = template.beatDirection === 'positive' ? diff > 0 : diff < 0
      // Treat negligible differences (<0.01) as neither beat nor miss
      if (Math.abs(diff) >= 0.01) outcome = beatWhen ? 'beat' : 'miss'
    }

    const event: MacroEvent = {
      date,
      title: template.title,
      description: buildDescription(
        template.description,
        isPast ? e.actual : null,
        e.estimate,
        e.prev,
        unit
      ),
      impact,
      assets: template.assets,
      type: isPast ? 'past' : 'upcoming',
      url: template.url,
      beat: template.beat,
      miss: template.miss,
      outcome,
    }

    if (isPast) past.push(event)
    else upcoming.push(event)
  }

  past.sort((a, b) => b.date.localeCompare(a.date))
  upcoming.sort((a, b) => a.date.localeCompare(b.date))

  return { past: past.slice(0, 20), upcoming: upcoming.slice(0, 10) }
}
