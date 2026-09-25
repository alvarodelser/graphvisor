import { useState, type ReactNode } from 'react'
import type { Hypothesis } from '../types'
import { CRITERIA, type ApiScores, type HypothesisVerdict } from './evaluationApi'
import { useEvaluations } from './useEvaluations'
import styles from './Evaluation.module.css'

const VERDICTS: { value: HypothesisVerdict; label: string }[] = [
  { value: 'promising', label: 'Promising' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'not_useful', label: 'Not useful' },
]

type Draft = Partial<ApiScores>

const clamp = (v: number) => Math.min(10, Math.max(1, v))

function modelScores(h: Hypothesis): ApiScores {
  return Object.fromEntries(CRITERIA.map(c => [c.api, clamp(h.scores[c.key])])) as ApiScores
}

// A quick verdict first (one click, saved at once), then an optional second
// step: would you adjust the model's four scores? and a comment. For the
// user's blind share the scores start empty and the model's stay hidden
// until they've rated.
export function HypothesisRating({ hypothesis }: { hypothesis: Hypothesis }) {
  const id = hypothesis.id
  const mine = useEvaluations(s => (id ? s.hypotheses[id] : undefined))
  const rate = useEvaluations(s => s.rateHypothesis)
  const setScoringBlind = useEvaluations(s => s.setScoringBlind)
  const [open, setOpenState] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  if (!id) return null

  const blind = !!hypothesis.blind
  // Blind and not scored yet: the model's scores stay out of sight meanwhile.
  const hideModel = blind && mine?.human_novelty == null
  const setOpen = (v: boolean) => {
    setOpenState(v)
    if (blind) setScoringBlind(v && hideModel ? id : null)
  }
  const startDraft = (): Draft => {
    if (mine?.human_novelty != null) {
      return Object.fromEntries(CRITERIA.map(c => [c.api, mine[`human_${c.api}` as const]])) as Draft
    }
    return blind ? {} : modelScores(hypothesis)
  }

  const pickVerdict = async (verdict: HypothesisVerdict) => {
    setError(null)
    try {
      await rate(id, verdict, undefined, mine?.comment ?? null)
      if (!open) { setDraft(startDraft()); setComment(mine?.comment ?? ''); setOpen(true); setSaved(false) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const complete = CRITERIA.every(c => draft[c.api] != null)
  const touched = CRITERIA.some(c => draft[c.api] != null)

  const save = async () => {
    if (!mine) return
    if (touched && !complete) { setError('Set all four scores, or none'); return }
    setError(null)
    try {
      await rate(id, mine.verdict, complete ? (draft as ApiScores) : undefined, comment.trim() || null)
      setSaved(true)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const model = modelScores(hypothesis)
  return (
    // Clicks here rate; they must not select or deselect the hypothesis.
    <div className={styles.rating} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <div className={styles.verdictRow}>
        {VERDICTS.map(v => (
          <button key={v.value} type="button"
            className={`${styles.pill} ${styles[v.value]} ${mine?.verdict === v.value ? styles.pillOn : ''}`}
            aria-pressed={mine?.verdict === v.value}
            onClick={() => pickVerdict(v.value)}>
            {v.label}
          </button>
        ))}
        {mine && !open && (
          <button type="button" className={styles.link}
            onClick={() => { setDraft(startDraft()); setComment(mine.comment ?? ''); setOpen(true); setSaved(false) }}>
            {mine.human_novelty != null || mine.comment ? 'Edit scores & comment' : 'Adjust scores ▸'}
          </button>
        )}
        {saved && !open && <span className={styles.saved}>Saved</span>}
      </div>
      {open && mine && (
        <div className={styles.followUp}>
          <div className={styles.followHead}>
            {hideModel
              ? 'How would you score it? The model’s scores show once you save.'
              : 'Would you adjust the scores?'}
          </div>
          {CRITERIA.map(c => {
            const value = draft[c.api]
            return (
              <label key={c.api} className={styles.scoreRow}>
                <span className={styles.scoreLabel}>{c.label}</span>
                <input type="range" className="styled-slider" min={1} max={10} step={1}
                  value={value ?? 5.5}
                  data-unset={value == null || undefined}
                  onChange={e => setDraft(d => ({ ...d, [c.api]: Number(e.target.value) }))}
                  style={{ '--pct': `${value == null ? 0 : ((value - 1) / 9) * 100}%`, '--slider-fill': '#073b4c' } as React.CSSProperties}
                />
                <span className={styles.scoreValue}>{value == null ? '–' : Number.isInteger(value) ? value : value.toFixed(1)}</span>
                {!hideModel && value != null && Math.abs(value - model[c.api]) > 1e-6 && (
                  <span className={styles.modelScore} title="The model's score">model {model[c.api].toFixed(1)}</span>
                )}
              </label>
            )
          })}
          <textarea className={styles.comment} rows={2} placeholder="Anything to add? (optional)"
            value={comment} onChange={e => setComment(e.target.value)} maxLength={5000} />
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={save}>Save</button>
            <button type="button" className={styles.link} onClick={() => setOpen(false)}>Not now</button>
          </div>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  )
}

// The radar, blurred behind "Rate to reveal" for a blind hypothesis not yet rated.
export function BlindRadar({ hypothesis, children }: { hypothesis: Hypothesis; children: ReactNode }) {
  const rated = useEvaluations(s => (hypothesis.id ? !!s.hypotheses[hypothesis.id] : false))
  const scoring = useEvaluations(s => s.scoringBlind !== null && s.scoringBlind === hypothesis.id)
  if (!hypothesis.blind || (rated && !scoring)) return <>{children}</>
  return (
    <div className={styles.blind} title="Your rating first: the model's scores appear once you've rated it">
      <div className={styles.blurred} aria-hidden>{children}</div>
      <span className={styles.reveal}>Rate to reveal</span>
    </div>
  )
}

export function UnratedDot({ hypothesis }: { hypothesis: Hypothesis }) {
  const rated = useEvaluations(s => (hypothesis.id ? !!s.hypotheses[hypothesis.id] : true))
  return rated ? null : <span className={styles.unrated} title="You haven’t rated this yet" />
}
