import { useState } from 'react'
import type { ArgumentBlob } from '../types'
import { useStore } from '../store/useStore'
import { evaluationApi, type ArgumentVerdict as Verdict, type SourcePassage } from './evaluationApi'
import { useEvaluations } from './useEvaluations'
import styles from './Evaluation.module.css'

// On the Explore argument card: is this argument faithful to the paper?
// Faithful offers a closer look at its relations and entities in Detail;
// Wrong goes straight there to ask what's wrong.
export function ArgumentVerdict({ blob }: { blob: ArgumentBlob }) {
  const argId = blob.arg_id
  const mine = useEvaluations(s => (argId ? s.arguments[argId] : undefined))
  const rate = useEvaluations(s => s.rateArgument)
  const requestReview = useEvaluations(s => s.requestReview)
  const { setSelectedArgumentId, setActiveView } = useStore()
  const [source, setSource] = useState<SourcePassage | 'loading' | 'none' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!argId) return null

  const openDetail = (verdict: Verdict) => {
    requestReview({ blobId: blob.id, argId, verdict })
    setSelectedArgumentId(blob.id)
    setActiveView('detail')
  }

  const choose = async (verdict: Verdict) => {
    setError(null)
    try {
      // Keep checks made earlier in Detail; reasons only apply to "wrong".
      await rate(argId, {
        verdict,
        reasons: verdict === 'wrong' ? mine?.reasons ?? [] : [],
        corrected_type: verdict === 'wrong' ? mine?.corrected_type ?? null : null,
        comment: mine?.comment ?? null,
        relations: mine?.relations ?? [],
        entities: mine?.entities ?? [],
      })
      if (verdict === 'wrong') openDetail('wrong')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggleSource = () => {
    if (source && source !== 'loading') { setSource(null); return }
    setSource('loading')
    evaluationApi.source(argId).then(setSource).catch(() => setSource('none'))
  }

  return (
    <div className={styles.argBox}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={styles.argQuestion}>Faithful to the paper?</span>
        <button type="button" className={styles.link} style={{ fontSize: 10 }} onClick={toggleSource}>
          {source && source !== 'loading' ? 'Hide source' : 'Show source passage'}
        </button>
      </div>
      {source === 'loading' && <div className={styles.passage}>Loading…</div>}
      {source === 'none' && <div className={styles.passage}>No source passage recorded for this argument.</div>}
      {source && typeof source === 'object' && (
        <div className={styles.passage}>
          {source.title && <span className={styles.passageTitle}>{source.title}</span>}
          {source.text}
        </div>
      )}
      <div className={styles.verdictRow}>
        <button type="button" aria-pressed={mine?.verdict === 'faithful'}
          className={`${styles.pill} ${styles.faithful} ${mine?.verdict === 'faithful' ? styles.pillOn : ''}`}
          onClick={() => choose('faithful')}>
          Faithful
        </button>
        <button type="button" aria-pressed={mine?.verdict === 'wrong'}
          className={`${styles.pill} ${styles.wrong} ${mine?.verdict === 'wrong' ? styles.pillOn : ''}`}
          onClick={() => choose('wrong')}>
          Wrong
        </button>
      </div>
      {mine?.verdict === 'faithful' && (
        <button type="button" className={styles.link} style={{ alignSelf: 'flex-start', fontSize: 10, padding: 0 }}
          onClick={() => openDetail('faithful')}>
          {mine.relations.length || mine.entities.length ? 'Review its relations and entities ▸' : 'Check its relations and entities ▸'}
        </button>
      )}
      {mine?.verdict === 'wrong' && (
        <button type="button" className={styles.link} style={{ alignSelf: 'flex-start', fontSize: 10, padding: 0 }}
          onClick={() => openDetail('wrong')}>
          Say what’s wrong ▸
        </button>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  )
}
