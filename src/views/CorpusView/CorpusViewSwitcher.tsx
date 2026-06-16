import type { CorpusViewMode } from '../../types'

const MODES: { value: CorpusViewMode; label: string }[] = [
  { value: 'topics', label: '▦ Topics' },
  { value: 'map', label: '⊙ Map' },
  { value: 'timeline', label: '▭ Timeline' },
]

interface Props {
  mode: CorpusViewMode
  onChange: (mode: CorpusViewMode) => void
}

export function CorpusViewSwitcher({ mode, onChange }: Props) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', background: '#fff', borderRadius: 10, padding: 3,
      boxShadow: '0 2px 8px rgba(7,59,76,0.12)', zIndex: 20,
    }}>
      {MODES.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          style={{
            border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 14px',
            fontSize: 11, fontWeight: 700,
            background: mode === m.value ? '#073b4c' : 'transparent',
            color: mode === m.value ? '#fff' : '#64748b',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
