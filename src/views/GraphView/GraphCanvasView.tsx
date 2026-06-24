import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import { useGraphD3 } from './useGraphD3'
import type { HoverItem } from './useGraphD3'
import { GraphMiniMap } from './GraphMiniMap'
import type { ZoomState } from './GraphMiniMap'
import { NodeFloatingCard } from './NodeFloatingCard'
import { GraphFilterContent, GraphLegendContent } from './GraphControls'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../../types'
import type { LodMode } from './lod'
import styles from './GraphView.module.css'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  blobs: ArgumentBlob[]
  isActive: boolean
  hoveredConceptId: string | null
  lod: LodMode
  onToggleConceptPanel?: () => void
  showConceptPanel?: boolean
}

export function GraphCanvasView({ nodes, edges, blobs, isActive, hoveredConceptId, lod, onToggleConceptPanel, showConceptPanel }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [displayedItem, setDisplayedItem] = useState<HoverItem>(null)
  const [isSticky, setIsSticky] = useState(false)
  const [zoomState, setZoomState] = useState<ZoomState>({ k: 1, x: 0, y: 0 })
  const [canvasBounds, setCanvasBounds] = useState({ width: 0, height: 0 })
  const [showMinimap, setShowMinimap] = useState(true)
  const blobCentroidsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const {
    setSelectedNode, filters, setFilters,
    setSelectedArgumentId, setSelectedConceptId,
    setSelectedRelation,
  } = useStore()

  useEffect(() => {
    if (!svgRef.current) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setCanvasBounds({ width, height })
    })
    obs.observe(svgRef.current)
    const r = svgRef.current.getBoundingClientRect()
    setCanvasBounds({ width: r.width, height: r.height })
    return () => obs.disconnect()
  }, [])

  const showBlobs = filters.nodeTypes.Argument && filters.nodeTypes.Entity

  const clearAll = () => {
    setSelectedNode(null)
    setSelectedArgumentId(null)
    setSelectedConceptId(null)
    setSelectedRelation(null)
  }

  const { reheat, freeze, panTo } = useGraphD3(svgRef, nodes, edges, {
    filters,
    blobs,
    showBlobs,
    lod,
    hoveredConceptId,
    lockedItem: isSticky ? displayedItem : null,
    onZoomChange: setZoomState,
    blobCentroidsRef,
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

  useEffect(() => {
    if (isActive) reheat()
    else freeze()
  }, [isActive])

  const handlePanTo = useCallback((gx: number, gy: number) => { panTo(gx, gy) }, [panTo])

  const highlightedBlobIds = useMemo((): Set<string> => {
    if (!isSticky || !displayedItem) return new Set()
    switch (displayedItem.type) {
      case 'blob':
        return new Set([displayedItem.blob.id])
      case 'node':
        if (displayedItem.node.type === 'Argument') return new Set([displayedItem.node.id])
        return new Set(blobs.filter(b => b.entityIds.includes(displayedItem.node.id)).map(b => b.id))
      case 'edge':
        return new Set(blobs.filter(b =>
          b.entityIds.includes(displayedItem.sourceNode.id) || b.entityIds.includes(displayedItem.targetNode.id)
        ).map(b => b.id))
      case 'concept':
        return new Set(blobs.filter(b => b.parent_concepts.includes(displayedItem.conceptId)).map(b => b.id))
      default:
        return new Set()
    }
  }, [isSticky, displayedItem, blobs])

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

      {showMinimap && (
        <GraphMiniMap
          blobs={blobs}
          blobCentroidsRef={blobCentroidsRef}
          zoomState={zoomState}
          svgWidth={canvasBounds.width}
          svgHeight={canvasBounds.height}
          highlightedBlobIds={highlightedBlobIds}
          onPanTo={handlePanTo}
          onClose={() => setShowMinimap(false)}
        />
      )}

      <ControlPanel
        isActive={isActive}
        filterContent={<GraphFilterContent filters={filters} setFilters={setFilters} onReload={reheat} onToggleConceptPanel={onToggleConceptPanel} showConceptPanel={showConceptPanel} showMinimap={showMinimap} onToggleMinimap={() => setShowMinimap(v => !v)} />}
        legendContent={<GraphLegendContent filters={filters} />}
        fabBottom={20}
        fabLeft={20}
      />
    </>
  )
}
