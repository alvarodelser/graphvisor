import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RELATION_COLORS } from '../../utils/geometry'
import type { FilterState } from '../../types'

export const REL_GROUP_COLORS: Record<string, string> = {
  evidence: RELATION_COLORS.evidence,
  correlation: RELATION_COLORS.correlation,
  causation: RELATION_COLORS.causation,
  definition: RELATION_COLORS.definition,
}

export const GROUPED_RELATION_TYPES: { group: string; label: string; types: string[] }[] = [
  { group: 'evidence',    label: 'Evidence',    types: ['SUPPORTS', 'REVEALS', 'SUGGESTS', 'CONTRADICTS'] },
  { group: 'correlation', label: 'Correlation', types: ['CORRELATES_WITH', 'ASSOCIATED_WITH', 'ANALOGOUS_TO'] },
  { group: 'causation',   label: 'Causation',   types: ['CAUSES', 'INCREASES', 'DECREASES', 'INHIBITS', 'INDUCES', 'MAY_CAUSE'] },
  { group: 'definition',  label: 'Definition',  types: ['DESCRIBES', 'IS_DEFINED_AS'] },
]

interface FilterProps {
  filters: FilterState
  setFilters: (partial: Partial<FilterState>) => void
  onReload: () => void
  linkedEvidenceCount: number
  highlightLinked: boolean
  onToggleHighlightLinked: () => void
}

export function GraphFilterContent({ filters, setFilters, onReload, linkedEvidenceCount, highlightLinked, onToggleHighlightLinked }: FilterProps) {
  const toggleRelationType = (type: string, checked: boolean) =>
    setFilters({ relationTypes: { ...filters.relationTypes, [type]: checked } })

  const toggleAllInGroup = (types: string[], checked: boolean) => {
    const update: Record<string, boolean> = {}
    types.forEach(t => { update[t] = checked })
    setFilters({ relationTypes: { ...filters.relationTypes, ...update } })
  }

  const nodeTypeKeys = ['Argument', 'Entity'] as const
  const allNodeTypesOn = nodeTypeKeys.every(t => filters.nodeTypes[t])
  const anyNodeTypeOn = nodeTypeKeys.some(t => filters.nodeTypes[t])

  const allRelTypeKeys = GROUPED_RELATION_TYPES.flatMap(g => g.types)
  const allRelsOn = allRelTypeKeys.every(t => filters.relationTypes[t] !== false)
  const anyRelOn = allRelTypeKeys.some(t => filters.relationTypes[t] !== false)

  return (
    <>
      {linkedEvidenceCount > 0 && (
        <div style={flatRow}>
          <label style={{ ...checkRow, marginBottom: 0, flex: 1 }}
            title="Highlight arguments cited as evidence by the selected hypotheses (and check them in the concept panel)">
            <input type="checkbox" checked={highlightLinked} onChange={onToggleHighlightLinked}
              style={{ accentColor: '#8b5cf6' }} />
            <span style={{ ...labelText, fontWeight: 700, color: '#8b5cf6' }}>Linked evidence</span>
          </label>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.14)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
            {linkedEvidenceCount}
          </span>
        </div>
      )}

      <FilterSection
        label="Node Types"
        allChecked={allNodeTypesOn}
        allIndeterminate={!allNodeTypesOn && anyNodeTypeOn}
        onAllChange={checked => {
          const nextNodeTypes = { ...filters.nodeTypes, Argument: checked, Entity: checked }
          setFilters({ nodeTypes: nextNodeTypes })
        }}
      >
        {nodeTypeKeys.map(type => (
          <label key={type} style={checkRow}>
            <input type="checkbox"
              checked={filters.nodeTypes[type]}
              onChange={e => setFilters({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
              style={{ accentColor: '#F4A124' }} />
            <span style={labelText}>{type}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection label="Min Confidence" hint={`≥ ${filters.minConfidence.toFixed(2)}`}>
        <input type="range" min={0} max={1} step={0.05}
          value={filters.minConfidence}
          onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
          style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
          ≥ {filters.minConfidence.toFixed(2)}
        </div>
      </FilterSection>

      <FilterSection
        label="Relations"
        allChecked={allRelsOn}
        allIndeterminate={!allRelsOn && anyRelOn}
        onAllChange={checked => {
          const update: Record<string, boolean> = {}
          allRelTypeKeys.forEach(t => { update[t] = checked })
          setFilters({ relationTypes: { ...filters.relationTypes, ...update } })
        }}
      >
        {GROUPED_RELATION_TYPES.map(({ group, label, types }) => {
          const groupDisabled = !filters.nodeTypes.Entity
          const allOn = !groupDisabled && types.every(t => filters.relationTypes[t] !== false)
          const allOff = types.every(t => filters.relationTypes[t] === false)
          const color = REL_GROUP_COLORS[group]
          return (
            <div key={group} style={{ opacity: groupDisabled ? 0.35 : 1, pointerEvents: groupDisabled ? 'none' : undefined }}>
              <label style={{ ...checkRow, marginBottom: 4 }}>
                <input type="checkbox"
                  checked={allOn}
                  disabled={groupDisabled}
                  ref={el => { if (el) el.indeterminate = !allOn && !allOff && !groupDisabled }}
                  onChange={e => toggleAllInGroup(types, e.target.checked)}
                  style={{ accentColor: color }} />
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ ...labelText, fontWeight: 700 }}>{label}</span>
              </label>
              <div style={{ paddingLeft: 24 }}>
                {types.map(type => (
                  <label key={type} style={{ ...checkRow, marginBottom: 3 }}>
                    <input type="checkbox"
                      checked={filters.relationTypes[type] !== false}
                      disabled={groupDisabled}
                      onChange={e => toggleRelationType(type, e.target.checked)}
                      style={{ accentColor: color }} />
                    <span style={{ ...labelText, fontSize: 10, color: '#6b7280' }}>
                      {type.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </FilterSection>

      <div style={flatRow}>
        <span style={sectionLabel}>Reload</span>
        <button onClick={onReload} style={reloadBtn}>↺</button>
      </div>
    </>
  )
}

export function GraphLegendContent({ filters }: { filters: FilterState }) {
  return (
    <>
      <div>
        <div className="sl">Nodes</div>
        <div style={legendRow}>
          <span style={{ width: 14, height: 14, background: 'rgba(7,59,76,0.22)', border: '1px solid rgba(7,59,76,0.4)', borderRadius: 3, flexShrink: 0 }} />
          <span style={legendText}>Argument</span>
        </div>
        <div style={legendRow}>
          <span style={{ width: 14, height: 14, background: '#118ab2', borderRadius: '50%', flexShrink: 0 }} />
          <span style={legendText}>Entity</span>
        </div>
        <div style={{ ...legendRow, marginTop: 6, borderTop: '1px solid rgba(7,59,76,0.06)', paddingTop: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid #F4A124', background: 'transparent', flexShrink: 0 }} />
          <span style={legendText}>Selected node</span>
        </div>
      </div>

      <div>
        <div className="sl">Edges (by type)</div>
        {GROUPED_RELATION_TYPES.map(({ group, label, types }) => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: REL_GROUP_COLORS[group], marginBottom: 4 }}>{label}</div>
            {types.map(type => {
              const active = filters.relationTypes[type] !== false
              const color = REL_GROUP_COLORS[group]
              return (
                <div key={type} style={{ ...legendRow, opacity: active ? 1 : 0.3, marginBottom: 4 }}>
                  {group === 'concept' ? (
                    <svg width="22" height="12" style={{ flexShrink: 0 }}>
                      <line x1="0" y1="6" x2="22" y2="6" stroke={color} strokeWidth="1.5" opacity="0.65" />
                    </svg>
                  ) : group === 'correlation' ? (
                    <svg width="22" height="12" style={{ flexShrink: 0 }}>
                      <polygon points="0,6 6,1 16,1 22,6 16,11 6,11" fill={`${color}22`} stroke={color} strokeWidth="1" />
                    </svg>
                  ) : (
                    <svg width="22" height="12" style={{ flexShrink: 0 }}>
                      <polygon points="0,1 14,1 20,6 14,11 0,11" fill={`${color}22`} stroke={color} strokeWidth="1" />
                    </svg>
                  )}
                  <span style={{ ...legendText, fontSize: 10 }}>{type.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

const checkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }
const labelText: React.CSSProperties = { fontSize: 11, color: '#374151' }
const flatRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(7,59,76,0.07)' }
const sectionLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#073b4c', flex: 1 }
const reloadBtn: React.CSSProperties = { background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }
const legendRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }

function FilterSection({ label, hint, allChecked, allIndeterminate, onAllChange, children }: {
  label: string
  hint?: string
  allChecked?: boolean
  allIndeterminate?: boolean
  onAllChange?: (v: boolean) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const checkRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = !!allIndeterminate
  }, [allIndeterminate])

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0', userSelect: 'none', borderBottom: '1px solid rgba(7,59,76,0.07)', marginBottom: open ? 8 : 0 }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 9, color: '#9ca3af', lineHeight: 1, flexShrink: 0 }}>❯</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#073b4c', flex: 1 }}>{label}</span>
        {hint && <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124', flexShrink: 0 }}>{hint}</span>}
        {onAllChange != null && (
          <input
            type="checkbox"
            ref={checkRef}
            checked={!!allChecked}
            onChange={e => onAllChange(e.target.checked)}
            onClick={e => e.stopPropagation()}
            style={{ accentColor: '#F4A124', cursor: 'pointer', flexShrink: 0 }}
          />
        )}
      </div>
      {open && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  )
}
