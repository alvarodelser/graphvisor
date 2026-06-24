import { useEffect, useState, useMemo, useCallback } from 'react'
import { dataService } from '../../data/DataService'
import { useStore } from '../../store/useStore'
import { DiscoverListItem } from './DiscoverListItem'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

import type { CSSProperties } from 'react'

type SortKey = 'overall' | 'novelty' | 'scientific_plausibility' | 'potential_impact' | 'commercial_potential'

const dEyeBtn = (on: boolean): CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
  color: on ? '#073b4c' : '#9ca3af', display: 'flex', alignItems: 'center',
})

const eyeOpen = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <ellipse cx="12" cy="12" rx="10" ry="6" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)
const eyeSlash = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 3l18 18M10.58 10.58A3 3 0 0 0 14.83 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.4 18.4 0 0 1-3.1 4.1M6.5 6.5A18.4 18.4 0 0 0 1 12s4 8 11 8a9 9 0 0 0 5.76-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)

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

  const [showConcepts, setShowConcepts] = useState(false)
  const [showResearchQuestions, setShowResearchQuestions] = useState(true)

  const [copied, setCopied] = useState(false)

  const hypothesesToCopy = useMemo(() => {
    if (selectedHypothesisIds.length === 0) return sorted
    return sorted.filter(h => selectedHypothesisIds.includes(h.hypothesis))
  }, [sorted, selectedHypothesisIds])

  const copyAll = useCallback(() => {
    const text = hypothesesToCopy
      .map((h, i) => {
        let entry = `${i + 1}. ${h.hypothesis}`
        if (h.research_question) entry += `\n   ${h.research_question}`
        return entry
      })
      .join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }, [hypothesesToCopy])

  const allIds = filteredHypotheses.map(h => h.hypothesis)
  const allSelected = allIds.length > 0 && allIds.every(id => selectedHypothesisIds.includes(id))

  const filterContent = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="sl">Show concept badges</span>
        <button onClick={() => setShowConcepts(v => !v)} style={dEyeBtn(showConcepts)} title={showConcepts ? 'Hide' : 'Show'}>
          {showConcepts ? eyeOpen : eyeSlash}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="sl">Show research questions</span>
        <button onClick={() => setShowResearchQuestions(v => !v)} style={dEyeBtn(showResearchQuestions)} title={showResearchQuestions ? 'Hide' : 'Show'}>
          {showResearchQuestions ? eyeOpen : eyeSlash}
        </button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="sl">Argument confidence</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>≥ {filters.minConfidence.toFixed(2)}</span>
        </div>
        <input type="range" className="styled-slider" min={0} max={1} step={0.05}
          value={filters.minConfidence}
          onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
          style={{ '--pct': `${filters.minConfidence * 100}%`, '--slider-fill': '#F4A124' } as React.CSSProperties}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="sl">Concept similarity</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>≥ {conceptSimilarityThreshold.toFixed(2)}</span>
        </div>
        <input type="range" className="styled-slider" min={0} max={1} step={0.05}
          value={conceptSimilarityThreshold}
          onChange={e => setConceptSimilarityThreshold(Number(e.target.value))}
          style={{ '--pct': `${conceptSimilarityThreshold * 100}%`, '--slider-fill': '#F4A124' } as React.CSSProperties}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="sl">Concept aggregate</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>≥ {conceptAggregateThreshold.toFixed(1)}</span>
        </div>
        <input type="range" className="styled-slider" min={0} max={10} step={0.5}
          value={conceptAggregateThreshold}
          onChange={e => setConceptAggregateThreshold(Number(e.target.value))}
          style={{ '--pct': `${conceptAggregateThreshold * 10}%`, '--slider-fill': '#F4A124' } as React.CSSProperties}
        />
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
          <button
            className={styles.selBtn}
            onClick={copyAll}
            title="Copy hypotheses to clipboard"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="5" y="4" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {copied
              ? 'Copied!'
              : `Copy ${hypothesesToCopy.length} hypothes${hypothesesToCopy.length === 1 ? 'is' : 'es'} to clipboard`}
          </button>
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
            showConcept={showConcepts}
            showResearchQuestion={showResearchQuestions}
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
