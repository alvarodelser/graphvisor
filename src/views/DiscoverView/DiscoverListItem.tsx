import type { Hypothesis } from '../../types'
import { useStore } from '../../store/useStore'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
  highlightDimension?: keyof Hypothesis['scores']
  showConcept?: boolean
  showResearchQuestion?: boolean
}

export function DiscoverListItem({ hypothesis, highlightDimension, showConcept = false, showResearchQuestion = true }: DiscoverListItemProps) {
  const { selectedHypothesisIds, selectHypothesis } = useStore()
  const isSelected = selectedHypothesisIds.includes(hypothesis.hypothesis)

  const handleClick = (e: React.MouseEvent) => {
    if (window.getSelection()?.toString()) return
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
        {showConcept && hypothesis.concept && (
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
        {showResearchQuestion && hypothesis.research_question && (
          <div style={{
            fontSize: 10,
            color: '#6b7280',
            fontStyle: 'italic',
            lineHeight: 1.4,
            marginTop: 5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }} title={hypothesis.research_question}>
            <span style={{ fontWeight: 700, marginRight: 4 }}>[RQ]</span>
            {hypothesis.research_question}
          </div>
        )}
      </div>
      <HypothesisRadarChart scores={hypothesis.scores} highlightDimension={highlightDimension} />
    </div>
  )
}
