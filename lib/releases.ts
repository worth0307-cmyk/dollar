import type { MacroEvent } from './events'

// ───────────────────────────────────────────────────────────────────────────
// 经济数据"发布结果表"
//
// 用法：在下方 RELEASES 里录入一条已公布的数据（实际值 actual、市场预期
// forecast、前值 previous），程序会自动：
//   1. 比较 actual 与 forecast
//   2. 按该指标的"利好方向"(bullishWhen) 判定 利好(beat,绿↑) / 利空(miss,红↓)
//   3. 渲染圆点颜色、徽章、自动展开对应的市场分析，并在描述里拼出实际/预期/前值
//
// 你只需要填客观数字，不用自己判断 beat/miss。
// ───────────────────────────────────────────────────────────────────────────

type IndicatorConfig = {
  title: string
  description: string
  assets: string[]
  url: string
  unit: string
  // 哪个方向对风险资产是"利好"：'lower' = 实际值低于预期即利好(如CPI/失业率)，
  //                              'higher' = 实际值高于预期即利好(如GDP/非农/零售)
  bullishWhen: 'higher' | 'lower'
  beat: string // 利好场景文字（数据落在 bullishWhen 一侧时显示）
  miss: string // 利空场景文字
}

const INDICATORS = {
  cpi: {
    title: 'CPI 通胀数据',
    description: '美国消费者价格指数，衡量通胀水平，直接影响Fed货币政策预期。',
    assets: ['dxy', 'gold', 'sp500'],
    url: 'https://www.bls.gov/cpi/',
    unit: '%',
    bullishWhen: 'lower',
    beat: 'CPI低于预期（通胀降温）→ DXY↓，黄金+美股走强，降息预期升温',
    miss: 'CPI高于预期（通胀顽固）→ DXY↑，金价承压，美股回落，降息预期推迟',
  },
  pce: {
    title: 'PCE 通胀数据',
    description: '美联储首选通胀指标，对Fed政策预期的影响权重高于CPI。',
    assets: ['dxy', 'gold', 'sp500'],
    url: 'https://www.bea.gov/data/personal-consumption-expenditures-price-index',
    unit: '%',
    bullishWhen: 'lower',
    beat: 'PCE低于预期 → DXY↓，黄金+美股走强，降息概率上升',
    miss: 'PCE高于预期 → DXY↑，黄金承压，美股回落，鹰派预期升温',
  },
  ppi: {
    title: 'PPI 生产者价格指数',
    description: '生产者价格指数是CPI的先行指标，反映供应链通胀压力。',
    assets: ['dxy', 'sp500'],
    url: 'https://www.bls.gov/ppi/',
    unit: '%',
    bullishWhen: 'lower',
    beat: 'PPI低于预期 → 通胀压力减弱，DXY↓，降息预期温和升温',
    miss: 'PPI高于预期 → 通胀上游压力上升，DXY↑，美股短期承压',
  },
  unemployment: {
    title: '失业率数据',
    description: '美国失业率，与非农一同构成Fed双重使命核心指标。',
    assets: ['dxy', 'sp500'],
    url: 'https://www.bls.gov/news.release/empsit.htm',
    unit: '%',
    bullishWhen: 'lower',
    beat: '失业率低于预期（就业强劲）→ 经济韧性确认，美股偏强',
    miss: '失业率高于预期（就业走弱）→ 避险升温，但降息预期同步上行',
  },
  nfp: {
    title: '非农就业数据',
    description: '美国非农就业报告，反映劳动市场健康程度，是Fed核心指标之一。',
    assets: ['dxy', 'sp500', 'gold'],
    url: 'https://www.bls.gov/news.release/empsit.htm',
    unit: 'K',
    bullishWhen: 'higher',
    beat: '非农超预期（劳动市场强劲）→ 经济韧性确认，DXY↑，美股偏强',
    miss: '非农不及预期（劳动市场走弱）→ DXY↓，降息预期升温，黄金避险走强',
  },
  gdp: {
    title: 'GDP 经济增长数据',
    description: '美国国内生产总值增速，衡量整体经济活动，影响衰退/软着陆判断。',
    assets: ['dxy', 'sp500', 'brent'],
    url: 'https://www.bea.gov/data/gdp/gross-domestic-product',
    unit: '%',
    bullishWhen: 'higher',
    beat: 'GDP超预期（经济韧性强）→ DXY↑，美股+布伦特走强，衰退担忧缓解',
    miss: 'GDP不及预期（经济走弱）→ 布伦特+美股承压，黄金避险走强',
  },
  retail: {
    title: '零售销售数据',
    description: '美国零售额月度变动，反映消费需求强弱，是GDP先行指标。',
    assets: ['dxy', 'sp500'],
    url: 'https://www.census.gov/retail/',
    unit: '%',
    bullishWhen: 'higher',
    beat: '零售超预期（内需强劲）→ 经济韧性确认，美股短期走强',
    miss: '零售不及预期（内需走弱）→ 经济走弱信号，美股承压',
  },
} satisfies Record<string, IndicatorConfig>

export interface Release {
  date: string // YYYY-MM-DD
  indicator: keyof typeof INDICATORS
  actual: number
  forecast: number
  previous?: number
  impact?: 'high' | 'medium' | 'low'
  title?: string // 可选：覆盖默认标题，如"美国 CPI 数据（1月）"
}

// 实际值与预期值差距小于该阈值时视为"符合预期"（灰点，不标利好/利空）
const EPSILON = 0.05

export function releaseToEvent(r: Release): MacroEvent {
  const cfg = INDICATORS[r.indicator]
  const diff = r.actual - r.forecast

  let outcome: 'beat' | 'miss' | undefined
  if (Math.abs(diff) >= EPSILON) {
    const actualHigher = diff > 0
    const isBullish = cfg.bullishWhen === 'higher' ? actualHigher : !actualHigher
    outcome = isBullish ? 'beat' : 'miss'
  }

  const u = cfg.unit
  const parts = [`市场预期 ${r.forecast}${u}`]
  if (r.previous != null) parts.push(`前值 ${r.previous}${u}`)
  const description = `${cfg.description} 实际值 ${r.actual}${u}（${parts.join('，')}）。`

  return {
    date: r.date,
    title: r.title ?? cfg.title,
    description,
    impact: r.impact ?? 'high',
    assets: cfg.assets,
    type: 'past',
    url: cfg.url,
    beat: cfg.beat,
    miss: cfg.miss,
    outcome,
  }
}

// ─── 已公布数据（在此录入真实公布值；下方为示例，请按官方数据核对/替换）──────────
export const RELEASES: Release[] = [
  // 示例：1月CPI同比2.4% < 预期2.6% → 通胀降温 → 利好(绿↑)
  { date: '2026-02-11', indicator: 'cpi', actual: 2.4, forecast: 2.6, previous: 2.7, impact: 'medium', title: '美国 CPI 数据（1月）' },
  // 示例：4月CPI同比2.9% > 预期2.7% → 通胀顽固 → 利空(红↓)
  { date: '2026-05-13', indicator: 'cpi', actual: 2.9, forecast: 2.7, previous: 2.6, impact: 'medium', title: '美国 CPI 数据（4月）' },
]

export const RELEASE_EVENTS: MacroEvent[] = RELEASES.map(releaseToEvent)
