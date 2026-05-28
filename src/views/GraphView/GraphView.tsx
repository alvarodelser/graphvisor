import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { useGraphD3 } from './useGraphD3'
import { NodePanel } from './NodePanel'
import { HoverTooltip } from './HoverTooltip'
import { graphRailSections } from './GraphFilterRail'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [hoveredNode, setHoveredNode] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const { selectedDocumentIds, selectedNodeId, setSelectedNode, setActiveView, filters, setFilters } = useStore()

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges }) => {
      setNodes(nodes); setEdges(edges)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    onNodeClick: (node) => setSelectedNode(node.id),
    onNodeHover: (node, x, y) => node ? setHoveredNode({ node, x, y }) : setHoveredNode(null),
    onCanvasClick: () => setSelectedNode(null),
  })

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  return (
    <div className={styles.view}>
      <FilterRail sections={graphRailSections({
        filters, nodeCount: nodes.length,
        onFilterChange: setFilters,
        onReheat: reheat, onFreeze: freeze,
      })} />
      <div className={styles.canvasWrapper}>
        <div className={styles.canvas}>
          <svg ref={svgRef} className={styles.svg} />
          {hoveredNode && (
            <HoverTooltip node={hoveredNode.node} x={hoveredNode.x} y={hoveredNode.y} />
          )}
        </div>
        {selectedNode && (
          <NodePanel
            node={selectedNode}
            edges={edges}
            onDismiss={() => setSelectedNode(null)}
            onOpenDetail={() => setActiveView('detail')}
          />
        )}
      </div>
    </div>
  )
}
