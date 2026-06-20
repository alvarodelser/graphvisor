import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { GraphCanvasView } from './GraphCanvasView'
import { ConceptHierarchy } from './ConceptHierarchy'
import { lodMode, LOD_THRESHOLDS } from './lod'
import type { GraphNode, GraphEdge, ArgumentBlob, Hypothesis, SelectedScope } from '../../types'
import styles from './GraphView.module.css'

const endId = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id)

export function GraphView() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [allBlobs, setAllBlobs] = useState<ArgumentBlob[]>([])
  const [allHypotheses, setAllHypotheses] = useState<Hypothesis[]>([])
  const [scope, setScope] = useState<SelectedScope>({ argumentIds: [] })
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(320)
  const [hoveredConceptId, setHoveredConceptId] = useState<string | null>(null)
  const [hasActivatedOnce, setHasActivatedOnce] = useState(false)
  const [forceRender, setForceRender] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const didDragRef = useRef(false)
  const { activeView, selectedDocumentIds, selectedHypothesisIds, setSelectedConceptId, setSelectedArgumentId, setSelectedNode, setActiveView, setScopedArgumentCount } = useStore()

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

  // Don't build the graph until Explore is first opened; stay loaded afterward.
  useEffect(() => { if (isActive) setHasActivatedOnce(true) }, [isActive])

  useEffect(() => {
    dataService.getHypotheses().then(setAllHypotheses)
  }, [])

  // Data fetch is cheap and feeds the Explore tab's argument badge, so it runs on
  // selection regardless of activation. Only the heavy sim mount is deferred (showGraph).
  useEffect(() => {
    if (selectedDocumentIds.length === 0) {
      setNodes([]); setEdges([]); setAllBlobs([])
      return
    }
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges, blobs }) => {
      setNodes(nodes); setEdges(edges); setAllBlobs(blobs)
    })
  }, [selectedDocumentIds])

  const hypothesisConceptLabels = useMemo(() => {
    if (selectedHypothesisIds.length === 0) return null
    const labels = new Set<string>()
    for (const h of allHypotheses) {
      if (selectedHypothesisIds.includes(h.hypothesis) && h.concept) labels.add(h.concept)
    }
    return labels.size > 0 ? labels : null
  }, [selectedHypothesisIds, allHypotheses])

  const blobs = useMemo(() => {
    if (!hypothesisConceptLabels) return allBlobs
    return allBlobs.filter(b => b.parent_concepts.some(c => hypothesisConceptLabels.has(c)))
  }, [allBlobs, hypothesisConceptLabels])

  useEffect(() => { setScope({ argumentIds: blobs.map(b => b.id) }) }, [blobs])

  // Publish the hypothesis/doc-scoped argument count for the Explore tab badge.
  useEffect(() => { setScopedArgumentCount(blobs.length) }, [blobs, setScopedArgumentCount])

  const { fnodes, fedges, fblobs } = useMemo(() => {
    const sel = new Set(scope.argumentIds)
    // Fast path only when no hypothesis filter is active — otherwise blobs is already
    // narrowed but nodes/edges still covers the full document graph, leaking orphan entities.
    if (sel.size === blobs.length && !hypothesisConceptLabels) {
      return { fnodes: nodes, fedges: edges, fblobs: blobs }
    }
    const fblobs = blobs.filter(b => sel.has(b.id))
    const selEntityIds = new Set(fblobs.flatMap(b => b.entityIds))
    const blobEntityIds = new Set(blobs.flatMap(b => b.entityIds))
    // Hypothesis-filtered: strict — only entities from scoped hypothesis blobs.
    // Concept-panel scope only: preserve unblob'd entity nodes as before.
    const keep = (id: string) =>
      hypothesisConceptLabels ? selEntityIds.has(id) : (!blobEntityIds.has(id) || selEntityIds.has(id))
    const fnodes = nodes.filter(n => n.type !== 'Entity' || keep(n.id))
    const kept = new Set(fnodes.filter(n => n.type === 'Entity').map(n => n.id))
    const fedges = edges.filter(e => kept.has(endId(e.source)) && kept.has(endId(e.target)))
    return { fnodes, fedges, fblobs }
  }, [nodes, edges, blobs, scope, hypothesisConceptLabels])

  // Scoped entity count drives the level-of-detail mode and the demand meter.
  const entityCount = useMemo(() => fnodes.reduce((n, x) => n + (x.type === 'Entity' ? 1 : 0), 0), [fnodes])
  const mode = lodMode(entityCount)

  // "Render anyway" escape from the blocked state — reset once back under the
  // limit, or when the document / hypothesis selection changes.
  useEffect(() => { if (mode !== 'blocked') setForceRender(false) }, [mode])
  useEffect(() => { setForceRender(false) }, [selectedDocumentIds, selectedHypothesisIds])

  const renderMode = mode === 'blocked' && forceRender ? 'lean' : mode
  // Full/Calm graphs stay warm in the background; Lean (heavy) unmounts off-Explore.
  const showGraph = hasActivatedOnce && renderMode !== 'blocked' && (isActive || renderMode !== 'lean')
  const showBlocked = isActive && mode === 'blocked' && !forceRender

  // Surface the concept sidebar so the user can uncheck arguments to get under the limit.
  useEffect(() => { if (showBlocked) setPanelOpen(true) }, [showBlocked])

  return (
    <div className={styles.view} ref={viewRef}>
      {panelOpen && (
        <aside className={styles.sidebar} style={{ width: panelWidth }}>
          <ConceptHierarchy
            blobs={blobs}
            scope={scope}
            onScopeChange={setScope}
            entityCount={entityCount}
            entityLimit={LOD_THRESHOLDS.blocked}
            onConceptHover={setHoveredConceptId}
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
        {showGraph && (
          <GraphCanvasView nodes={fnodes} edges={fedges} blobs={fblobs} isActive={isActive} hoveredConceptId={hoveredConceptId} lod={renderMode} />
        )}
        {showBlocked && (
          <div className={styles.blockedBanner} role="alert">
            <div className={styles.blockedTitle}>Large selection</div>
            <p className={styles.blockedBody}>
              <strong>{entityCount}</strong> entities exceeds the {LOD_THRESHOLDS.blocked}-entity limit.
              Uncheck arguments in the concept panel to get under it.
            </p>
            <button className={styles.blockedBtn} onClick={() => setForceRender(true)}>
              Render anyway <span className={styles.blockedHint}>(may lag)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
