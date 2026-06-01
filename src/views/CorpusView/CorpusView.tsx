import { useRef, useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { CorpusStatsPanel } from './CorpusStatsPanel'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

const DRAWER_HEIGHT = 272

export function CorpusView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [docs, setDocs] = useState<DocNode[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const [minArgCount, setMinArgCount] = useState(0)
  const [minPageCount, setMinPageCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const {
    activeView, selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection,
    clearSelection, selectAll, setSizeBy, sizeBy,
  } = useStore()

  const isActive = activeView === 'corpus'
  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  // Compute extents from raw data
  const argMax = useMemo(() => docs.length ? Math.max(...docs.map(d => d.argument_count)) : 100, [docs])
  const pageMax = useMemo(() => docs.length ? Math.max(...docs.map(d => d.page_count)) : 100, [docs])

  // Filter docs before passing to D3
  const filteredDocs = useMemo(() =>
    docs.filter(d => d.argument_count >= minArgCount && d.page_count >= minPageCount),
    [docs, minArgCount, minPageCount]
  )

  // Size extent for adaptive legend — matches useCorpusD3's sizeScale domain
  const sizeExtent = useMemo<[number, number]>(() => {
    if (!filteredDocs.length || sizeBy === 'uniform') return [0, 0]
    const vals = filteredDocs.map(d => sizeBy === 'argument_count' ? d.argument_count : d.page_count)
    return [Math.min(...vals), Math.max(...vals)]
  }, [filteredDocs, sizeBy])

  useCorpusD3(svgRef, filteredDocs, {
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

  const sizeByLabel = sizeBy === 'argument_count' ? 'arguments' : sizeBy === 'page_count' ? 'pages' : ''

  const filterContent = (
    <>
      <div>
        <div className="sl">Selection</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
            {selectedDocumentIds.length} / {filteredDocs.length} selected
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(filteredDocs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      </div>

      <div>
        <div className="sl">Size by</div>
        {([['argument_count', 'Argument count'], ['page_count', 'Page count'], ['uniform', 'Uniform']] as const).map(([val, lbl]) => (
          <label key={val} style={radioRow}>
            <input type="radio" name="corpus-size" checked={sizeBy === val} onChange={() => setSizeBy(val)}
              style={{ accentColor: '#F4A124' }} />
            <span style={labelText}>{lbl}</span>
          </label>
        ))}
      </div>

      {sizeBy !== 'uniform' && (
        <div>
          <div className="sl">Min {sizeBy === 'argument_count' ? 'arguments' : 'pages'}</div>
          <input type="range" min={0} max={sizeBy === 'argument_count' ? argMax : pageMax} step={1}
            value={sizeBy === 'argument_count' ? minArgCount : minPageCount}
            onChange={e => sizeBy === 'argument_count' ? setMinArgCount(Number(e.target.value)) : setMinPageCount(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
            ≥ {sizeBy === 'argument_count' ? minArgCount : minPageCount}
            <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>
              ({filteredDocs.length} docs shown)
            </span>
          </div>
        </div>
      )}

      {sizeBy === 'uniform' && (minArgCount > 0 || minPageCount > 0) && (
        <div>
          <div className="sl">Active filters</div>
          {minArgCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              <span>Min arguments ≥ {minArgCount}</span>
              <button onClick={() => setMinArgCount(0)} style={clearBtn}>✕</button>
            </div>
          )}
          {minPageCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
              <span>Min pages ≥ {minPageCount}</span>
              <button onClick={() => setMinPageCount(0)} style={clearBtn}>✕</button>
            </div>
          )}
        </div>
      )}
    </>
  )

  const legendContent = (
    <>
      <div>
        <div className="sl">Document dots</div>
        {([['#74b9d6', 'Unselected'], ['#ef476f', 'Selected']] as const).map(([color, lbl]) => (
          <div key={lbl} style={legendRow}>
            <span style={{ ...dot, background: color }} />
            <span style={legendText}>{lbl}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="sl">
          {sizeBy === 'uniform' ? 'Size (uniform)' : `Size by ${sizeByLabel}`}
        </div>
        {sizeBy === 'uniform' ? (
          <div style={legendRow}>
            <span style={{ ...dot, width: 12, height: 12, background: '#74b9d6' }} />
            <span style={legendText}>All documents equal size</span>
          </div>
        ) : (
          <>
            <div style={legendRow}>
              <span style={{ ...dot, width: 8, height: 8, background: '#74b9d6' }} />
              <span style={{ ...legendText, color: '#9ca3af' }}>
                {sizeExtent[0]} {sizeByLabel}
                <span style={{ color: '#d1d5db', marginLeft: 4 }}>(min)</span>
              </span>
            </div>
            <div style={legendRow}>
              <span style={{ ...dot, width: 18, height: 18, background: '#74b9d6' }} />
              <span style={{ ...legendText, color: '#374151' }}>
                {sizeExtent[1]} {sizeByLabel}
                <span style={{ color: '#9ca3af', marginLeft: 4 }}>(max)</span>
              </span>
            </div>
            {filteredDocs.length < docs.length && (
              <div style={{ fontSize: 10, color: '#F4A124', marginTop: 4, fontWeight: 600 }}>
                {docs.length - filteredDocs.length} docs filtered out
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="sl">Interactions</div>
        <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
          <div>Click — select single doc</div>
          <div>Shift+click — multi-select</div>
          <div>Drag — lasso select</div>
          <div>Scroll — zoom in/out</div>
        </div>
      </div>
    </>
  )

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

        <ControlPanel
          isActive={isActive}
          filterContent={filterContent}
          legendContent={legendContent}
          fabBottom={drawerOpen ? DRAWER_HEIGHT + 20 : 20}
          fabLeft={20}
        />

        {/* Corpus stats drawer */}
        <div className={styles.drawer}>
          <button className={styles.drawerTab} onClick={() => setDrawerOpen(v => !v)}>
            <span className={styles.drawerTabLabel}>Corpus Statistics</span>
            <span className={styles.drawerTabArrow}>{drawerOpen ? '▼' : '▲'}</span>
          </button>
          <div className={styles.drawerBody} style={{ height: drawerOpen ? DRAWER_HEIGHT : 0 }}>
            <CorpusStatsPanel docs={filteredDocs} height={DRAWER_HEIGHT} />
          </div>
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const clearBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontSize: 10, color: '#9ca3af', lineHeight: 1,
}
const radioRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }
const labelText: React.CSSProperties = { fontSize: 11, color: '#374151' }
const legendRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }
const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
