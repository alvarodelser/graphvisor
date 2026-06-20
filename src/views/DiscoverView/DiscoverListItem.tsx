import type { Hypothesis } from '../../types'
import { useStore } from '../../store/useStore'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
  highlightDimension?: keyof Hypothesis['scores']
}

export function DiscoverListItem({ hypothesis, highlightDimension }: DiscoverListItemProps) {
  const { selectedHypothesisIds, selectHypothesis } = useStore()
  const isSelected = selectedHypothesisIds.includes(hypothesis.hypothesis)

  const handleClick = (e: React.MouseEvent) => {
    selectHypothesis(hypothesis.hypothesis, e.shiftKey)
  }

  return (
    <div
      className={[styles.item, isSelected ? styles.selected : ''].join(' ')}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && selectHypothesis(hypothesis.hypothesis, false)}
    >
      <div className={styles.left}>
        {hypothesis.concept && (
          <span style={{
            alignSelf: 'flex-start', display: 'inline-block', fontSize: 9, fontWeight: 600,
            color: '#8b5cf6', background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10,
            padding: '1px 7px', marginBottom: 5, letterSpacing: '0.03em',
          }}>
            {hypothesis.concept}
          </span>
        )}
        <div className={styles.title}>{hypothesis.hypothesis}</div>
      </div>
      <HypothesisRadarChart scores={hypothesis.scores} highlightDimension={highlightDimension} />
    </div>
  )
}
