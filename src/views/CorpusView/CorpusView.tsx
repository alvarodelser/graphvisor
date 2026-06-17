import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import { CorpusViewSwitcher } from './CorpusViewSwitcher'
import { MapView } from './MapView'
import { TopicsView } from './TopicsView'
import { TimelineView } from './TimelineView'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const [docs, setDocs] = useState<DocNode[]>([])
  const [minArgCount, setMinArgCount] = useState(0)
  const [minImpact, setMinImpact] = useState(0)
  const {
    activeView, corpusViewMode, setCorpusViewMode,
    selectedDocumentIds, clearSelection, selectAll, setSizeBy, sizeBy,
  } = useStore()

  const isActive = activeView === 'corpus'
  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  const argMax = useMemo(() => docs.length ? Math.max(...docs.map(d => d.argument_count)) : 100, [docs])
  const impactMax = useMemo(() => docs.length ? Math.max(...docs.map(d => d.citations)) : 100, [docs])

  const filteredDocs = useMemo(
    () => docs.filter(d => d.argument_count >= minArgCount && d.citations >= minImpact),
    [docs, minArgCount, minImpact],
  )

  const sizeExtent = useMemo<[number, number]>(() => {
    if (!filteredDocs.length || sizeBy === 'uniform') return [0, 0]
    const vals = filteredDocs.map(d => sizeBy === 'argument_count' ? d.argument_count : d.citations)
    return [Math.min(...vals), Math.max(...vals)]
  }, [filteredDocs, sizeBy])

  const sizeByLabel = sizeBy === 'argument_count' ? 'arguments' : sizeBy === 'impact' ? 'citations' : ''

  const filterContent = (
    <>
      <div>
        <div className="sl">Selection</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#ef476f' }}>
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
        {([['argument_count', 'Argument count'], ['impact', 'Impact (citations)'], ['uniform', 'Uniform']] as const).map(([val, lbl]) => (
          <label key={val} style={radioRow}>
            <input type="radio" name="corpus-size" checked={sizeBy === val} onChange={() => setSizeBy(val)}
              style={{ accentColor: '#F4A124' }} />
            <span style={labelText}>{lbl}</span>
          </label>
        ))}
      </div>

      {sizeBy !== 'uniform' && (
        <div>
          <div className="sl">Min {sizeBy === 'argument_count' ? 'arguments' : 'citations'}</div>
          <input type="range" min={0} max={sizeBy === 'argument_count' ? argMax : impactMax} step={1}
            value={sizeBy === 'argument_count' ? minArgCount : minImpact}
            onChange={e => sizeBy === 'argument_count' ? setMinArgCount(Number(e.target.value)) : setMinImpact(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
            ≥ {sizeBy === 'argument_count' ? minArgCount : minImpact}
            <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>
              ({filteredDocs.length} docs shown)
            </span>
          </div>
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

      {sizeBy !== 'uniform' && corpusViewMode !== 'topics' && (
        <div>
          <div className="sl">Size by {sizeByLabel}</div>
          <div style={legendRow}>
            <span style={{ ...dot, width: 8, height: 8, background: '#74b9d6' }} />
            <span style={{ ...legendText, color: '#9ca3af' }}>{sizeExtent[0]} {sizeByLabel} (min)</span>
          </div>
          <div style={legendRow}>
            <span style={{ ...dot, width: 18, height: 18, background: '#74b9d6' }} />
            <span style={{ ...legendText, color: '#374151' }}>{sizeExtent[1]} {sizeByLabel} (max)</span>
          </div>
        </div>
      )}

      <div>
        <div className="sl">Interactions</div>
        <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
          <div>Click — select single doc</div>
          <div>Shift+click — multi-select</div>
          {corpusViewMode === 'map' && <div>Drag — lasso select</div>}
          {corpusViewMode === 'topics' && <div>Click tile — select topic</div>}
        </div>
      </div>
    </>
  )

  return (
    <div className={styles.view}>
      <div className={styles.canvas}>
        <CorpusViewSwitcher mode={corpusViewMode} onChange={setCorpusViewMode} />

        {corpusViewMode === 'map' && <MapView docs={filteredDocs} selectedIds={selectedIds} />}
        {corpusViewMode === 'topics' && <TopicsView docs={filteredDocs} selectedIds={selectedIds} />}
        {corpusViewMode === 'timeline' && <TimelineView docs={filteredDocs} selectedIds={selectedIds} />}

        <ControlPanel
          isActive={isActive}
          filterContent={filterContent}
          legendContent={legendContent}
          fabBottom={20}
          fabLeft={20}
        />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const radioRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }
const labelText: React.CSSProperties = { fontSize: 11, color: '#374151' }
const legendRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }
const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
