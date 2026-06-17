import { useEffect, useState } from 'react'
import { dataService } from '../../data/DataService'
import { DiscoverListItem } from './DiscoverListItem'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

export function DiscoverView() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])

  useEffect(() => {
    dataService.getHypotheses().then(setHypotheses)
  }, [])

  return (
    <div className={styles.view}>
      <div className={styles.list}>
        {hypotheses.map((h) => (
          <DiscoverListItem key={h.hypothesis} hypothesis={h} />
        ))}
      </div>
    </div>
  )
}
