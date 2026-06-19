'use client'

import { useState } from 'react'
import { ASSET_BY_KEY } from '@/lib/assets'
import type { MacroEvent } from '@/lib/events'

function fmtDate(d: string) {
  const [y, m, dd] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${y}.${m}.${dd} ${months[parseInt(m, 10) - 1]}`
}

const IMPACT_STYLE: Record<string, string> = {
  high:   'bg-red-500/15 text-red-400 border border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  low:    'bg-gray-500/15 text-gray-400 border border-gray-500/25',
}
const IMPACT_LABEL: Record<string, string> = { high: '重大', medium: '中等', low: '次要' }

function EventCard({ event, isUpcoming }: { event: MacroEvent; isUpcoming?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="flex gap-3 cursor-pointer group"
      onClick={() => setOpen((v) => !v)}
    >
      {/* Timeline line */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div
          className={`w-2.5 h-2.5 rounded-full border-2 mt-0.5 ${
            isUpcoming
              ? 'border-blue-400 bg-transparent animate-pulse'
              : 'border-gray-500 bg-gray-700'
          }`}
        />
        <div className="w-px flex-1 bg-gray-800 mt-1" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-gray-500 block">{fmtDate(event.date)}</span>
            <span className="text-xs font-medium text-gray-200 group-hover:text-white transition-colors">
              {event.title}
            </span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium ${IMPACT_STYLE[event.impact]}`}>
            {IMPACT_LABEL[event.impact]}
          </span>
        </div>

        {open && (
          <div className="mt-1.5 animate-fade-up">
            <p className="text-xs text-gray-400 leading-relaxed">{event.description}</p>
            <div className="mt-1.5 flex gap-1 flex-wrap">
              {event.assets.map((k) => (
                <span
                  key={k}
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    backgroundColor: `${ASSET_BY_KEY[k]?.color ?? '#888'}18`,
                    color: ASSET_BY_KEY[k]?.color ?? '#888',
                  }}
                >
                  {ASSET_BY_KEY[k]?.symbol ?? k}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  past: MacroEvent[]
  upcoming: MacroEvent[]
}

export default function MacroEvents({ past, upcoming }: Props) {
  const [tab, setTab] = useState<'past' | 'upcoming'>('upcoming')

  const events = tab === 'past' ? past : upcoming

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 pb-3">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              tab === t
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            {t === 'upcoming' ? '即将发生' : '历史事件'}
            <span className="ml-1.5 text-[10px] opacity-60">
              {t === 'upcoming' ? upcoming.length : past.length}
            </span>
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-600 self-center">
          点击展开详情
        </span>
      </div>

      {events.length === 0 ? (
        <div className="text-xs text-gray-600 py-4 text-center">暂无数据</div>
      ) : (
        <div>
          {events.map((e, i) => (
            <EventCard key={`${e.date}-${i}`} event={e} isUpcoming={tab === 'upcoming'} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-600 mt-2">
        数据来源：Fed日历 / 市场预期。未来事件为估算，结果可在 <code className="text-gray-500">lib/events.ts</code> 中更新。
      </p>
    </div>
  )
}
