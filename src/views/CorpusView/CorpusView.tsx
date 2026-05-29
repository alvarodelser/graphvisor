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
    clearSelection, selectAll, setSizeBy, sizeBy, projection,
  } = useStore()

  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  useCorpusD3(svgRef, docs, {
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
      id: 'selection', label: 'Select',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
            {selectedDocumentIds.length}
          </div>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      ),
    },
    {
      id: 'size', label: 'Size',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {([['argument_count', 'Args'], ['uniform', 'Even'], ['page_count', 'Pages']] as const).map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>
              <input type="radio" name="size" checked={sizeBy === val} onChange={() => setSizeBy(val)} style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
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
        <div className={styles.lassoChip}>LASSO</div>
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
  background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 4,
  padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', width: '100%',
}
