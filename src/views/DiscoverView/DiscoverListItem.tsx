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

function scoreColor(score: number) {
  const hue = Math.round((score / 10) * 135)
  return {
    dot:    `hsl(${hue}, 72%, 42%)`,
    bg:     `hsla(${hue}, 72%, 50%, 0.08)`,
    border: `hsla(${hue}, 72%, 50%, 0.28)`,
    text:   `hsl(${hue}, 60%, 28%)`,
  }
}

export function DiscoverListItem({ hypothesis }: DiscoverListItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.left}>
        <div className={styles.title}>{hypothesis.hypothesis}</div>
        <div className={styles.pills}>
          {DIMENSIONS.map(({ key, label }) => {
            const score = hypothesis.scores[key]
            const c = scoreColor(score)
            return (
              <span
                key={key}
                className={styles.pill}
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
              >
                <span className={styles.dot} style={{ background: c.dot }} />
                {label}
                <strong className={styles.pillScore}>{score.toFixed(1)}</strong>
              </span>
            )
          })}
        </div>
      </div>
      <HypothesisRadarChart scores={hypothesis.scores} />
    </div>
  )
}
