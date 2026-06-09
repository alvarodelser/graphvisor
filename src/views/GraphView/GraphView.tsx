import { useRef, useState, useEffect } from 'react'
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
}

const GROUPED_RELATION_TYPES: { group: string; label: string; types: string[] }[] = [
  { group: 'positive', label: 'Positive', types: ['SUPPORTS', 'CORRELATES_WITH', 'REVEALS'] },
  { group: 'negative', label: 'Negative', types: ['CONTRADICTS'] },
  { group: 'causal',   label: 'Causal',   types: ['CAUSES', 'ASSOCIATED_WITH'] },
  { group: 'structural', label: 'Structural', types: ['HAS_SUBJECT', 'HAS_OBJECT', 'HAS_CONCEPT'] },
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
    showBlobs, setShowBlobs,
    selectedArgumentId, setSelectedArgumentId,
  } = useStore()

  const isActive = activeView === 'graph'

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges, blobs }) => {
      setNodes(nodes); setEdges(edges); setBlobs(blobs)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    blobs,
    showBlobs,
    selectedArgumentId,
    onNodeClick: (node) => {
      setSelectedNode(node.id)
      setSelectedArgumentId(null)
      setDisplayedItem({ type: 'node', node, x: 0, y: 0 })
      setIsSticky(true)
    },
    onBlobClick: (blob) => {
      setSelectedArgumentId(blob.id)
      setSelectedNode(null)
      setDisplayedItem({ type: 'blob', blob, x: 0, y: 0 })
      setIsSticky(true)
    },
    onHover: (item) => {
      if (isSticky) {
        if (item !== null) setDisplayedItem(item)
      } else {
        setDisplayedItem(item)
      }
    },
    onCanvasClick: () => {
      setSelectedNode(null)
      setSelectedArgumentId(null)
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

  const filterContent = (
    <>
      <div>
        <div className="sl">Node types</div>
        {(['Argument', 'Entity', 'Concept'] as const).map(type => (
          <label key={type} style={checkRow}>
            <input type="checkbox"
              checked={filters.nodeTypes[type]}
              onChange={e => setFilters({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
              style={{ accentColor: '#F4A124' }} />
            <span style={labelText}>{type}</span>
          </label>
        ))}
      </div>

      <div>
        <div className="sl">Min confidence</div>
        <input type="range" min={0} max={1} step={0.05}
          value={filters.minConfidence}
          onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
          style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
          ≥ {filters.minConfidence.toFixed(2)}
        </div>
      </div>

      <div>
        <div className="sl">Relations</div>
        {GROUPED_RELATION_TYPES.map(({ group, label, types }) => {
          const allOn = types.every(t => filters.relationTypes[t] !== false)
          const allOff = types.every(t => filters.relationTypes[t] === false)
          const color = REL_GROUP_COLORS[group]
          return (
            <div key={group}>
              <label style={{ ...checkRow, marginBottom: 4 }}>
                <input type="checkbox"
                  checked={allOn}
                  ref={el => { if (el) el.indeterminate = !allOn && !allOff }}
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
      </div>

      <div>
        <div className="sl">Arguments</div>
        <label style={checkRow}>
          <input type="checkbox"
            checked={showBlobs}
            onChange={e => setShowBlobs(e.target.checked)}
            style={{ accentColor: '#64748b' }} />
          <span style={labelText}>Show argument blobs</span>
        </label>
      </div>

      <div>
        <div className="sl">Layout</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={reheat} style={btnStyle}>Reheat</button>
          <button onClick={freeze} style={{ ...btnStyle, background: '#e2e8f0', color: '#073b4c' }}>Freeze</button>
        </div>
      </div>
    </>
  )

  const legendContent = (
    <>
      <div>
        <div className="sl">Nodes</div>
        <div style={legendRow}>
          <span style={{ width: 14, height: 14, background: '#073b4c', borderRadius: 3, flexShrink: 0 }} />
          <span style={legendText}>Argument</span>
        </div>
        <div style={legendRow}>
          <span style={{ width: 14, height: 14, background: '#118ab2', borderRadius: '50%', flexShrink: 0 }} />
          <span style={legendText}>Entity</span>
        </div>
        <div style={legendRow}>
          <span style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '14px solid #74b9d6', flexShrink: 0 }} />
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
              return (
                <div key={type} style={{ ...legendRow, opacity: active ? 1 : 0.3, marginBottom: 4 }}>
                  <span style={{ width: 22, height: 3, background: REL_GROUP_COLORS[group], borderRadius: 2, flexShrink: 0 }} />
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
            onDismiss={() => { setDisplayedItem(null); setIsSticky(false); setSelectedNode(null) }}
            onOpenDetail={() => {
              if (displayedItem?.type === 'blob') {
                setSelectedArgumentId(displayedItem.blob.id)
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
const btnStyle: React.CSSProperties = { flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }
const legendRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
