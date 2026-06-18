import { useEffect, useState, useMemo } from 'react'
import { dataService } from '../../data/DataService'
import { useStore } from '../../store/useStore'
import { DiscoverListItem } from './DiscoverListItem'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

type SortKey = 'overall' | 'novelty' | 'scientific_plausibility' | 'potential_impact' | 'commercial_potential'
type SortDir = 'desc' | 'asc'

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
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('overall')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const { selectedHypothesisIds, selectAllHypotheses, clearHypothesisSelection } = useStore()

  useEffect(() => {
    dataService.getHypotheses().then(setHypotheses)
  }, [])

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1
    return [...hypotheses].sort((a, b) => {
      const va = sortBy === 'overall' ? overallScore(a) : a.scores[sortBy]
      const vb = sortBy === 'overall' ? overallScore(b) : b.scores[sortBy]
      return (va - vb) * dir
    })
  }, [hypotheses, sortBy, sortDir])

  const allIds = hypotheses.map((h) => h.hypothesis)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedHypothesisIds.includes(id))

  const toggleDir = () => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <div className={styles.sortGroup}>
          <span className={styles.sortLabel}>Sort</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              className={[styles.sortPill, sortBy === key ? styles.sortPillActive : ''].join(' ')}
              onClick={() => sortBy === key ? toggleDir() : setSortBy(key)}
            >
              {label}
              {sortBy === key && (
                <span className={styles.sortArrow}>{sortDir === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.selectionGroup}>
          <button
            className={styles.selBtn}
            onClick={() => allSelected ? clearHypothesisSelection() : selectAllHypotheses(allIds)}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          {selectedHypothesisIds.length > 0 && !allSelected && (
            <button className={styles.selBtn} onClick={clearHypothesisSelection}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div className={styles.list}>
        {sorted.map((h) => (
          <DiscoverListItem key={h.hypothesis} hypothesis={h} />
        ))}
      </div>
    </div>
  )
}
