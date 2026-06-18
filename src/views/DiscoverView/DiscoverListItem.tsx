import type { Hypothesis } from '../../types'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
}

const DIMENSIONS: { key: keyof Hypothesis['scores']; label: string }[] = [
  { key: 'novelty',                  label: 'Novelty' },
  { key: 'scientific_plausibility',  label: 'Sci. Plausibility' },
  { key: 'potential_impact',         label: 'Potential Impact' },
  { key: 'commercial_potential',     label: 'Commercial' },
]

export function DiscoverListItem({ hypothesis }: DiscoverListItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.title}>{hypothesis.hypothesis}</div>
      <div className={styles.right}>
        <div className={styles.legend}>
          {DIMENSIONS.map(({ key, label }) => (
            <div key={key} className={styles.legendRow}>
              <span className={styles.dot} />
              <span className={styles.dimLabel}>{label}</span>
              <span className={styles.dimScore}>{hypothesis.scores[key].toFixed(1)}</span>
            </div>
          ))}
        </div>
        <HypothesisRadarChart scores={hypothesis.scores} />
      </div>
    </div>
  )
}
