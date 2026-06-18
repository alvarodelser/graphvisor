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
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(320)
  const viewRef = useRef<HTMLDivElement>(null)
  const didDragRef = useRef(false)
  const { activeView, selectedDocumentIds, setSelectedConceptId, setSelectedArgumentId, setSelectedNode, setActiveView } = useStore()

  const handleTabMouseDown = (e: React.MouseEvent) => {
    if (!panelOpen) return
    e.preventDefault()
    didDragRef.current = false
    const startX = e.clientX
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
    }
    function move(ev: MouseEvent) {
      if (Math.abs(ev.clientX - startX) > 4) didDragRef.current = true
      const left = viewRef.current?.getBoundingClientRect().left ?? 0
      const w = ev.clientX - left
      if (w < 160) { setPanelOpen(false); up(); return }
      setPanelWidth(Math.min(640, Math.max(220, w)))
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const handleTabClick = () => {
    if (didDragRef.current) { didDragRef.current = false; return }
    setPanelOpen(v => !v)
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

  useEffect(() => { setScope({ argumentIds: blobs.map(b => b.id) }) }, [blobs])

  const { fnodes, fedges, fblobs } = useMemo(() => {
    const sel = new Set(scope.argumentIds)
    if (sel.size === blobs.length) return { fnodes: nodes, fedges: edges, fblobs: blobs }
    const fblobs = blobs.filter(b => sel.has(b.id))
    const blobEntityIds = new Set(blobs.flatMap(b => b.entityIds))
    const selEntityIds = new Set(fblobs.flatMap(b => b.entityIds))
    const keep = (id: string) => !blobEntityIds.has(id) || selEntityIds.has(id)
    const fnodes = nodes.filter(n => n.type !== 'Entity' || keep(n.id))
    const kept = new Set(fnodes.filter(n => n.type === 'Entity').map(n => n.id))
    const fedges = edges.filter(e => kept.has(endId(e.source)) && kept.has(endId(e.target)))
    return { fnodes, fedges, fblobs }
  }, [nodes, edges, blobs, scope])

  return (
    <div className={styles.view} ref={viewRef}>
      {panelOpen && (
        <aside className={styles.sidebar} style={{ width: panelWidth }}>
          <ConceptHierarchy
            blobs={blobs}
            scope={scope}
            onScopeChange={setScope}
            onConceptDetail={(conceptId) => {
              setSelectedConceptId(conceptId)
              setSelectedArgumentId(null)
              setSelectedNode(null)
              setActiveView('detail')
            }}
            onArgumentDetail={(argId) => {
              setSelectedArgumentId(argId)
              setSelectedNode(null)
              setSelectedConceptId(null)
              setActiveView('detail')
            }}
          />
        </aside>
      )}

      {/* Book-tab toggle — always visible; also acts as resize handle when panel is open */}
      <div
        className={`${styles.bookTab}${panelOpen ? ` ${styles.bookTabOpen}` : ''}`}
        onMouseDown={handleTabMouseDown}
        onClick={handleTabClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleTabClick()}
        title={panelOpen ? 'Collapse concept panel' : 'Expand concept panel'}
      >
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
          <path
            d={panelOpen
              ? 'M7.5 2.5 L4 6 L7.5 9.5'
              : 'M4.5 2.5 L8 6 L4.5 9.5'}
            fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        <span className={styles.bookTabLabel}>Concepts</span>
      </div>

      <div className={styles.canvas}>
        <GraphCanvasView nodes={fnodes} edges={fedges} blobs={fblobs} isActive={isActive} />
      </div>
    </div>
  )
}
