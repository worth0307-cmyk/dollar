export interface MacroEvent {
  date: string        // YYYY-MM-DD
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  assets: string[]    // keys: dxy | btc | brent | gold | sp500
  type: 'past' | 'upcoming'
}

// ─── Past Events ──────────────────────────────────────────────────────────────
// Real confirmed events through training knowledge (up to mid-2025).
// Outcomes for 2025-2026 are market-consensus estimates.
export const PAST_EVENTS: MacroEvent[] = [
  {
    date: '2024-09-18',
    title: 'Fed 首次降息 50bp',
    description: '自2020年以来首次降息，幅度超预期50bp，降至4.75-5.0%。黄金创历史新高，美元走弱，比特币同步上涨。',
    impact: 'high',
    assets: ['dxy', 'gold', 'sp500', 'btc'],
    type: 'past',
  },
  {
    date: '2024-11-07',
    title: 'Fed 降息 25bp（美国大选后）',
    description: '特朗普赢得大选后首次FOMC会议，降息25bp至4.5-4.75%。美元因"特朗普交易"强势，金价短暂承压。',
    impact: 'high',
    assets: ['dxy', 'gold', 'sp500', 'btc'],
    type: 'past',
  },
  {
    date: '2024-12-18',
    title: 'Fed 降息 25bp，点阵图超鹰',
    description: '降息至4.25-4.5%，但2025年降息预期从4次压缩至2次，市场大幅下跌。DXY创2022年来高点。',
    impact: 'high',
    assets: ['dxy', 'gold', 'sp500', 'btc'],
    type: 'past',
  },
  {
    date: '2025-01-29',
    title: 'Fed 暂停降息',
    description: '通胀数据反复，Fed按兵不动。鲍威尔表示"不急于调整政策"，市场对2025年降息次数分歧加大。',
    impact: 'high',
    assets: ['dxy', 'sp500'],
    type: 'past',
  },
  {
    date: '2025-03-19',
    title: 'FOMC 会议 — 维持不变',
    description: '经济展望调降，点阵图仍显示2次降息预期。关税政策不确定性使得Fed措辞更加谨慎。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold'],
    type: 'past',
  },
  {
    date: '2025-04-02',
    title: '美国"对等关税"宣布',
    description: '特朗普宣布大规模对等关税，市场剧烈波动。原油因衰退预期暴跌，黄金一度创历史新高，美股单日跌幅为2020年来最大。',
    impact: 'high',
    assets: ['dxy', 'brent', 'gold', 'sp500', 'btc'],
    type: 'past',
  },
  {
    date: '2025-05-07',
    title: 'FOMC 会议 — 维持不变',
    description: '关税不确定性下Fed继续观望。声明措辞强调"双重风险"（衰退 + 通胀）。',
    impact: 'high',
    assets: ['dxy', 'sp500'],
    type: 'past',
  },
  {
    date: '2025-06-18',
    title: 'FOMC 会议 — 维持不变',
    description: '通胀略有回落但就业市场仍具韧性，Fed维持4.25-4.5%。市场预期年内降息窗口推迟至9月。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold'],
    type: 'past',
  },
  {
    date: '2026-01-28',
    title: 'FOMC 利率决议 — 维持不变',
    description: '2026年首次议息会议。Fed维持利率不变，强调将依赖数据决策，市场关注全年降息路径指引。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'btc'],
    type: 'past',
  },
  {
    date: '2026-02-11',
    title: '美国 CPI 数据（1月）',
    description: '年初通胀数据。核心CPI走势决定市场对上半年降息的押注，美元与黄金反应明显。',
    impact: 'medium',
    assets: ['dxy', 'gold', 'sp500'],
    type: 'past',
  },
  {
    date: '2026-03-18',
    title: 'FOMC 利率决议 + 点阵图',
    description: '附带季度经济预测（SEP）。点阵图显示的2026年降息次数指引引发跨资产波动。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'brent', 'btc'],
    type: 'past',
  },
  {
    date: '2026-04-29',
    title: 'FOMC 利率决议 — 维持不变',
    description: '关税与通胀的不确定性使Fed继续观望。鲍威尔发布会措辞偏中性，风险资产震荡。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'btc'],
    type: 'past',
  },
  {
    date: '2026-05-13',
    title: '美国 CPI 数据（4月）',
    description: '4月通胀数据。市场据此重新定价6月与7月FOMC的降息概率。',
    impact: 'medium',
    assets: ['dxy', 'gold', 'sp500'],
    type: 'past',
  },
  {
    date: '2026-06-17',
    title: 'FOMC 利率决议 + 点阵图',
    description: '年中议息会议，同步更新经济预测。是上半年最重要的政策节点，跨资产普遍出现异动。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'brent', 'btc'],
    type: 'past',
  },
]

// ─── Upcoming Events ──────────────────────────────────────────────────────────
// Scheduled dates based on Fed calendar and historical patterns.
// Outcomes are consensus market estimates — update as events occur.
export const UPCOMING_EVENTS: MacroEvent[] = [
  {
    date: '2026-07-14',
    title: '美国 CPI 数据（6月）',
    description: '6月通胀数据。是否持续回落决定7月FOMC的态度。目前市场预期年化核心CPI约2.7%。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold'],
    type: 'upcoming',
  },
  {
    date: '2026-07-30',
    title: 'FOMC 利率决议',
    description: '7月会议。市场目前预计按兵不动，关键看CPI和就业数据是否支持重启降息。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'brent'],
    type: 'upcoming',
  },
  {
    date: '2026-08-13',
    title: '美国 CPI 数据（7月）',
    description: '7月通胀数据。Jackson Hole 前最后一个重要宏观数据，对鲍威尔讲话基调影响大。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold'],
    type: 'upcoming',
  },
  {
    date: '2026-08-21',
    title: 'Jackson Hole 全球央行年会',
    description: '美联储主席鲍威尔在怀俄明州的讲话通常为下半年政策定基调。历史上多次出现市场异动。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'btc'],
    type: 'upcoming',
  },
  {
    date: '2026-09-11',
    title: '美国 CPI 数据（8月）',
    description: '9月FOMC前最后一个通胀数据，直接影响是否降息25bp的概率定价。',
    impact: 'medium',
    assets: ['dxy', 'sp500', 'gold'],
    type: 'upcoming',
  },
  {
    date: '2026-09-17',
    title: 'FOMC 利率决议',
    description: '"活跃会议"：降息还是继续暂停取决于夏季数据。市场目前隐含约50%降息概率。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'brent', 'btc'],
    type: 'upcoming',
  },
  {
    date: '2026-10-29',
    title: 'FOMC 利率决议',
    description: '10月会议。历史上美联储在选举年前后决策更保守，市场波动性通常在此前后上升。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold'],
    type: 'upcoming',
  },
  {
    date: '2026-12-10',
    title: 'FOMC 利率决议 + SEP 经济预测',
    description: '年末会议，同步发布季度经济预测（点阵图）。将定调2027年降息路径，是全年最重要的FOMC之一。',
    impact: 'high',
    assets: ['dxy', 'sp500', 'gold', 'brent', 'btc'],
    type: 'upcoming',
  },
]
