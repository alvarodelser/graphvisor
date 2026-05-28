import { useRef, useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [docs, setDocs] = useState<DocNode[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection,
    clearSelection, selectAll, projection, setSizeBy, setProjection, sizeBy,
  } = useStore()

  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  const { zoomToFit, resetZoom } = useCorpusD3(svgRef, docs, {
    selectedIds,
    projection,
    sizeBy,
    onLassoSelect: (ids) =>
      setSelectedDocuments([...new Set([...selectedDocumentIds, ...ids])]),
    onClickToggle: (id, shiftKey) => {
      if (shiftKey) toggleDocumentSelection(id)
      else setSelectedDocuments(selectedDocumentIds.includes(id) ? [] : [id])
    },
    setTooltip,
  })

  const railSections = [
    {
      id: 'selection', icon: '◻', label: 'Selection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
            {selectedDocumentIds.length} selected
          </div>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      ),
    },
    {
      id: 'projection', icon: '⊕', label: 'Projection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['umap', 'pca'] as const).map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" name="proj" checked={projection === p} onChange={() => setProjection(p)} style={{ accentColor: '#073b4c' }} />
              {p.toUpperCase()}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'size', icon: '◉', label: 'Size nodes by',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([['argument_count', 'Arg count'], ['uniform', 'Uniform'], ['page_count', 'Page count']] as const).map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" name="size" checked={sizeBy === val} onChange={() => setSizeBy(val)} style={{ accentColor: '#073b4c' }} />
              {lbl}
            </label>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.view}>
      <FilterRail sections={railSections} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={zoomToFit}>Fit</button>
          <button className={styles.toolBtn} onClick={resetZoom}>Reset</button>
        </div>
        {tooltip && (
          <FloatingCard style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
              {tooltip.doc.title}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {tooltip.doc.page_count} pages · {tooltip.doc.argument_count} arguments
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
              {tooltip.doc.top_terms.join(' · ')}
            </div>
          </FloatingCard>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
