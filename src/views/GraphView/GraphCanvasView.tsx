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
}

export function GraphCanvasView({ nodes, edges, blobs, isActive }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [displayedItem, setDisplayedItem] = useState<HoverItem>(null)
  const [isSticky, setIsSticky] = useState(false)
  const {
    selectedNodeId, setSelectedNode, setActiveView, filters, setFilters,
    selectedArgumentId, setSelectedArgumentId,
    selectedConceptId, setSelectedConceptId,
  } = useStore()

  const showBlobs = filters.nodeTypes.Argument && filters.nodeTypes.Entity

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

  return (
    <>
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
        filterContent={<GraphFilterContent filters={filters} setFilters={setFilters} onReload={reheat} />}
        legendContent={<GraphLegendContent filters={filters} />}
        fabBottom={20}
        fabLeft={20}
      />
    </>
  )
}
