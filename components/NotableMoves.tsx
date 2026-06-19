'use client'

import { ASSET_BY_KEY } from '@/lib/assets'

interface Move {
  time: number
  key: string
  changePct: number
  z: number
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${dd}`
}

export default function NotableMoves({ moves }: { moves: Move[] }) {
  if (!moves?.length) {
    return (
      <div className="text-xs text-gray-600 py-6 text-center">
        No outsized moves this period — markets were calm.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
      {moves.map((m, i) => {
        const meta = ASSET_BY_KEY[m.key]
        const up = m.changePct >= 0
        return (
          <div
            key={`${m.key}-${m.time}-${i}`}
            className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-md hover:bg-gray-800/60 transition-colors"
          >
            <span className="text-gray-500 font-mono w-12 shrink-0">{fmtDate(m.time)}</span>
            <span className="flex items-center gap-1.5 w-24 shrink-0">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: meta?.color }}
              />
              <span className="text-gray-300">{meta?.symbol}</span>
            </span>
            <span className={`font-mono font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? '+' : ''}
              {m.changePct.toFixed(2)}%
            </span>
            <span className="text-gray-600 ml-auto font-mono">
              {Math.abs(m.z).toFixed(1)}σ
            </span>
          </div>
        )
      })}
    </div>
  )
}
