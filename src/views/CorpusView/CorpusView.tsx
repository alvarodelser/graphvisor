import { useRef, useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingPanel } from '../../components/FloatingPanel/FloatingPanel'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [docs, setDocs] = useState<DocNode[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection,
    clearSelection, selectAll, setSizeBy, sizeBy,
  } = useStore()

  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  useCorpusD3(svgRef, docs, {
    selectedIds,
    sizeBy,
    onLassoSelect: (ids) =>
      setSelectedDocuments([...new Set([...selectedDocumentIds, ...ids])]),
    onClickToggle: (id, shiftKey) => {
      if (shiftKey) toggleDocumentSelection(id)
      else setSelectedDocuments(selectedDocumentIds.includes(id) ? [] : [id])
    },
    setTooltip,
  })

  return (
    <div className={styles.view}>
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

        {/* Filter FAB */}
        <FloatingPanel
          icon="⚙" label="Filters"
          open={filterOpen} onToggle={() => setFilterOpen(v => !v)}
          fabBottom={20} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Selection</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
                {selectedDocumentIds.length} selected
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={clearSelection} style={btnStyle}>Clear</button>
              <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Size by</div>
            {([['argument_count', 'Argument count'], ['uniform', 'Uniform'], ['page_count', 'Page count']] as const).map(([val, lbl]) => (
              <label key={val} style={radioRow}>
                <input type="radio" name="corpus-size" checked={sizeBy === val} onChange={() => setSizeBy(val)}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ fontSize: 11, color: '#374151' }}>{lbl}</span>
              </label>
            ))}
          </div>
        </FloatingPanel>

        {/* Legend FAB */}
        <FloatingPanel
          icon="◈" label="Legend"
          open={legendOpen} onToggle={() => setLegendOpen(v => !v)}
          fabBottom={68} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Document dots</div>
            {([['#74b9d6', 'Unselected'], ['#ef476f', 'Selected']] as const).map(([color, lbl]) => (
              <div key={lbl} style={legendRow}>
                <span style={{ ...dot, background: color }} />
                <span style={legendText}>{lbl}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={sectionLabel}>Size</div>
            {([['10px', 'High argument / page count'], ['5px', 'Low argument / page count']] as const).map(([size, lbl]) => (
              <div key={lbl} style={legendRow}>
                <span style={{ ...dot, width: size, height: size, background: '#74b9d6', flexShrink: 0 }} />
                <span style={legendText}>{lbl}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#073b4c', opacity: 0.5, marginBottom: 8,
}
const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const radioRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
}
const legendRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
}
const dot: React.CSSProperties = {
  width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
}
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
