import { useStore } from '../../store/useStore'
import styles from './StatusBar.module.css'

export function StatusBar() {
  const { selectedDocumentIds, filters, projection } = useStore()
  return (
    <div className={styles.bar}>
      <span className={styles.chip}>
        {selectedDocumentIds.length} doc{selectedDocumentIds.length !== 1 ? 's' : ''} selected
      </span>
      <span className={styles.dot}>·</span>
      <span className={styles.chip}>{projection.toUpperCase()}</span>
      <span className={styles.dot}>·</span>
      <span className={styles.chip}>conf ≥ {filters.minConfidence.toFixed(2)}</span>
    </div>
  )
}
