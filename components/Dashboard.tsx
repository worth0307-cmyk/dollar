'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import MultiAssetChart from './MultiAssetChart'
import PriceCard from './PriceCard'
import CorrelationMatrix from './CorrelationMatrix'
import NotableMoves from './NotableMoves'
import MacroEvents, { type AiUsage } from './MacroEvents'
import type { MacroEvent } from '@/lib/events'

const RANGES = [
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface MarketAsset {
  key: string
  symbol: string
  name: string
  price: number | null
  change: number | null
  changePercent: number | null
  error?: boolean
}

// Risk-On / Risk-Off: stocks & crypto up + dollar down = risk appetite
function riskSentiment(market: MarketAsset[] | undefined) {
  if (!Array.isArray(market)) return null
  const chg = (k: string) => market.find((a) => a.key === k)?.changePercent ?? null
  const sp = chg('sp500'), btc = chg('btc'), dxy = chg('dxy')
  if (sp == null && btc == null) return null
  let score = 0
  if (sp != null)  score += sp  >= 0 ? 1 : -1
  if (btc != null) score += btc >= 0 ? 1 : -1
  if (dxy != null) score += dxy < 0 ? 1 : -1
  if (score >= 2)  return { label: 'Risk-On',  color: '#34D399', bg: 'rgba(52,211,153,0.12)' }
  if (score <= -2) return { label: 'Risk-Off', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' }
  return            { label: 'Mixed',    color: '#94A3B8', bg: 'rgba(148,163,184,0.10)' }
}

// Live clock — isolated into its own component so its 1-second tick re-renders
// only itself, not the entire dashboard subtree (which would otherwise rebuild
// every child, chart and event list every second).
function Clock() {
  const [now, setNow] = useState('')
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  // suppressHydrationWarning: server renders '' while the client fills in the
  // real time in useEffect; the mismatch is intentional.
  return (
    <div suppressHydrationWarning className="font-mono text-lg sm:text-xl text-gray-200 tracking-widest">
      {now}
    </div>
  )
}

export default function Dashboard() {
  const [range, setRange]           = useState('3mo')
  const [anchor, setAnchor]         = useState<'period' | 'ytd'>('ytd')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)
  const [selectedMove, setSelectedMove] = useState<{ key: string; time: number } | null>(null)

  const { data: market, isLoading: marketLoading } = useSWR<MarketAsset[]>(
    '/api/market',
    fetcher,
    { refreshInterval: 30_000, onSuccess: () => setLastUpdated(new Date()) }
  )

  const { data: history, isLoading: historyLoading, error: historyError } = useSWR(
    `/api/history?range=${range}&anchor=${anchor}`,
    fetcher,
    { refreshInterval: 60_000 }
  )

  const { data: eventsData } = useSWR<{ past: MacroEvent[]; upcoming: MacroEvent[] }>(
    '/api/events',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 0 }
  )

  // Geopolitical news is fetched separately so a slow feed never blocks events.
  const { data: newsData } = useSWR<{ news: MacroEvent[]; aiUsage?: AiUsage }>(
    '/api/news',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60_000 }
  )

  const series      = history?.series      ?? []
  const correlation = history?.correlation ?? { keys: [], matrix: [] }
  const moves       = history?.moves       ?? []
  const stats       = history?.stats       ?? {}
  // Merge news into the history list (dedup unnecessary — disjoint sources).
  // Memoized so the merge+sort doesn't mint new array identities every render
  // and churn the children that receive them.
  const pastEvents = useMemo(
    () =>
      [...(eventsData?.past ?? []), ...(newsData?.news ?? [])].sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
    [eventsData?.past, newsData?.news]
  )
  const allEvents = useMemo(
    () => [...pastEvents, ...(eventsData?.upcoming ?? [])],
    [pastEvents, eventsData?.upcoming]
  )

  const toggleAsset = useCallback(
    (key: string) => setSelectedAsset((prev) => (prev === key ? null : key)),
    []
  )

  const toggleMove = useCallback(
    (m: { key: string; time: number }) =>
      setSelectedMove((prev) =>
        prev?.key === m.key && prev?.time === m.time ? null : m
      ),
    []
  )

  const risk = riskSentiment(market)
  const avgChange =
    Array.isArray(market) && market.length > 0
      ? market.reduce((s, a) => s + (a.changePercent ?? 0), 0) / market.length
      : null

  return (
    <div className="min-h-screen text-gray-100 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">MARKET</span>
            <span className="text-gray-200 ml-2 font-light">DASHBOARD</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-mono tracking-widest">
            DXY · BTC · BRENT · GOLD · S&amp;P500
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
          {/* Live dot */}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
            <span className="text-gray-500 font-mono">LIVE</span>
          </div>

          {/* Risk sentiment — hidden on small screens to prevent overflow */}
          {risk && (
            <div
              className="hidden sm:block px-3 py-1.5 rounded-lg border text-center"
              style={{
                backgroundColor: risk.bg,
                borderColor: `${risk.color}30`,
                boxShadow: `0 0 12px ${risk.color}20`,
              }}
            >
              <div className="text-[9px] uppercase tracking-widest text-gray-400">Sentiment</div>
              <div className="text-sm font-bold mt-0.5" style={{ color: risk.color }}>
                {risk.label}
              </div>
            </div>
          )}

          {/* Risk pill for mobile — compact version */}
          {risk && (
            <div
              className="flex sm:hidden items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium"
              style={{ color: risk.color, borderColor: `${risk.color}30`, backgroundColor: risk.bg }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: risk.color }} />
              {risk.label}
            </div>
          )}

          {/* Clock — suppressHydrationWarning because server renders '' while client
              sets the real time in useEffect; the mismatch is intentional. */}
          <div className="text-right">
            <Clock />
            {lastUpdated && (
              <div className="text-[10px] text-gray-500 font-mono">
                updated {lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Price Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        {marketLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-gray-900/60 border border-gray-800 h-28 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))
          : market?.map((asset, i) => (
              <div key={asset.key} className="animate-fade-up h-full" style={{ animationDelay: `${i * 60}ms` }}>
                <PriceCard
                  asset={asset}
                  selected={selectedAsset === asset.key}
                  onSelect={() => toggleAsset(asset.key)}
                  periodChg={stats[asset.key]?.changePct ?? null}
                  anchorLabel={anchor === 'ytd' ? 'YTD' : '区间'}
                />
              </div>
            ))}
      </div>

      {/* ── Chart + Correlation (equal height, stretch) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
        {/* Chart (2/3 width) */}
        <div className="lg:col-span-2 rounded-xl bg-gray-900/70 border border-gray-700/50 p-4 backdrop-blur-sm flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-100">Performance</h2>
              <p className="text-[10px] text-gray-500 hidden sm:block">
                归一化涨跌幅 · 点击图例隐藏/显示 · 圆点 = 异常波动日
                {selectedAsset && <span className="text-blue-400 ml-2">· 已锁定高亮</span>}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  aria-label={`${r.label} 时间区间`}
                  className={`px-2 sm:px-3 py-1.5 text-xs rounded-md font-medium transition-all min-h-[32px] ${
                    range === r.value
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-[0_0_8px_rgba(96,165,250,0.3)]'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <MultiAssetChart
              data={series}
              range={range}
              loading={historyLoading}
              stats={stats}
              moves={moves}
              market={market}
              events={pastEvents}
              anchor={anchor}
              onAnchorChange={setAnchor}
              selectedKey={selectedAsset}
              onSelectKey={toggleAsset}
              selectedMove={selectedMove}
            />
          </div>

          <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500 font-mono">
            {avgChange != null && (
              <span>
                Avg 24h{' '}
                <span style={{ color: avgChange >= 0 ? '#34D399' : '#EF4444' }}>
                  {avgChange >= 0 ? '+' : ''}
                  {avgChange.toFixed(2)}%
                </span>
              </span>
            )}
            <span className="ml-auto">行情数据 · ~15min 延迟</span>
          </div>
        </div>

        {/* Correlation (1/3 width) */}
        <div className="rounded-xl bg-gray-900/70 border border-gray-700/50 p-4 backdrop-blur-sm flex flex-col">
          <h2 className="text-sm font-semibold text-gray-100 mb-0.5">Correlation</h2>
          <p className="text-[10px] text-gray-500 mb-4">周期内资产联动关系</p>
          {historyError ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              数据加载失败，自动重试中…
            </div>
          ) : historyLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm live-dot">
              Computing…
            </div>
          ) : (
            <CorrelationMatrix
              keys={correlation.keys}
              matrix={correlation.matrix}
              selectedKey={selectedAsset}
              onSelectKey={toggleAsset}
            />
          )}
        </div>
      </div>

      {/* ── Notable Moves + Macro Events (side by side, 2:3 split) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4 items-stretch">
        <div className="lg:col-span-2 h-[300px] sm:h-[380px] lg:h-[440px] rounded-xl bg-gray-900/70 border border-gray-700/50 p-4 backdrop-blur-sm flex flex-col">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-100">Notable Moves</h2>
            <span className="text-[10px] text-gray-500">单日 &gt; 2σ 异动</span>
          </div>
          {historyLoading ? (
            <div className="h-16 flex items-center justify-center text-gray-500 text-sm live-dot">
              Analyzing…
            </div>
          ) : (
            <NotableMoves
              moves={moves}
              events={allEvents}
              selectedMove={selectedMove}
              onSelectMove={toggleMove}
            />
          )}
        </div>

        <div className="lg:col-span-3 h-[460px] sm:h-[500px] lg:h-[440px] rounded-xl bg-gray-900/70 border border-gray-700/50 p-4 backdrop-blur-sm flex flex-col">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-100">Macro Events</h2>
            <span className="text-[10px] text-gray-500">重大宏观事件与日程</span>
          </div>
          <MacroEvents
            past={pastEvents}
            upcoming={eventsData?.upcoming ?? []}
            aiUsage={newsData?.aiUsage}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center text-[10px] text-gray-500 font-mono tracking-wide pb-2">
        价格每 30s 刷新 · 历史每 60s 刷新 · 行情数据 ≈ 15min 延迟
      </div>
    </div>
  )
}
