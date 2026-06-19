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
          <div key={`col-${k}`} className="flex justify-center pb-1">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: ASSET_BY_KEY[k]?.color }}
              title={ASSET_BY_KEY[k]?.name}
            />
          </div>
        ))}

        {/* Rows */}
        {keys.map((rowKey, i) => (
          <Row key={`row-${rowKey}`} rowKey={rowKey} values={matrix[i]} keys={keys} />
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-gray-800/50 border border-gray-700/50 p-3 text-[11px] text-gray-400 space-y-1 leading-relaxed">
        <p>
          <span className="text-blue-400 font-medium">蓝色</span> = 同涨同跌 &nbsp;
          <span className="text-red-400 font-medium">红色</span> = 反向运动 &nbsp;
          颜色越深相关性越强
        </p>
        <p className="text-gray-500">
          数值含义：<span className="text-gray-300">±1.0</span> 完全一致 ·{' '}
          <span className="text-gray-300">±0.5</span> 中度相关 ·{' '}
          <span className="text-gray-300">0</span> 无关联
        </p>
        <p className="text-gray-600">
          基于周期内每日收益率的 Pearson 相关系数 · 悬浮查看解读
        </p>
      </div>
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
      {keys.map((colKey, j) => {
        const v = values?.[j] ?? null
        const diag = colKey === rowKey
        const desc =
          v == null ? '数据不足'
          : diag ? `${ASSET_BY_KEY[rowKey]?.symbol} 自身`
          : Math.abs(v) >= 0.7 ? `强${v > 0 ? '正' : '负'}相关`
          : Math.abs(v) >= 0.4 ? `中度${v > 0 ? '正' : '负'}相关`
          : `弱相关（基本独立）`
        const tip = diag ? '' : `${ASSET_BY_KEY[rowKey]?.symbol} vs ${ASSET_BY_KEY[colKey]?.symbol}：${desc}`
        return (
          <div
            key={j}
            className="aspect-square flex items-center justify-center rounded text-[11px] font-mono cursor-default transition-transform hover:scale-110"
            style={{
              backgroundColor: diag ? 'rgba(255,255,255,0.06)' : cellColor(v),
              color: v != null && Math.abs(v) > 0.5 ? '#fff' : '#cbd5e1',
            }}
            title={tip}
          >
            {v == null ? '–' : v.toFixed(2)}
          </div>
        )
      })}
    </>
  )
}
