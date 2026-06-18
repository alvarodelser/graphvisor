import { useRef, useLayoutEffect, useState } from 'react'
import { SquaresFour, MapTrifold, ChartLine, Lasso, ArrowsHorizontal, CursorClick } from '@phosphor-icons/react'
import type { CorpusViewMode } from '../../types'

const MODES = [
  { value: 'topics' as CorpusViewMode, label: 'by Topic', ModeIcon: SquaresFour, toolLabel: 'CLICK', ToolIcon: CursorClick },
  { value: 'map' as CorpusViewMode, label: 'by Content', ModeIcon: MapTrifold, toolLabel: 'LASSO', ToolIcon: Lasso },
  { value: 'timeline' as CorpusViewMode, label: 'by Publication Date', ModeIcon: ChartLine, toolLabel: 'DRAG RANGE', ToolIcon: ArrowsHorizontal },
]

interface Props {
  mode: CorpusViewMode
  onChange: (mode: CorpusViewMode) => void
}

export function CorpusViewSwitcher({ mode, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Map<CorpusViewMode, HTMLButtonElement>>(new Map())
  const [chipX, setChipX] = useState<number | null>(null)

  useLayoutEffect(() => {
    const btn = btnRefs.current.get(mode)
    const container = containerRef.current
    if (!btn || !container) return
    const btnRect = btn.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setChipX(btnRect.left - containerRect.left + btnRect.width / 2)
  }, [mode])

  const active = MODES.find(m => m.value === mode)!

  return (
    <div ref={containerRef} style={{
      position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20,
    }}>
      <div style={{
        display: 'flex', background: '#fff', borderRadius: 10, padding: 3,
        boxShadow: '0 2px 8px rgba(7,59,76,0.12)',
      }}>
        {MODES.map(m => (
          <button
            key={m.value}
            ref={el => el ? btnRefs.current.set(m.value, el) : btnRefs.current.delete(m.value)}
            onClick={() => onChange(m.value)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 14px',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 5,
              background: mode === m.value ? '#073b4c' : 'transparent',
              color: mode === m.value ? '#fff' : '#64748b',
            }}
          >
            <m.ModeIcon size={12} weight={mode === m.value ? 'fill' : 'regular'} />
            {m.label}
          </button>
        ))}
      </div>

      {/* Tool chip — positioned below the active button */}
      <div style={{ position: 'relative', height: 22, marginTop: 4 }}>
        {chipX !== null && (
          <div style={{
            position: 'absolute',
            left: chipX,
            transform: 'translateX(-50%)',
            transition: 'left 0.15s ease',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            color: '#073b4c', opacity: 0.45,
            background: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '3px 7px',
            pointerEvents: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 1px 4px rgba(7,59,76,0.08)',
          }}>
            <active.ToolIcon size={10} weight="bold" />
            {active.toolLabel}
          </div>
        )}
      </div>
    </div>
  )
}
