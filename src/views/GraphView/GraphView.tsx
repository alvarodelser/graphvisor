import { useRef, useState, useEffect, type ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import { useGraphD3 } from './useGraphD3'
import type { HoverItem } from './useGraphD3'
import { NodeFloatingCard } from './NodeFloatingCard'
import { RELATION_COLORS } from '../../utils/geometry'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../../types'
import styles from './GraphView.module.css'

const REL_GROUP_COLORS: Record<string, string> = {
  positive: RELATION_COLORS.positive,
  negative: RELATION_COLORS.negative,
  causal: RELATION_COLORS.causal,
  structural: '#64748b',
  concept: RELATION_COLORS.concept,
}

const GROUPED_RELATION_TYPES: { group: string; label: string; types: string[] }[] = [
  { group: 'positive',   label: 'Positive',   types: ['SUPPORTS', 'CORRELATES_WITH', 'REVEALS'] },
  { group: 'negative',   label: 'Negative',   types: ['CONTRADICTS'] },
  { group: 'causal',     label: 'Causal',     types: ['CAUSES', 'ASSOCIATED_WITH'] },
  { group: 'structural', label: 'Structural', types: ['HAS_SUBJECT', 'HAS_OBJECT'] },
  { group: 'concept',    label: 'Concept',    types: ['HAS_CONCEPT'] },
]

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [blobs, setBlobs] = useState<ArgumentBlob[]>([])
  const [displayedItem, setDisplayedItem] = useState<HoverItem>(null)
  const [isSticky, setIsSticky] = useState(false)
  const {
    activeView, selectedDocumentIds,
    selectedNodeId, setSelectedNode,
    setActiveView, filters, setFilters,
    selectedArgumentId, setSelectedArgumentId,
    selectedConceptId, setSelectedConceptId,
  } = useStore()

  const showBlobs = filters.nodeTypes.Argument && filters.nodeTypes.Entity

  const isActive = activeView === 'graph'

  useEffect(() => {
    if (selectedDocumentIds.length === 0) {
      setNodes([]); setEdges([]); setBlobs([])
      return
    }
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges, blobs }) => {
      setNodes(nodes); setEdges(edges); setBlobs(blobs)
    })
  }, [selectedDocumentIds])

  const { reheat } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    blobs,
    showBlobs,
    selectedArgumentId,
    selectedConceptId,
    onNodeClick: (node) => {
      setSelectedNode(node.id)
      setSelectedArgumentId(node.type === 'Argument' ? node.id : null)
      setSelectedConceptId(null)
      setDisplayedItem({ type: 'node', node, x: 0, y: 0 })
      setIsSticky(true)
    },
    onBlobClick: (blob) => {
      setSelectedArgumentId(blob.id)
      setSelectedNode(null)
      setSelectedConceptId(null)
      setDisplayedItem({ type: 'blob', blob, x: 0, y: 0 })
      setIsSticky(true)
    },
    onConceptClick: (payload) => {
      setSelectedConceptId(payload.conceptId)
      setSelectedArgumentId(null)
      setSelectedNode(null)
      setDisplayedItem({ type: 'concept', ...payload, x: 0, y: 0 })
      setIsSticky(true)
    },
    onHover: (item) => {
      if (isSticky) {
        if (item !== null && item.type !== 'blob' && item.type !== 'concept') setDisplayedItem(item)
      } else {
        setDisplayedItem(item)
      }
    },
    onCanvasClick: () => {
      setSelectedNode(null)
      setSelectedArgumentId(null)
      setSelectedConceptId(null)
      setDisplayedItem(null)
      setIsSticky(false)
    },
  })

  const toggleRelationType = (type: string, checked: boolean) =>
    setFilters({ relationTypes: { ...filters.relationTypes, [type]: checked } })

  const toggleAllInGroup = (types: string[], checked: boolean) => {
    const update: Record<string, boolean> = {}
    types.forEach(t => { update[t] = checked })
    setFilters({ relationTypes: { ...filters.relationTypes, ...update } })
  }

  const nodeTypeKeys = ['Argument', 'Entity', 'Concept'] as const
  const allNodeTypesOn = nodeTypeKeys.every(t => filters.nodeTypes[t])
  const anyNodeTypeOn = nodeTypeKeys.some(t => filters.nodeTypes[t])

  const allRelTypeKeys = GROUPED_RELATION_TYPES.flatMap(g => g.types)
  const allRelsOn = allRelTypeKeys.every(t => filters.relationTypes[t] !== false)
  const anyRelOn = allRelTypeKeys.some(t => filters.relationTypes[t] !== false)

  const filterContent = (
    <>
      <FilterSection
        label="Node Types"
        allChecked={allNodeTypesOn}
        allIndeterminate={!allNodeTypesOn && anyNodeTypeOn}
        onAllChange={checked => {
          const nextNodeTypes = { Argument: checked, Entity: checked, Concept: checked }
          setFilters({ nodeTypes: nextNodeTypes })
        }}
      >
        {nodeTypeKeys.map(type => {
          const conceptDisabled = type === 'Concept' && !filters.nodeTypes.Argument
          return (
            <label key={type} style={{ ...checkRow, opacity: conceptDisabled ? 0.35 : 1 }}>
              <input type="checkbox"
                checked={filters.nodeTypes[type]}
                disabled={conceptDisabled}
                onChange={e => {
                  const nextNodeTypes = { ...filters.nodeTypes, [type]: e.target.checked }
                  if (type === 'Argument' && !e.target.checked) nextNodeTypes.Concept = false
                  setFilters({ nodeTypes: nextNodeTypes })
                }}
                style={{ accentColor: '#F4A124' }} />
              <span style={labelText}>{type}</span>
            </label>
          )
        })}
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
          const groupDisabled =
            (group !== 'concept' && !filters.nodeTypes.Entity) ||
            (group === 'concept' && !filters.nodeTypes.Concept)
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
        <button onClick={reheat} style={reloadBtn}>↺</button>
      </div>
    </>
  )

  const legendContent = (
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
        <div style={legendRow}>
          <svg width="14" height="14" style={{ flexShrink: 0 }}><polygon points="7,0 14,7 7,14 0,7" fill="#6366f1" opacity="0.85" /></svg>
          <span style={legendText}>Concept</span>
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
              const isStructLike = group === 'structural' || group === 'concept'
              const lineColor = REL_GROUP_COLORS[group]
              return (
                <div key={type} style={{ ...legendRow, opacity: active ? 1 : 0.3, marginBottom: 4 }}>
                  {isStructLike ? (
                    <svg width="22" height="12" style={{ flexShrink: 0 }}>
                      <line x1="0" y1="6" x2="22" y2="6" stroke={lineColor} strokeWidth="1.5" opacity="0.65" />
                    </svg>
                  ) : (
                    <svg width="22" height="12" style={{ flexShrink: 0 }}>
                      <polygon points="0,1 14,1 20,6 14,11 0,11" fill={`${REL_GROUP_COLORS[group]}22`} stroke={REL_GROUP_COLORS[group]} strokeWidth="1" />
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

  return (
    <div className={styles.view}>
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />

        {displayedItem && (
          <NodeFloatingCard
            item={displayedItem}
            sticky={isSticky}
            onDismiss={() => { setDisplayedItem(null); setIsSticky(false); setSelectedNode(null); setSelectedArgumentId(null); setSelectedConceptId(null) }}
            onOpenDetail={() => {
              if (displayedItem?.type === 'blob') {
                setSelectedArgumentId(displayedItem.blob.id)
                setSelectedNode(null)
                setSelectedConceptId(null)
              } else if (displayedItem?.type === 'node' && displayedItem.node.type === 'Argument') {
                setSelectedArgumentId(displayedItem.node.id)
                setSelectedNode(null)
                setSelectedConceptId(null)
              } else if (displayedItem?.type === 'concept') {
                setSelectedConceptId(displayedItem.conceptId)
                setSelectedArgumentId(null)
                setSelectedNode(null)
              }
              setActiveView('detail')
            }}
          />
        )}

        <ControlPanel
          isActive={isActive}
          filterContent={filterContent}
          legendContent={legendContent}
          fabBottom={20}
          fabLeft={20}
        />
      </div>
    </div>
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
