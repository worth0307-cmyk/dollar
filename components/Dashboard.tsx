'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import MultiAssetChart from './MultiAssetChart'
import PriceCard from './PriceCard'
import CorrelationMatrix from './CorrelationMatrix'
import NotableMoves from './NotableMoves'

const RANGES = [
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
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

// Risk appetite read: stocks + crypto up and the dollar down = risk-on.
function riskSentiment(market: MarketAsset[] | undefined) {
  if (!Array.isArray(market)) return null
  const chg = (k: string) => market.find((a) => a.key === k)?.changePercent ?? null
  const sp = chg('sp500')
  const btc = chg('btc')
  const dxy = chg('dxy')
  if (sp == null && btc == null) return null
  let score = 0
  if (sp != null) score += sp >= 0 ? 1 : -1
  if (btc != null) score += btc >= 0 ? 1 : -1
  if (dxy != null) score += dxy < 0 ? 1 : -1
  if (score >= 2) return { label: 'Risk-On', color: '#34D399' }
  if (score <= -2) return { label: 'Risk-Off', color: '#EF4444' }
  return { label: 'Mixed', color: '#9CA3AF' }
}

export default function Dashboard() {
  const [range, setRange] = useState('1mo')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const { data: market, isLoading: marketLoading } = useSWR<MarketAsset[]>(
    '/api/market',
    fetcher,
    { refreshInterval: 30_000, onSuccess: () => setLastUpdated(new Date()) }
  )

  const { data: history, isLoading: historyLoading } = useSWR(
    `/api/history?range=${range}`,
    fetcher,
    { refreshInterval: 60_000 }
  )

  const series = history?.series ?? []
  const correlation = history?.correlation ?? { keys: [], matrix: [] }
  const moves = history?.moves ?? []
  const stats = history?.stats ?? {}

  const [now, setNow] = useState('')
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const risk = riskSentiment(market)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">Market</span> Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            DXY · BTC · Brent · Gold · S&amp;P 500
          </p>
        </div>
        <div className="flex items-center gap-4">
          {risk && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-gray-600">
                Sentiment
              </div>
              <div className="text-sm font-semibold" style={{ color: risk.color }}>
                {risk.label}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="font-mono text-lg text-gray-300">{now}</div>
            {lastUpdated && (
              <div className="text-xs text-gray-600">
                updated {lastUpdated.toLocaleTimeString('en-US', { hour12: false })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Price Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {marketLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-gray-900 border border-gray-800 h-28 animate-pulse"
              />
            ))
          : market?.map((asset) => <PriceCard key={asset.key} asset={asset} />)}
      </div>

      {/* Main grid: chart (2/3) + correlation (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 rounded-xl bg-gray-900 border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Performance</h2>
              <p className="text-xs text-gray-500">
                Normalized to % change from period start · click legend to isolate
              </p>
            </div>
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                    range === r.value
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <MultiAssetChart
            data={series}
            range={range}
            loading={historyLoading}
            stats={stats}
            moves={moves}
          />
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Correlation</h2>
          <p className="text-xs text-gray-500 mb-4">How the assets move relative to each other</p>
          {historyLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
              Loading…
            </div>
          ) : (
            <CorrelationMatrix keys={correlation.keys} matrix={correlation.matrix} />
          )}
        </div>
      </div>

      {/* Notable moves */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-200">Notable Moves</h2>
          <span className="text-xs text-gray-500">Days an asset moved more than 2σ</span>
        </div>
        {historyLoading ? (
          <div className="h-16 flex items-center justify-center text-gray-600 text-sm">
            Loading…
          </div>
        ) : (
          <NotableMoves moves={moves} />
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-600 text-center">
        Prices refresh every 30s · history every 60s · Data: Yahoo Finance (≈15-min delayed)
      </div>
    </div>
  )
}
