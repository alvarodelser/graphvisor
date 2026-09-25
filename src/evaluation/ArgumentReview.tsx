import { useEffect, useMemo, useState } from 'react'
import type { ArgumentDetail } from '../types'
import {
  evaluationApi, type ArgumentReason, type ArgumentVerdict, type PartVerdict, type SourcePassage,
} from './evaluationApi'
import { useEvaluations } from './useEvaluations'
import styles from './Evaluation.module.css'

const REASONS: { value: ArgumentReason; label: string }[] = [
  { value: 'not_in_paper', label: 'Not in the paper' },
  { value: 'misquoted', label: 'Misquoted / distorted' },
  { value: 'claims_merged', label: 'Several claims merged' },
  { value: 'wrong_type', label: 'Wrong type' },
  { value: 'other', label: 'Other' },
]

// The classification prompt's types (services/orchestrator/prompts/argument_classification.system.txt).
const ARGUMENT_TYPES = ['causal', 'mechanistic', 'correlational', 'hypothesis', 'evidence', 'analogy',
  'contradiction', 'question', 'conceptual', 'other']

interface Check { verdict: PartVerdict; comment: string }
const relKey = (s: string, r: string, o: string) => `${s}\u0000${r}\u0000${o}`

function CheckButtons({ check, onChange }: { check?: Check; onChange: (v: PartVerdict | null) => void }) {
  return (
    <>
      <button type="button" title="Correct" aria-pressed={check?.verdict === 'correct'}
        className={`${styles.checkBtn} ${check?.verdict === 'correct' ? styles.okOn : ''}`}
        onClick={() => onChange(check?.verdict === 'correct' ? null : 'correct')}>✓</button>
      <button type="button" title="Wrong" aria-pressed={check?.verdict === 'wrong'}
        className={`${styles.checkBtn} ${check?.verdict === 'wrong' ? styles.badOn : ''}`}
        onClick={() => onChange(check?.verdict === 'wrong' ? null : 'wrong')}>✗</button>
    </>
  )
}

// Detail's argument mode: the argument's own review. Opens expanded when the
// Explore card asked for it (Wrong opens it asking what's wrong); otherwise
// it's one line until the researcher wants it.
export function ArgumentReview({ detail }: { detail: ArgumentDetail }) {
  const argId = detail.arg_id
  const blobId = detail.argument.id
  const mine = useEvaluations(s => (argId ? s.arguments[argId] : undefined))
  const request = useEvaluations(s => s.reviewRequest)
  const { rateArgument, requestReview } = useEvaluations.getState()

  const relations = useMemo(() => {
    const seen = new Map<string, { subject: string; relation: string; object: string }>()
    for (const t of detail.entityGraph ?? []) {
      const k = relKey(t.subject, t.relation_type, t.object)
      if (!seen.has(k)) seen.set(k, { subject: t.subject, relation: t.relation_type, object: t.object })
    }
    return [...seen.entries()]
  }, [detail])
  const entities = useMemo(
    () => [...new Set((detail.entityGraph ?? []).flatMap(t => [t.subject, t.object]))].sort((a, b) => a.localeCompare(b)),
    [detail])

  const [open, setOpen] = useState(false)
  const [verdict, setVerdict] = useState<ArgumentVerdict | null>(null)
  const [reasons, setReasons] = useState<ArgumentReason[]>([])
  const [correctedType, setCorrectedType] = useState('')
  const [comment, setComment] = useState('')
  const [relChecks, setRelChecks] = useState<Record<string, Check>>({})
  const [entChecks, setEntChecks] = useState<Record<string, Check>>({})
  const [source, setSource] = useState<SourcePassage | 'none' | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | string>('idle')

  // (Re)start from the saved rating whenever another argument is shown.
  useEffect(() => {
    const e = useEvaluations.getState().arguments[argId ?? '']
    setVerdict(e?.verdict ?? null)
    setReasons(e?.reasons ?? [])
    setCorrectedType(e?.corrected_type ?? '')
    setComment(e?.comment ?? '')
    setRelChecks(Object.fromEntries((e?.relations ?? []).map(r =>
      [relKey(r.subject, r.relation, r.object), { verdict: r.verdict, comment: r.comment ?? '' }])))
    setEntChecks(Object.fromEntries((e?.entities ?? []).map(x => [x.name, { verdict: x.verdict, comment: x.comment ?? '' }])))
    setSource(null)
    setStatus('idle')
    setOpen(false)
  }, [argId])

  // Sent here from the Explore card: open, with the verdict just given.
  useEffect(() => {
    if (!request || request.blobId !== blobId) return
    setOpen(true)
    setVerdict(request.verdict)
    requestReview(null)
  }, [request, blobId, requestReview])

  useEffect(() => {
    if (!open || !argId || source) return
    evaluationApi.source(argId).then(setSource).catch(() => setSource('none'))
  }, [open, argId, source])

  if (!argId || detail.argument.type !== 'Argument') return null

  if (!open) {
    return (
      <div className={styles.review} style={{ padding: '8px 14px' }}>
        <div className={styles.reviewHead}>
          <span className={styles.reviewTitle}>
            {mine ? `You rated this argument ${mine.verdict}` : 'Is this argument faithful to the paper?'}
          </span>
          <button type="button" className={styles.link} onClick={() => setOpen(true)}>
            {mine ? 'Review its relations and entities ▸' : 'Review it ▸'}
          </button>
        </div>
      </div>
    )
  }

  const setCheck = (set: typeof setRelChecks, key: string, v: PartVerdict | null) =>
    set(prev => {
      const next = { ...prev }
      if (v) next[key] = { verdict: v, comment: prev[key]?.comment ?? '' }
      else delete next[key]
      return next
    })

  const save = async () => {
    if (!verdict) { setStatus('Pick Faithful or Wrong first'); return }
    setStatus('saving')
    try {
      await rateArgument(argId, {
        verdict,
        reasons: verdict === 'wrong' ? reasons : [],
        corrected_type: verdict === 'wrong' && reasons.includes('wrong_type') && correctedType ? correctedType : null,
        comment: comment.trim() || null,
        relations: relations.filter(([k]) => relChecks[k]).map(([k, r]) => ({
          ...r, verdict: relChecks[k].verdict, comment: relChecks[k].comment.trim() || undefined })),
        entities: entities.filter(n => entChecks[n]).map(n => ({
          name: n, verdict: entChecks[n].verdict, comment: entChecks[n].comment.trim() || undefined })),
      })
      setStatus('saved')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={styles.review}>
      <div className={styles.reviewHead}>
        <span className={styles.reviewTitle}>Is this argument faithful to the paper?</span>
        {(['faithful', 'wrong'] as const).map(v => (
          <button key={v} type="button" aria-pressed={verdict === v}
            className={`${styles.pill} ${styles[v]} ${verdict === v ? styles.pillOn : ''}`}
            onClick={() => { setVerdict(v); setStatus('idle') }}>
            {v === 'faithful' ? 'Faithful' : 'Wrong'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" className={styles.link} onClick={() => setOpen(false)}>Close</button>
      </div>

      {source && (
        <div className={styles.passage}>
          {source === 'none' ? 'No source passage recorded for this argument.' : (
            <>{source.title && <span className={styles.passageTitle}>From “{source.title}”</span>}{source.text}</>
          )}
        </div>
      )}

      {verdict === 'wrong' && (
        <div className={styles.reviewSection}>
          <span className="sl" style={{ margin: 0 }}>What’s wrong?</span>
          <div className={styles.chips}>
            {REASONS.map(r => (
              <button key={r.value} type="button" aria-pressed={reasons.includes(r.value)}
                className={`${styles.chip} ${reasons.includes(r.value) ? styles.chipOn : ''}`}
                onClick={() => setReasons(rs => rs.includes(r.value) ? rs.filter(x => x !== r.value) : [...rs, r.value])}>
                {r.label}
              </button>
            ))}
            {reasons.includes('wrong_type') && (
              <select className={styles.select} value={correctedType} aria-label="Correct type"
                onChange={e => setCorrectedType(e.target.value)}>
                <option value="">It should be…</option>
                {ARGUMENT_TYPES.filter(t => t !== detail.argument.label?.toLowerCase()).map(t =>
                  <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {relations.length > 0 && (
        <div className={styles.reviewSection}>
          <span className="sl" style={{ margin: 0 }}>Relations ({relations.length}) — mark the ones you checked</span>
          {relations.map(([k, r]) => (
            <div key={k} className={styles.checkRow}>
              <CheckButtons check={relChecks[k]} onChange={v => setCheck(setRelChecks, k, v)} />
              <span className={styles.checkText}>
                {r.subject} <span className={styles.rel}>{r.relation.replace(/_/g, ' ').toLowerCase()}</span> {r.object}
              </span>
              {relChecks[k]?.verdict === 'wrong' && (
                <input className={styles.checkComment} placeholder="Why? (optional)" value={relChecks[k].comment}
                  onChange={e => setRelChecks(p => ({ ...p, [k]: { ...p[k], comment: e.target.value } }))} />
              )}
            </div>
          ))}
        </div>
      )}

      {entities.length > 0 && (
        <div className={styles.reviewSection}>
          <span className="sl" style={{ margin: 0 }}>Entities ({entities.length})</span>
          {entities.map(n => (
            <div key={n} className={styles.checkRow}>
              <CheckButtons check={entChecks[n]} onChange={v => setCheck(setEntChecks, n, v)} />
              <span className={styles.checkText}>{n}</span>
              {entChecks[n]?.verdict === 'wrong' && (
                <input className={styles.checkComment} placeholder="Why? (optional)" value={entChecks[n].comment}
                  onChange={e => setEntChecks(p => ({ ...p, [n]: { ...p[n], comment: e.target.value } }))} />
              )}
            </div>
          ))}
        </div>
      )}

      <textarea className={styles.comment} rows={2} maxLength={5000}
        placeholder={verdict === 'wrong' ? 'What does the paper actually say? (optional)' : 'Comment (optional)'}
        value={comment} onChange={e => setComment(e.target.value)} />
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={save} disabled={status === 'saving'}>Save review</button>
        {status === 'saved' && <span className={styles.saved}>Saved</span>}
        {status !== 'idle' && status !== 'saved' && status !== 'saving' && <span className={styles.error}>{status}</span>}
      </div>
    </div>
  )
}
