// Derived analytics computed server-side from raw price history.
// Keeps the API route lean and the math in one tested place.

export type PriceMap = Map<string, number> // 'YYYY-MM-DD' -> close price

// Day-over-day simple returns, keyed by the later date.
function dailyReturns(m: PriceMap): Map<string, number> {
  const dates = [...m.keys()].sort()
  const out = new Map<string, number>()
  for (let i = 1; i < dates.length; i++) {
    const prev = m.get(dates[i - 1])!
    const cur = m.get(dates[i])!
    if (prev > 0) out.set(dates[i], (cur - prev) / prev)
  }
  return out
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length
  if (n < 3) return null
  const ma = a.reduce((s, x) => s + x, 0) / n
  const mb = b.reduce((s, x) => s + x, 0) / n
  let num = 0,
    da = 0,
    db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  const den = Math.sqrt(da * db)
  return den === 0 ? null : num / den
}

// Pairwise correlation of daily returns over the common trading days.
export function correlationMatrix(
  keys: string[],
  maps: (PriceMap | null)[]
): (number | null)[][] {
  const returns = maps.map((m) => (m ? dailyReturns(m) : null))
  return keys.map((_, i) =>
    keys.map((_, j) => {
      if (i === j) return 1
      const ri = returns[i]
      const rj = returns[j]
      if (!ri || !rj) return null
      const common = [...ri.keys()].filter((d) => rj.has(d)).sort()
      if (common.length < 3) return null
      return pearson(
        common.map((d) => ri.get(d)!),
        common.map((d) => rj.get(d)!)
      )
    })
  )
}

export interface Move {
  time: number // ms epoch
  key: string
  changePct: number
  z: number
}

// Days where a single asset moved more than `zThreshold` standard deviations.
export function notableMoves(
  keys: string[],
  maps: (PriceMap | null)[],
  topN = 20,
  zThreshold = 2
): Move[] {
  const moves: Move[] = []
  keys.forEach((key, i) => {
    const m = maps[i]
    if (!m) return
    const r = dailyReturns(m)
    const vals = [...r.values()]
    if (vals.length < 5) return
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length)
    if (sd === 0) return
    r.forEach((ret, dateStr) => {
      const z = (ret - mean) / sd
      if (Math.abs(z) >= zThreshold) {
        moves.push({ time: new Date(dateStr).getTime(), key, changePct: ret * 100, z })
      }
    })
  })
  return moves.sort((a, b) => b.time - a.time).slice(0, topN)
}

export interface AssetStat {
  changePct: number | null // cumulative % over the period
  high: number | null
  low: number | null
  vol: number | null // annualized volatility, %
}

export function periodStats(
  keys: string[],
  maps: (PriceMap | null)[]
): Record<string, AssetStat> {
  const out: Record<string, AssetStat> = {}
  keys.forEach((key, i) => {
    const m = maps[i]
    if (!m || m.size === 0) {
      out[key] = { changePct: null, high: null, low: null, vol: null }
      return
    }
    const dates = [...m.keys()].sort()
    const prices = dates.map((d) => m.get(d)!)
    const first = prices[0]
    const last = prices[prices.length - 1]
    const r = [...dailyReturns(m).values()]
    const mean = r.length ? r.reduce((s, x) => s + x, 0) / r.length : 0
    const sd = r.length
      ? Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / r.length)
      : 0
    out[key] = {
      changePct: first > 0 ? ((last - first) / first) * 100 : null,
      high: Math.max(...prices),
      low: Math.min(...prices),
      vol: sd * Math.sqrt(252) * 100,
    }
  })
  return out
}
