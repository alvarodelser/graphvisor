import { useState, useEffect, useMemo } from 'react'
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
  const { activeView, selectedDocumentIds } = useStore()

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
    <div className={styles.view}>
      {panelOpen && (
        <aside className={styles.sidebar}>
          <ConceptHierarchy blobs={blobs} scope={scope} onScopeChange={setScope} />
        </aside>
      )}

      <div className={styles.canvas}>
        <button
          className={styles.panelToggle}
          onClick={() => setPanelOpen(o => !o)}
          title={panelOpen ? 'Hide concept panel' : 'Show concept panel'}
        >
          {panelOpen ? '⇤' : '⇥'} Concepts
        </button>

        <GraphCanvasView nodes={fnodes} edges={fedges} blobs={fblobs} isActive={isActive} />
      </div>
    </div>
  )
}
