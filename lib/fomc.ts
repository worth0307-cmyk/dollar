import type { MacroEvent } from './events'

// ───────────────────────────────────────────────────────────────────────────
// FOMC 会议日程（自动维护）
//
// 数据来源：美联储官方公布的 FOMC 会议日历
//   https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//
// 这里只维护一份"决议日"(每次会议第二天/公布当天) 列表，程序据此自动生成
// "即将发生"中的 FOMC 条目，并随日期推移自动从日程中移除——无需逐场手工录入。
// 标记 sep:true 的会议同时发布季度经济预测（点阵图 / Summary of Economic
// Projections），市场关注度更高。
//
// 维护方式：每年美联储提前一年公布次年日程，届时把新一年的 8 场会议日期追加到
// 下方数组即可（约每年一次）。
// ───────────────────────────────────────────────────────────────────────────

interface FomcDate {
  date: string // YYYY-MM-DD，决议公布当天
  sep?: boolean // 是否同时发布点阵图/经济预测
}

const FOMC_DATES: FomcDate[] = [
  // 2026（美联储官方日程）
  { date: '2026-01-28' },
  { date: '2026-03-18', sep: true },
  { date: '2026-04-29' },
  { date: '2026-06-17', sep: true },
  { date: '2026-07-30' },
  { date: '2026-09-17', sep: true },
  { date: '2026-10-29' },
  { date: '2026-12-10', sep: true },
  // 2027（美联储提前公布的暂定日程）
  { date: '2027-01-27' },
  { date: '2027-03-17', sep: true },
  { date: '2027-04-28' },
  { date: '2027-06-16', sep: true },
  { date: '2027-07-28' },
  { date: '2027-09-22', sep: true },
  { date: '2027-10-27' },
  { date: '2027-12-08', sep: true },
]

const FOMC_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'

function fomcEvent(d: FomcDate): MacroEvent {
  return {
    date: d.date,
    title: d.sep ? 'FOMC 利率决议 + SEP 经济预测' : 'FOMC 利率决议',
    description: d.sep
      ? '美联储议息会议，同步发布季度经济预测（点阵图）。点阵图对后续降息路径的指引是跨资产关注焦点。'
      : '美联储公开市场委员会利率决策，直接影响美元走势及全球风险偏好。',
    impact: 'high',
    assets: d.sep ? ['dxy', 'sp500', 'gold', 'brent', 'btc'] : ['dxy', 'sp500', 'gold'],
    type: 'upcoming',
    url: FOMC_URL,
    beat: '鸽派惊喜/降息落地 → DXY↓，黄金+美股+BTC齐升，风险偏好回暖',
    miss: '鹰派/维持不变 → DXY↑，金价承压，美股震荡，降息预期延后',
  }
}

// 未来的 FOMC 会议（今天及以后），随日期自动滚动。决议日当天全天保留在
// "即将发生"，次日起由 expiredFomcEvents() 转入历史列表。
export function upcomingFomcEvents(): MacroEvent[] {
  const today = new Date().toISOString().slice(0, 10)
  return FOMC_DATES.filter((d) => d.date >= today).map(fomcEvent)
}

// 已过去的 FOMC 会议 — 兜底归档进历史事件，保证决议日之后条目不会凭空消失。
// （经济日历 feed 的 buildReleaseFromFeed 不覆盖 FOMC，没有这条兜底路径的话，
// 自动生成的 FOMC 条目在决议日翌日会从两个列表同时消失。）
export function expiredFomcEvents(): MacroEvent[] {
  const today = new Date().toISOString().slice(0, 10)
  return FOMC_DATES.filter((d) => d.date < today).map((d) => ({
    ...fomcEvent(d),
    type: 'past' as const,
  }))
}
