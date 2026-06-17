import type { Hypothesis } from '../../types'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
}

export function DiscoverListItem({ hypothesis }: DiscoverListItemProps) {
  const avgScore = (
    (hypothesis.scores.novelty +
      hypothesis.scores.scientific_plausibility +
      hypothesis.scores.potential_impact +
      hypothesis.scores.commercial_potential) /
    4
  ).toFixed(1)

  return (
    <div className={styles.item}>
      <div className={styles.title}>{hypothesis.hypothesis}</div>
      <div className={styles.chart}>
        <span className={styles.score}>{avgScore}</span>
        <HypothesisRadarChart scores={hypothesis.scores} size={60} />
      </div>
    </div>
  )
}
