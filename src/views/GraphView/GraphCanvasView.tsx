import { useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import { useGraphD3 } from './useGraphD3'
import type { HoverItem } from './useGraphD3'
import { NodeFloatingCard } from './NodeFloatingCard'
import { GraphFilterContent, GraphLegendContent } from './GraphControls'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../../types'
import styles from './GraphView.module.css'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  blobs: ArgumentBlob[]
  isActive: boolean
  hoveredConceptId: string | null
}

export function GraphCanvasView({ nodes, edges, blobs, isActive, hoveredConceptId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [displayedItem, setDisplayedItem] = useState<HoverItem>(null)
  const [isSticky, setIsSticky] = useState(false)
  const {
    setSelectedNode, filters, setFilters,
    setSelectedArgumentId, setSelectedConceptId,
    setSelectedRelation,
  } = useStore()

  const showBlobs = filters.nodeTypes.Argument && filters.nodeTypes.Entity

  const clearAll = () => {
    setSelectedNode(null)
    setSelectedArgumentId(null)
    setSelectedConceptId(null)
    setSelectedRelation(null)
  }

  const { reheat } = useGraphD3(svgRef, nodes, edges, {
    filters,
    blobs,
    showBlobs,
    hoveredConceptId,
    lockedItem: isSticky ? displayedItem : null,
    onNodeClick: (node) => {
      clearAll()
      setSelectedNode(node.id)
      if (node.type === 'Argument') setSelectedArgumentId(node.id)
      setDisplayedItem({ type: 'node', node, x: 0, y: 0 })
      setIsSticky(true)
    },
    onBlobClick: (blob) => {
      clearAll()
      setSelectedArgumentId(blob.id)
      setDisplayedItem({ type: 'blob', blob, x: 0, y: 0 })
      setIsSticky(true)
    },
    onConceptClick: (payload) => {
      clearAll()
      setSelectedConceptId(payload.conceptId)
      setDisplayedItem({ type: 'concept', ...payload, x: 0, y: 0 })
      setIsSticky(true)
    },
    onEdgeClick: (edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode) => {
      clearAll()
      setSelectedRelation({
        id: edge.id,
        relation_type: edge.relation_type,
        confidence: edge.confidence,
        group: edge.group,
        full_predicate: edge.full_predicate,
        source_document_title: edge.source_document_title,
        reasoning: edge.reasoning,
        sourceId: sourceNode.id,
        sourceLabel: sourceNode.label,
        targetId: targetNode.id,
        targetLabel: targetNode.label,
      })
      setDisplayedItem({ type: 'edge', edge, sourceNode, targetNode, x: 0, y: 0 })
      setIsSticky(true)
    },
    onHover: (item) => {
      if (!isSticky) setDisplayedItem(item)
    },
    onCanvasClick: () => {
      clearAll()
      setDisplayedItem(null)
      setIsSticky(false)
    },
  })

  return (
    <>
      <svg ref={svgRef} className={styles.svg} />

      {displayedItem && (
        <NodeFloatingCard
          item={displayedItem}
          sticky={isSticky}
          onDismiss={() => { setDisplayedItem(null); setIsSticky(false); clearAll() }}
        />
      )}

      <ControlPanel
        isActive={isActive}
        filterContent={<GraphFilterContent filters={filters} setFilters={setFilters} onReload={reheat} />}
        legendContent={<GraphLegendContent filters={filters} />}
        fabBottom={20}
        fabLeft={20}
      />
    </>
  )
}
