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

export function graphRailSections({ filters, nodeCount: _nodeCount, onFilterChange, onReheat, onFreeze }: Props) {
  return [
    {
      id: 'nodes', label: 'Node Types',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['Argument', 'Entity', 'Concept'] as const).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.nodeTypes[type]}
                onChange={e => onFilterChange({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                style={{ accentColor: '#073b4c' }}
              />
              {type}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'confidence', label: 'Confidence',
      content: (
        <div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={filters.minConfidence}
            onChange={e => onFilterChange({ minConfidence: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#F4A124' }}
          />
          <div style={{ fontSize: 10, color: '#F4A124', fontWeight: 700, textAlign: 'right' }}>
            ≥ {filters.minConfidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', label: 'Relations',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.relationGroups[group]}
                onChange={e => onFilterChange({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                style={{ accentColor: '#073b4c' }}
              />
              <span style={{ width: 14, height: 2, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 1 }} />
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'layout', label: 'Layout',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onReheat} style={btnS}>Reheat simulation</button>
          <button onClick={onFreeze} style={{ ...btnS, background: '#f4f7fa', color: '#073b4c', border: '1px solid rgba(7,59,76,0.15)' }}>Freeze</button>
        </div>
      ),
    },
  ]
}

const btnS: React.CSSProperties = {
  background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
