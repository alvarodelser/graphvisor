import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { currentCollection, dataService } from '../../data/DataService'
import { listCollections, type CollectionInfo } from '../../data/dataset'
import styles from './StatusBar.module.css'

// Switching collection reloads the page with ?collection=<name>, so no view
// keeps data from the previous one.
function switchCollection(name: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('collection', name)
  window.location.assign(url.toString())
}

export function StatusBar() {
  const { selectedDocumentIds, selectedHypothesisIds, discoveredHypothesisCount, filters } = useStore()
  const [totalDocs, setTotalDocs] = useState(0)
  const [collection, setCollection] = useState('')
  const [collections, setCollections] = useState<CollectionInfo[]>([])

  useEffect(() => {
    dataService.getDocuments().then(d => {
      setTotalDocs(d.length)
      setCollection(currentCollection())
    })
    listCollections().then(setCollections).catch(() => setCollections([]))
  }, [])

  const n = selectedDocumentIds.length
  const h = selectedHypothesisIds.length

  return (
    <div className={styles.bar}>
      {collections.length > 1 ? (
        <select
          className={styles.select}
          aria-label="Collection"
          value={collection}
          onChange={e => switchCollection(e.target.value)}
        >
          {collections.map(c => (
            <option key={c.name} value={c.name} disabled={c.status !== 'ready'}>
              {c.status === 'ready' ? c.name : `${c.name} (${c.status} ${c.done + c.failed}/${c.expected})`}
            </option>
          ))}
        </select>
      ) : (
        collection && <span className={styles.chip}>{collection}</span>
      )}
      {collection && <span className={styles.dot}>·</span>}
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
