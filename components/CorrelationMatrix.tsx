'use client'

import { ASSET_BY_KEY } from '@/lib/assets'

interface Props {
  keys: string[]
  matrix: (number | null)[][]
}

// Blue for positive correlation, red for negative; opacity scales with strength.
function cellColor(v: number | null): string {
  if (v == null) return 'transparent'
  const mag = Math.min(1, Math.abs(v))
  if (v >= 0) return `rgba(59, 130, 246, ${0.1 + 0.6 * mag})`
  return `rgba(239, 68, 68, ${0.1 + 0.6 * mag})`
}

export default function CorrelationMatrix({ keys, matrix }: Props) {
  if (!keys?.length || !matrix?.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        No correlation data
      </div>
    )
  }

  const cols = `minmax(2.5rem, auto) repeat(${keys.length}, minmax(0, 1fr))`

  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: cols }}>
        {/* Header row */}
        <div />
        {keys.map((k) => (
          <div key={k} className="flex justify-center pb-1">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: ASSET_BY_KEY[k]?.color }}
              title={ASSET_BY_KEY[k]?.name}
            />
          </div>
        ))}

        {/* Rows */}
        {keys.map((rowKey, i) => (
          <Row key={rowKey} rowKey={rowKey} values={matrix[i]} keys={keys} />
        ))}
      </div>

      <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">
        Pearson correlation of daily returns.{' '}
        <span className="text-blue-400">Blue</span> = move together,{' '}
        <span className="text-red-400">red</span> = move opposite.
      </p>
    </div>
  )
}

function Row({
  rowKey,
  values,
  keys,
}: {
  rowKey: string
  values: (number | null)[]
  keys: string[]
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 pr-1">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: ASSET_BY_KEY[rowKey]?.color }}
        />
        <span className="text-[11px] text-gray-400 truncate">
          {ASSET_BY_KEY[rowKey]?.symbol}
        </span>
      </div>
      {keys.map((_, j) => {
        const v = values?.[j] ?? null
        const diag = keys[j] === rowKey
        return (
          <div
            key={j}
            className="aspect-square flex items-center justify-center rounded text-[11px] font-mono"
            style={{
              backgroundColor: diag ? 'rgba(255,255,255,0.06)' : cellColor(v),
              color: v != null && Math.abs(v) > 0.5 ? '#fff' : '#cbd5e1',
            }}
          >
            {v == null ? '–' : v.toFixed(2)}
          </div>
        )
      })}
    </>
  )
}
