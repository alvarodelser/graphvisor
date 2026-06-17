import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { GraphCanvasView } from './GraphCanvasView'
import { ConceptHierarchy } from './ConceptHierarchy'
import type { GraphNode, GraphEdge, ArgumentBlob, SelectedScope } from '../../types'
import styles from './GraphView.module.css'

const endId = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id)

export function GraphView() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [blobs, setBlobs] = useState<ArgumentBlob[]>([])
  const [scope, setScope] = useState<SelectedScope>({ argumentIds: [] })
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(320)
  const viewRef = useRef<HTMLDivElement>(null)
  const { activeView, selectedDocumentIds } = useStore()

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
    }
    function move(ev: MouseEvent) {
      const left = viewRef.current?.getBoundingClientRect().left ?? 0
      const w = ev.clientX - left
      // Drag past the minimum collapses the panel entirely.
      if (w < 160) { setPanelOpen(false); up(); return }
      setPanelWidth(Math.min(640, Math.max(220, w)))
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

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

  // Everything is selected by default — reset to the full set whenever the
  // underlying graph changes (i.e. the document selection changed).
  useEffect(() => { setScope({ argumentIds: blobs.map(b => b.id) }) }, [blobs])

  // Scope the graph to the concept-panel selection. When everything is selected
  // we pass the data through untouched (identical to the unfiltered graph).
  const { fnodes, fedges, fblobs } = useMemo(() => {
    const sel = new Set(scope.argumentIds)
    if (sel.size === blobs.length) return { fnodes: nodes, fedges: edges, fblobs: blobs }
    const fblobs = blobs.filter(b => sel.has(b.id))
    const blobEntityIds = new Set(blobs.flatMap(b => b.entityIds))
    const selEntityIds = new Set(fblobs.flatMap(b => b.entityIds))
    // Keep an entity if it belongs to a selected blob, or to no blob at all
    // (orphan entities aren't governed by concept selection).
    const keep = (id: string) => !blobEntityIds.has(id) || selEntityIds.has(id)
    const fnodes = nodes.filter(n => n.type !== 'Entity' || keep(n.id))
    const kept = new Set(fnodes.filter(n => n.type === 'Entity').map(n => n.id))
    const fedges = edges.filter(e => kept.has(endId(e.source)) && kept.has(endId(e.target)))
    return { fnodes, fedges, fblobs }
  }, [nodes, edges, blobs, scope])

  return (
    <div className={styles.view} ref={viewRef}>
      {panelOpen ? (
        <>
          <aside className={styles.sidebar} style={{ width: panelWidth }}>
            <ConceptHierarchy blobs={blobs} scope={scope} onScopeChange={setScope} />
          </aside>
          <div className={styles.resizer} onMouseDown={startResize} title="Drag to resize · drag left to collapse" />
        </>
      ) : (
        <button className={styles.expandRail} onClick={() => setPanelOpen(true)} title="Show concept panel">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.railLabel}>Concepts</span>
        </button>
      )}

      <div className={styles.canvas}>
        <GraphCanvasView nodes={fnodes} edges={fedges} blobs={fblobs} isActive={isActive} />
      </div>
    </div>
  )
}
