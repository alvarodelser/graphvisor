import type React from 'react'
import type { FilterState } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  filters: FilterState
  nodeCount: number
  onFilterChange: (f: Partial<FilterState>) => void
  onReheat: () => void
  onFreeze: () => void
}

export function graphRailSections({ filters, onFilterChange, nodeCount: _n, onReheat, onFreeze }: Props) {
  return [
    {
      id: 'nodes', label: 'Types',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['Argument', 'Entity', 'Concept'] as const).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.nodeTypes[type]}
                onChange={e => onFilterChange({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              {type.slice(0,3)}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'confidence', label: 'Conf',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input type="range" min={0} max={1} step={0.05}
            value={filters.minConfidence}
            onChange={e => onFilterChange({ minConfidence: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#F4A124' }} />
          <div style={{ fontSize: 9, color: '#F4A124', fontWeight: 700, textAlign: 'center' }}>
            ≥{filters.minConfidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', label: 'Rels',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.relationGroups[group]}
                onChange={e => onFilterChange({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              <span style={{ width: 8, height: 8, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 2, flexShrink: 0 }} />
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'layout', label: 'Lay',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={onReheat} style={btnS}>Heat</button>
          <button onClick={onFreeze} style={{ ...btnS, background: 'rgba(255,255,255,0.15)' }}>Freeze</button>
        </div>
      ),
    },
  ]
}

const btnS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: 4,
  padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', width: '100%',
}
