'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import MultiAssetChart from './MultiAssetChart'
import PriceCard from './PriceCard'

const RANGES = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '1Y', value: '1y' },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function Dashboard() {
  const [range, setRange] = useState('1mo')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const { data: market, isLoading: marketLoading } = useSWR('/api/market', fetcher, {
    refreshInterval: 30_000,
    onSuccess: () => setLastUpdated(new Date()),
  })

  const { data: history, isLoading: historyLoading } = useSWR(
    `/api/history?range=${range}`,
    fetcher,
    { refreshInterval: 60_000 }
  )

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

  // Overall market sentiment: average % change
  const avgChange =
    market && !market.error
      ? market.reduce((s: number, a: any) => s + (a.changePercent ?? 0), 0) / market.length
      : null

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6">
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
        <div className="text-right">
          <div className="font-mono text-lg text-gray-300">{now}</div>
          {lastUpdated && (
            <div className="text-xs text-gray-600">
              updated {lastUpdated.toLocaleTimeString('en-US', { hour12: false })}
            </div>
          )}
        </div>
      </div>

      {/* Price Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {marketLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-gray-900 border border-gray-800 h-28 animate-pulse" />
            ))
          : market?.map((asset: any) => <PriceCard key={asset.key} asset={asset} />)}
      </div>

      {/* Chart Section */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
        {/* Chart Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Performance</h2>
            <p className="text-xs text-gray-500">Normalized % change from period start</p>
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

        <MultiAssetChart data={history ?? []} range={range} loading={historyLoading} />

        {/* Legend hint */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          {avgChange != null && (
            <div className="text-xs text-gray-500">
              Avg 24h change:{' '}
              <span className={avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {avgChange >= 0 ? '+' : ''}
                {avgChange.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="text-xs text-gray-600 ml-auto">
            Auto-refresh every 30s · Data: Yahoo Finance
          </div>
        </div>
      </div>
    </div>
  )
}
