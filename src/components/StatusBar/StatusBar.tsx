import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { currentCollection, dataService } from '../../data/DataService'
import { listCollections, type CollectionInfo } from '../../data/dataset'
import { UserMenu } from '../../auth/UserMenu'
import { chooseCollection } from '../CollectionGate/CollectionGate'
import styles from './StatusBar.module.css'

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
      {collection && <span className={styles.chip}>{collection}</span>}
      {collections.length > 1 && (
        // Back to the collection screen; opening another reloads the page, so
        // no view keeps data from this one.
        <button className={styles.link} onClick={chooseCollection}>All collections</button>
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
      <UserMenu />
    </div>
  )
}
