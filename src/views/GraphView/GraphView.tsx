import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingPanel } from '../../components/FloatingPanel/FloatingPanel'
import { useGraphD3 } from './useGraphD3'
import type { HoverItem } from './useGraphD3'
import { NodeFloatingCard } from './NodeFloatingCard'
import { RELATION_COLORS } from '../../utils/geometry'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [, setHoverItem] = useState<HoverItem>(null)
  const [stickyItem, setStickyItem] = useState<HoverItem>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const { selectedDocumentIds, selectedNodeId, setSelectedNode, setActiveView, filters, setFilters } = useStore()

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges }) => {
      setNodes(nodes); setEdges(edges)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    onNodeClick: (node) => {
      setSelectedNode(node.id)
      setStickyItem({ type: 'node', node, x: 0, y: 0 })
    },
    onHover: (item) => setHoverItem(item),
    onCanvasClick: () => {
      setSelectedNode(null)
      setStickyItem(null)
    },
  })

  const displayItem = stickyItem

  return (
    <div className={styles.view}>
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />

        {displayItem && (
          <NodeFloatingCard
            item={displayItem}
            sticky={!!stickyItem}
            onDismiss={() => { setStickyItem(null); setSelectedNode(null) }}
            onOpenDetail={() => setActiveView('detail')}
          />
        )}

        {/* Filter FAB */}
        <FloatingPanel
          icon="⚙" label="Filters"
          open={filterOpen} onToggle={() => setFilterOpen(v => !v)}
          fabBottom={20} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Node types</div>
            {(['Argument', 'Entity', 'Concept'] as const).map(type => (
              <label key={type} style={checkRow}>
                <input type="checkbox"
                  checked={filters.nodeTypes[type]}
                  onChange={e => setFilters({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ fontSize: 11, color: '#374151' }}>{type}</span>
              </label>
            ))}
          </div>

          <div>
            <div style={sectionLabel}>Min confidence</div>
            <input type="range" min={0} max={1} step={0.05}
              value={filters.minConfidence}
              onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
              ≥ {filters.minConfidence.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Relations</div>
            {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
              <label key={group} style={checkRow}>
                <input type="checkbox"
                  checked={filters.relationGroups[group]}
                  onChange={e => setFilters({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ width: 10, height: 10, borderRadius: 2, background: group === 'structural' ? '#64748b' : RELATION_COLORS[group], flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#374151', textTransform: 'capitalize' }}>{group}</span>
              </label>
            ))}
          </div>

          <div>
            <div style={sectionLabel}>Layout</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={reheat} style={btnStyle}>Reheat</button>
              <button onClick={freeze} style={{ ...btnStyle, background: '#e2e8f0', color: '#073b4c' }}>Freeze</button>
            </div>
          </div>
        </FloatingPanel>

        {/* Legend FAB */}
        <FloatingPanel
          icon="◈" label="Legend"
          open={legendOpen} onToggle={() => setLegendOpen(v => !v)}
          fabBottom={68} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Nodes</div>
            <div style={legendRow}>
              <span style={{ width: 14, height: 14, background: '#073b4c', borderRadius: 3, flexShrink: 0 }} />
              <span style={legendText}>Argument</span>
            </div>
            <div style={legendRow}>
              <span style={{ width: 14, height: 14, background: '#118ab2', borderRadius: '50%', flexShrink: 0 }} />
              <span style={legendText}>Entity</span>
            </div>
            <div style={legendRow}>
              <span style={{
                width: 0, height: 0,
                borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
                borderBottom: '14px solid #74b9d6',
                flexShrink: 0,
              }} />
              <span style={legendText}>Concept</span>
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Edges</div>
            {([
              ['positive',   'Positive',   RELATION_COLORS.positive],
              ['negative',   'Negative',   RELATION_COLORS.negative],
              ['causal',     'Causal',     RELATION_COLORS.causal],
              ['structural', 'Structural', '#64748b'],
            ] as const).map(([, lbl, color]) => (
              <div key={lbl} style={legendRow}>
                <span style={{ width: 20, height: 3, background: color, borderRadius: 2, flexShrink: 0 }} />
                <span style={legendText}>{lbl}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#073b4c', opacity: 0.5, marginBottom: 8,
}
const checkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
}
const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const legendRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
}
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
