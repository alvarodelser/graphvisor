import { Fragment, useEffect, useMemo, useState } from 'react'
import type { CollectionInfo } from '../data/dataset'
import { adminApi } from './adminApi'
import { summarize, type EvaluationRecord, type Summary } from './evaluationSummary'
import styles from './AdminPanel.module.css'

const VERDICT_LABEL: Record<string, string> = {
  promising: 'Promising', unsure: 'Unsure', not_useful: 'Not useful', faithful: 'Faithful', wrong: 'Wrong',
}
const REASON_LABEL: Record<string, string> = {
  not_in_paper: 'Not in the paper', misquoted: 'Misquoted / distorted', claims_merged: 'Several claims merged',
  wrong_type: 'Wrong type', other: 'Other',
}
const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d))
// Neo4j writes nanoseconds, which Date doesn't always parse.
const when = (iso?: string) => (iso ? new Date(iso.replace(/(\.\d{3})\d+/, '$1')) : null)
const pct = (n: number, total: number) => (total ? `${Math.round((100 * n) / total)}%` : '—')

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

// A horizontal stacked bar of verdict counts.
function VerdictBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) return <span className={styles.sub}>no ratings</span>
  return (
    <div className={styles.stack} aria-label={Object.entries(counts).map(([k, n]) => `${VERDICT_LABEL[k]} ${n}`).join(', ')}>
      {Object.entries(counts).filter(([, n]) => n).map(([k, n]) => (
        <span key={k} className={`${styles.seg} ${styles[`v_${k}`]}`} style={{ flexGrow: n }} title={`${VERDICT_LABEL[k]}: ${n}`}>
          {VERDICT_LABEL[k]} {n}
        </span>
      ))}
    </div>
  )
}

function Comments({ list }: { list: { who: string; verdict: string; text: string }[] }) {
  if (!list.length) return null
  return (
    <ul className={styles.comments}>
      {list.map((c, i) => (
        <li key={i}><span className={styles.who}>{c.who}</span> <span className={styles.sub}>({VERDICT_LABEL[c.verdict] ?? c.verdict})</span> {c.text}</li>
      ))}
    </ul>
  )
}

function HypothesesSection({ s }: { s: Summary['hypotheses'] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Hypotheses <span className={styles.sub}>{s.rated} rated · {s.ratings} ratings</span></h2>
      <VerdictBar counts={s.verdicts} />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Criterion</th><th>Model</th><th>People, scores shown</th><th>People, blind</th>
              <th title="Mean |human − model|">Gap shown</th><th title="Mean |human − model|">Gap blind</th><th>Adjusted</th>
            </tr>
          </thead>
          <tbody>
            {s.criteria.map(c => (
              <tr key={c.criterion}>
                <td style={{ textTransform: 'capitalize' }}>{c.criterion}</td>
                <td>{fmt(c.model)}</td><td>{fmt(c.humanOpen)}</td><td>{fmt(c.humanBlind)}</td>
                <td>{fmt(c.gapOpen)}</td><td>{fmt(c.gapBlind)}</td>
                <td>{c.scored ? `${pct(c.adjusted * c.scored, c.scored)} of ${c.scored}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.lead}>
        Blind ratings were scored without seeing the model’s numbers. If the gap is much smaller when the scores were
        shown, people are probably anchoring on the model.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Hypothesis</th><th>Ratings</th><th>Verdicts</th><th>People / model (N·P·I·C)</th><th /></tr></thead>
          <tbody>
            {s.rows.map(h => (
              <Fragment key={h.uid}>
                <tr>
                  <td className={styles.textCell}>
                    {h.concept && <span className={styles.badge}>{h.concept}</span>} {h.text}
                  </td>
                  <td>{h.ratings}</td>
                  <td style={{ minWidth: 160 }}><VerdictBar counts={h.verdicts} /></td>
                  <td className={styles.mono}>
                    {(['novelty', 'plausibility', 'impact', 'creativity'] as const).map(c => fmt(h.human[c], 0)).join('·')}
                    {' / '}
                    {(['novelty', 'plausibility', 'impact', 'creativity'] as const).map(c => fmt(h.model[c], 0)).join('·')}
                  </td>
                  <td>
                    {h.comments.length > 0 && (
                      <button className={styles.btnGhost} onClick={() => setOpen(open === h.uid ? null : h.uid)}>
                        {h.comments.length} comment{h.comments.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </td>
                </tr>
                {open === h.uid && (
                  <tr><td colSpan={5}><Comments list={h.comments} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ArgumentsSection({ s }: { s: Summary['arguments'] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Arguments <span className={styles.sub}>{s.rated} rated · {s.ratings} ratings</span></h2>
      <VerdictBar counts={{ faithful: s.faithful, wrong: s.wrong }} />
      <div className={styles.facts}>
        {Object.entries(s.reasons).map(([k, n]) => (
          <span key={k} className={styles.fact}><b>{n}</b> {REASON_LABEL[k]}</span>
        ))}
        <span className={styles.fact}><b>{s.wrongRelations}</b> relations marked wrong</span>
        <span className={styles.fact}><b>{s.wrongEntities}</b> entities marked wrong</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Argument</th><th>Type</th><th>Faithful</th><th>Wrong</th><th>Why</th><th /></tr></thead>
          <tbody>
            {s.rows.map(a => {
              const why = Object.entries(a.reasons).filter(([, n]) => n).map(([k, n]) => `${REASON_LABEL[k]}${n > 1 ? ` ×${n}` : ''}`)
              const details = a.comments.length + a.wrongParts.length
              return (
                <Fragment key={a.argumentId}>
                  <tr>
                    <td className={styles.textCell}><span className={styles.sub}>{a.argumentId}</span> {a.text}</td>
                    <td>{a.type ?? '—'}{a.correctedTypes.length > 0 && <div className={styles.sub}>→ {a.correctedTypes.join(', ')}</div>}</td>
                    <td>{a.faithful}</td>
                    <td>{a.wrong}</td>
                    <td>{why.join(', ')}</td>
                    <td>
                      {details > 0 && (
                        <button className={styles.btnGhost} onClick={() => setOpen(open === a.argumentId ? null : a.argumentId)}>
                          details ({details})
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === a.argumentId && (
                    <tr>
                      <td colSpan={6}>
                        {a.wrongParts.length > 0 && (
                          <ul className={styles.comments}>
                            {a.wrongParts.map((p, i) => (
                              <li key={i}>✗ <b>{p.part}</b> <span className={styles.sub}>({p.who})</span>{p.comment ? `: ${p.comment}` : ''}</li>
                            ))}
                          </ul>
                        )}
                        <Comments list={a.comments} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function EvaluationsOverview({ collections }: { collections: CollectionInfo[] }) {
  const [collection, setCollection] = useState<string>('')
  const [records, setRecords] = useState<EvaluationRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!collection && collections.length) {
      const fromUrl = new URLSearchParams(window.location.search).get('collection')
      setCollection(collections.some(c => c.name === fromUrl) ? fromUrl! : collections[0].name)
    }
  }, [collections, collection])

  useEffect(() => {
    if (!collection) return
    setRecords(null); setError(null)
    adminApi.evaluations(collection)
      .then(r => setRecords(r as EvaluationRecord[]))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [collection])

  const summary = useMemo(() => (records ? summarize(records) : null), [records])

  return (
    <>
      <div className={styles.toolbar}>
        <select className={styles.input} value={collection} onChange={e => setCollection(e.target.value)} aria-label="Collection">
          {collections.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        {summary && (
          <span className={styles.sub}>
            {summary.total} ratings by {summary.raters} {summary.raters === 1 ? 'person' : 'people'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {records && records.length > 0 && (
          <button className={styles.btnGhost} onClick={() => download(`graphvisor-ratings-${collection}.json`, records)}>
            Download JSON
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {!summary && !error && <p className={styles.lead}>Loading…</p>}
      {summary && summary.total === 0 && <p className={styles.lead}>Nobody has rated anything in {collection} yet.</p>}
      {summary && summary.total > 0 && (
        <>
          <HypothesesSection s={summary.hypotheses} />
          <ArgumentsSection s={summary.arguments} />
          <section className={styles.section}>
            <h2 className={styles.h2}>People</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Name</th><th>Hypotheses</th><th>Arguments</th><th>Last rating</th></tr></thead>
                <tbody>
                  {summary.people.map(p => (
                    <tr key={p.uid}>
                      <td>{p.name}<div className={styles.sub}>{p.email}</div></td>
                      <td>{p.hypotheses}</td><td>{p.arguments}</td>
                      <td>{when(p.last)?.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}
