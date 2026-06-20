import { useEffect, useState, useMemo } from 'react'
import { dataService } from '../../data/DataService'
import { useStore } from '../../store/useStore'
import { DiscoverListItem } from './DiscoverListItem'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

type SortKey = 'overall' | 'novelty' | 'scientific_plausibility' | 'potential_impact' | 'commercial_potential'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'overall',                 label: 'Overall' },
  { key: 'novelty',                 label: 'Novelty' },
  { key: 'scientific_plausibility', label: 'Sci. Plausibility' },
  { key: 'potential_impact',        label: 'Impact' },
  { key: 'commercial_potential',    label: 'Commercial' },
]

function overallScore(h: Hypothesis) {
  const s = h.scores
  return (s.novelty + s.scientific_plausibility + s.potential_impact + s.commercial_potential) / 4
}

export function DiscoverView() {
  const [allHypotheses, setAllHypotheses] = useState<Hypothesis[]>([])
  const [filteredHypotheses, setFilteredHypotheses] = useState<Hypothesis[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('overall')

  const {
    activeView, setActiveView,
    selectedDocumentIds,
    selectedHypothesisIds, selectAllHypotheses, clearHypothesisSelection,
    setPendingEvidenceOnly,
    filters, setFilters,
    conceptSimilarityThreshold, setConceptSimilarityThreshold,
    conceptAggregateThreshold, setConceptAggregateThreshold,
    setDiscoveredHypothesisCount,
  } = useStore()

  const exploreEvidenceOnly = () => {
    setPendingEvidenceOnly(true)
    setActiveView('graph')
  }

  const isActive = activeView === 'discover'

  useEffect(() => {
    dataService.getHypotheses().then(h => {
      setAllHypotheses(h)
      setFilteredHypotheses(h)
      setDiscoveredHypothesisCount(h.length)
    })
  }, [])

  useEffect(() => {
    if (!allHypotheses.length) return

    if (selectedDocumentIds.length === 0) {
      setFilteredHypotheses(allHypotheses)
      setDiscoveredHypothesisCount(allHypotheses.length)
      return
    }

    dataService.getConceptsForDocuments(
      selectedDocumentIds,
      filters.minConfidence,
      conceptSimilarityThreshold,
    ).then(conceptScores => {
      const passing = new Set(
        conceptScores
          .filter(c => c.score >= conceptAggregateThreshold)
          .map(c => c.concept)
      )
      const filtered = allHypotheses.filter(h => !h.concept || passing.has(h.concept))
      setFilteredHypotheses(filtered)
      setDiscoveredHypothesisCount(filtered.length)
    })
  }, [allHypotheses, selectedDocumentIds, filters.minConfidence, conceptSimilarityThreshold, conceptAggregateThreshold])

  const sorted = useMemo(() => {
    return [...filteredHypotheses].sort((a, b) => {
      const va = sortBy === 'overall' ? overallScore(a) : a.scores[sortBy]
      const vb = sortBy === 'overall' ? overallScore(b) : b.scores[sortBy]
      return vb - va
    })
  }, [filteredHypotheses, sortBy])

  const allIds = filteredHypotheses.map(h => h.hypothesis)
  const allSelected = allIds.length > 0 && allIds.every(id => selectedHypothesisIds.includes(id))

  const filterContent = (
    <>
      <div>
        <div className="sl">Argument confidence</div>
        <input type="range" min={0} max={1} step={0.05}
          value={filters.minConfidence}
          onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
          style={{ width: '100%', accentColor: '#8b5cf6', marginBottom: 4 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>
          ≥ {filters.minConfidence.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="sl">Concept similarity</div>
        <input type="range" min={0} max={1} step={0.05}
          value={conceptSimilarityThreshold}
          onChange={e => setConceptSimilarityThreshold(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#8b5cf6', marginBottom: 4 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>
          ≥ {conceptSimilarityThreshold.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="sl">Concept aggregate score</div>
        <input type="range" min={0} max={10} step={0.5}
          value={conceptAggregateThreshold}
          onChange={e => setConceptAggregateThreshold(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#8b5cf6', marginBottom: 4 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>
          ≥ {conceptAggregateThreshold.toFixed(1)}
        </div>
      </div>
    </>
  )

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <div className={styles.sortGroup}>
          <span className={styles.sortLabel}>Sort by</span>
          <div className={styles.selectWrap}>
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <svg className={styles.selectChevron} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div className={styles.selectionGroup}>
          {selectedDocumentIds.length > 0 && (
            <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600, marginRight: 6 }}>
              {filteredHypotheses.length} hypotheses
            </span>
          )}
          <button
            className={styles.selBtn}
            onClick={() => allSelected ? clearHypothesisSelection() : selectAllHypotheses(allIds)}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          {selectedHypothesisIds.length > 0 && !allSelected && (
            <button className={styles.selBtn} onClick={clearHypothesisSelection}>Clear</button>
          )}
          {selectedHypothesisIds.length > 0 && (
            <button className={styles.evidenceBtn} onClick={exploreEvidenceOnly}>
              Explore evidence only
            </button>
          )}
        </div>
      </div>
      <div className={styles.list}>
        {sorted.map(h => (
          <DiscoverListItem
            key={h.hypothesis}
            hypothesis={h}
            highlightDimension={sortBy === 'overall' ? undefined : sortBy}
          />
        ))}
      </div>
      <ControlPanel
        isActive={isActive}
        filterContent={filterContent}
        fabBottom={20}
        fabLeft={20}
      />
    </div>
  )
}
