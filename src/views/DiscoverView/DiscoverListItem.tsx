import type { Hypothesis } from '../../types'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
}

export function DiscoverListItem({ hypothesis }: DiscoverListItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.title}>{hypothesis.hypothesis}</div>
      <HypothesisRadarChart scores={hypothesis.scores} />
    </div>
  )
}
