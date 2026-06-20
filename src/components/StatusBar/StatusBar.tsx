import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import styles from './StatusBar.module.css'

export function StatusBar() {
  const { selectedDocumentIds, selectedHypothesisIds, discoveredHypothesisCount, filters } = useStore()
  const [totalDocs, setTotalDocs] = useState(0)

  useEffect(() => {
    dataService.getDocuments().then(d => setTotalDocs(d.length))
  }, [])

  const n = selectedDocumentIds.length
  const h = selectedHypothesisIds.length

  return (
    <div className={styles.bar}>
      <span className={styles.chip}>
        {n}/{totalDocs} docs selected
      </span>
      {h > 0 && (
        <>
          <span className={styles.chevron}>›</span>
          <span className={styles.chip}>
            {h}/{discoveredHypothesisCount} hypotheses
          </span>
        </>
      )}
      <span className={styles.dot}>·</span>
      <span className={styles.chip}>conf ≥ {filters.minConfidence.toFixed(2)}</span>
    </div>
  )
}
