import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { useGraphD3 } from './useGraphD3'
import { NodeDetailCard } from './NodeDetailCard'
import { graphRailSections } from './GraphFilterRail'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
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
  })

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  return (
    <div className={styles.view}>
      <FilterRail sections={graphRailSections({
        filters, nodeCount: nodes.length,
        onFilterChange: setFilters,
        onReheat: reheat, onFreeze: freeze,
      })} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        {selectedNode && (
          <NodeDetailCard
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
