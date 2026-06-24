import { useState, type ReactNode } from 'react'
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
  onToggleConceptPanel?: () => void
  showConceptPanel?: boolean
  showMinimap?: boolean
  onToggleMinimap?: () => void
}

export function GraphFilterContent({ filters, setFilters, onReload, onToggleConceptPanel, showConceptPanel, showMinimap, onToggleMinimap }: FilterProps) {
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
      <FilterSection
        label="Node Types"
        allChecked={allNodeTypesOn}
        allIndeterminate={!allNodeTypesOn && anyNodeTypeOn}
        onAllChange={checked => setFilters({ nodeTypes: { ...filters.nodeTypes, Argument: checked, Entity: checked } })}
      >
        {nodeTypeKeys.map(type => (
          <div key={type} style={tickRow}>
            <span style={labelText}>{type}</span>
            <TickBox
              checked={filters.nodeTypes[type]}
              onChange={v => setFilters({ nodeTypes: { ...filters.nodeTypes, [type]: v } })}
            />
          </div>
        ))}
      </FilterSection>

      <FilterSection label="Min Confidence" hint={`≥ ${filters.minConfidence.toFixed(2)}`}>
        <input
          type="range" className="styled-slider" min={0} max={1} step={0.05}
          value={filters.minConfidence}
          onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
          style={{ '--pct': `${filters.minConfidence * 100}%`, '--slider-fill': '#F4A124' } as React.CSSProperties}
        />
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
              <div style={{ ...tickRow, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ ...labelText, fontWeight: 700 }}>{label}</span>
                </div>
                <TickBox
                  checked={allOn}
                  indeterminate={!allOn && !allOff && !groupDisabled}
                  color={color}
                  onChange={v => toggleAllInGroup(types, v)}
                  disabled={groupDisabled}
                />
              </div>
              <div style={{ paddingLeft: 16, marginBottom: 4 }}>
                {types.map(type => (
                  <div key={type} style={{ ...tickRow, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>
                      {type.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <TickBox
                      checked={filters.relationTypes[type] !== false}
                      color={color}
                      onChange={v => toggleRelationType(type, v)}
                      disabled={groupDisabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </FilterSection>

      {onToggleConceptPanel && (
        <div style={flatRow}>
          <span style={sectionLabel}>Concept Panel</span>
          <button
            onClick={onToggleConceptPanel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: showConceptPanel ? '#073b4c' : '#9ca3af', display: 'flex', alignItems: 'center' }}
            title={showConceptPanel ? 'Hide concept panel' : 'Show concept panel'}
          >
            {showConceptPanel ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <ellipse cx="12" cy="12" rx="10" ry="6" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3l18 18M10.58 10.58A3 3 0 0 0 14.83 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.4 18.4 0 0 1-3.1 4.1M6.5 6.5A18.4 18.4 0 0 0 1 12s4 8 11 8a9 9 0 0 0 5.76-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {onToggleMinimap && (
        <div style={flatRow}>
          <span style={sectionLabel}>Minimap</span>
          <button
            onClick={onToggleMinimap}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: showMinimap ? '#073b4c' : '#9ca3af', display: 'flex', alignItems: 'center' }}
            title={showMinimap ? 'Hide minimap' : 'Show minimap'}
          >
            {showMinimap ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <ellipse cx="12" cy="12" rx="10" ry="6" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3l18 18M10.58 10.58A3 3 0 0 0 14.83 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.4 18.4 0 0 1-3.1 4.1M6.5 6.5A18.4 18.4 0 0 0 1 12s4 8 11 8a9 9 0 0 0 5.76-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      )}

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

// ── Shared styles ─────────────────────────────────────────────────────────────

const tickRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }
const labelText: React.CSSProperties = { fontSize: 11, color: '#374151' }
const flatRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(7,59,76,0.07)' }
const sectionLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#073b4c', flex: 1 }
const reloadBtn: React.CSSProperties = { background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }
const legendRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }

// ── TickBox ───────────────────────────────────────────────────────────────────

function TickBox({ checked, indeterminate, color = '#F4A124', onChange, disabled }: {
  checked: boolean
  indeterminate?: boolean
  color?: string
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  const active = checked || !!indeterminate
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      disabled={disabled}
      style={{
        width: 14, height: 14, flexShrink: 0,
        border: `1.5px solid ${active ? color : 'rgba(7,59,76,0.22)'}`,
        borderRadius: 3,
        background: checked ? color : indeterminate ? `${color}33` : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, opacity: disabled ? 0.4 : 1,
      }}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {!checked && indeterminate && (
        <svg width="6" height="2" viewBox="0 0 6 2" aria-hidden="true">
          <rect width="6" height="2" rx="1" fill={color}/>
        </svg>
      )}
    </button>
  )
}

// ── FilterSection ─────────────────────────────────────────────────────────────

function FilterSection({ label, hint, allChecked, allIndeterminate, onAllChange, children }: {
  label: string
  hint?: string
  allChecked?: boolean
  allIndeterminate?: boolean
  onAllChange?: (v: boolean) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

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
          <TickBox
            checked={!!allChecked}
            indeterminate={allIndeterminate}
            onChange={v => onAllChange(v)}
          />
        )}
      </div>
      {open && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  )
}
