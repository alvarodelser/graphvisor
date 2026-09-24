import { useEffect, useState, type ReactNode } from 'react'
import { API_BASE, listCollections, type CollectionInfo } from '../../data/dataset'
import styles from './CollectionGate.module.css'

const POLL_MS = 30_000

type State =
  | { kind: 'loading' }
  | { kind: 'open' }
  | { kind: 'choose'; collections: CollectionInfo[]; requested: string | null }
  | { kind: 'error'; message: string }

// GraphVisor starts on this collection screen. The app opens only for a ready
// collection named in ?collection= (a card below, or the status-bar picker).
export function decide(collections: CollectionInfo[], requested: string | null): State {
  if (requested && collections.some(c => c.name === requested && c.status === 'ready')) return { kind: 'open' }
  return { kind: 'choose', collections, requested }
}

function openCollection(name: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('collection', name)
  window.location.assign(url.toString())
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function CollectionCard({ c }: { c: CollectionInfo }) {
  const ready = c.status === 'ready'
  const progress = c.expected ? Math.round((100 * (c.done + c.failed)) / c.expected) : 0
  const when = ready ? formatDate(c.finished_at) : formatDate(c.started_at)
  const body = (
    <>
      <div className={styles.cardHead}>
        <span className={styles.name}>{c.name}</span>
        <span className={`${styles.badge} ${styles[c.status] ?? ''}`}>{c.status}</span>
      </div>
      <div className={styles.counts}>
        {c.done} of {c.expected} documents{c.failed ? ` · ${c.failed} failed` : ''}
      </div>
      {c.status === 'finalizing' && c.stage && (
        <div className={styles.counts}>Building concepts and topics: {c.stage.replace(/_/g, ' ')}</div>
      )}
      {!ready && c.status !== 'failed' && (
        <div className={styles.bar} aria-label={`${progress}% processed`}>
          <div className={styles.barFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      {when && <div className={styles.when}>{ready ? 'Ready since' : 'Started'} {when}</div>}
    </>
  )
  return ready ? (
    <button type="button" className={`${styles.card} ${styles.clickable}`} onClick={() => openCollection(c.name)}>
      {body}
    </button>
  ) : (
    <div className={styles.card}>{body}</div>
  )
}

export function CollectionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('collection')
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const check = () => {
      listCollections()
        .then(cs => {
          if (cancelled) return
          const next = decide(cs, requested)
          setState(next)
          if (next.kind !== 'open') timer = setTimeout(check, POLL_MS)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
          timer = setTimeout(check, POLL_MS)
        })
    }
    check()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  if (state.kind === 'open') return <>{children}</>
  if (state.kind === 'loading') return <div className={styles.gate}><p className={styles.lead}>Loading collections…</p></div>
  if (state.kind === 'error') {
    return (
      <div className={styles.gate}>
        <h1 className={styles.title}>Can’t reach the GraphVisor API</h1>
        <p className={styles.lead}>{API_BASE}/collections — {state.message}</p>
        <p className={styles.hint}>Retrying every 30 seconds.</p>
      </div>
    )
  }
  const { collections, requested } = state
  const missing = requested && !collections.some(c => c.name === requested)
  return (
    <div className={styles.gate}>
      <h1 className={styles.title}>Choose a collection</h1>
      {requested && (
        <p className={styles.notice}>
          {missing ? `There is no collection “${requested}”.` : `“${requested}” isn’t ready yet.`}
        </p>
      )}
      {collections.length === 0 ? (
        <p className={styles.lead}>Nothing has been ingested yet. Start a collection with graphvisor_start in n8n.</p>
      ) : (
        <div className={styles.grid}>
          {collections.map(c => <CollectionCard key={c.name} c={c} />)}
        </div>
      )}
      <p className={styles.hint}>Collections still processing open once they’re ready. This list refreshes every 30 seconds.</p>
    </div>
  )
}
