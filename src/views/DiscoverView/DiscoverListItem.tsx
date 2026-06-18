import type { Hypothesis } from '../../types'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
}

const DIMENSIONS: { key: keyof Hypothesis['scores']; label: string }[] = [
  { key: 'novelty',                 label: 'Novelty' },
  { key: 'scientific_plausibility', label: 'Sci. Plausibility' },
  { key: 'potential_impact',        label: 'Potential Impact' },
  { key: 'commercial_potential',    label: 'Commercial' },
]

export function DiscoverListItem({ hypothesis }: DiscoverListItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.left}>
        <div className={styles.title}>{hypothesis.hypothesis}</div>
        <div className={styles.pills}>
          {DIMENSIONS.map(({ key, label }) => (
            <span key={key} className={styles.pill}>
              <span className={styles.dot} />
              {label}
              <strong className={styles.pillScore}>{hypothesis.scores[key].toFixed(1)}</strong>
            </span>
          ))}
        </div>
      </div>
      <HypothesisRadarChart scores={hypothesis.scores} />
    </div>
  )
}
