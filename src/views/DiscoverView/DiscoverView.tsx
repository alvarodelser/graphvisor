import { useEffect, useMemo, useState } from 'react'
import { dataService } from '../../data/DataService'
import { HypothesisCard } from './HypothesisCard'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

type FilterDecision = 'all' | 'ADVANCE' | 'BORDERLINE'
type SortBy = 'avg' | 'novelty' | 'scientific_plausibility' | 'potential_impact' | 'commercial_potential'

function avg(h: Hypothesis): number {
  const { novelty, scientific_plausibility, potential_impact, commercial_potential } = h.scores
  return (novelty + scientific_plausibility + potential_impact + commercial_potential) / 4
}

export function DiscoverView() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [filterDecision, setFilterDecision] = useState<FilterDecision>('all')
  const [sortBy, setSortBy] = useState<SortBy>('avg')

  useEffect(() => {
    dataService.getHypotheses().then(setHypotheses)
  }, [])

  const advanceCount = hypotheses.filter(h => h.decision === 'ADVANCE').length
  const borderlineCount = hypotheses.filter(h => h.decision === 'BORDERLINE').length

  const displayed = useMemo(() => {
    const filtered = filterDecision === 'all'
      ? hypotheses
      : hypotheses.filter(h => h.decision === filterDecision)
    return [...filtered].sort((a, b) => {
      const va = sortBy === 'avg' ? avg(a) : a.scores[sortBy]
      const vb = sortBy === 'avg' ? avg(b) : b.scores[sortBy]
      return vb - va
    })
  }, [hypotheses, filterDecision, sortBy])

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <span className={styles.title}>Discovered Hypotheses</span>

        <button
          className={[styles.filterChip, styles.filterChipAll, filterDecision === 'all' ? styles.filterActive : ''].join(' ')}
          onClick={() => setFilterDecision('all')}
        >
          All {hypotheses.length}
        </button>
        <button
          className={[styles.filterChip, styles.filterChipAdvance, filterDecision === 'ADVANCE' ? styles.filterActive : ''].join(' ')}
          onClick={() => setFilterDecision('ADVANCE')}
        >
          ADVANCE {advanceCount}
        </button>
        <button
          className={[styles.filterChip, styles.filterChipBorderline, filterDecision === 'BORDERLINE' ? styles.filterActive : ''].join(' ')}
          onClick={() => setFilterDecision('BORDERLINE')}
        >
          BORDERLINE {borderlineCount}
        </button>

        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
        >
          <option value="avg">Sort: Avg score ↓</option>
          <option value="novelty">Sort: Novelty ↓</option>
          <option value="scientific_plausibility">Sort: Plausibility ↓</option>
          <option value="potential_impact">Sort: Impact ↓</option>
          <option value="commercial_potential">Sort: Commercial ↓</option>
        </select>
      </div>

      <div className={styles.grid}>
        {displayed.map((h) => (
          <HypothesisCard key={h.hypothesis} hypothesis={h} />
        ))}
      </div>
    </div>
  )
}
