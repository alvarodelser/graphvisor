import { useRef, useEffect, type ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { StatusBar } from '../StatusBar/StatusBar'
import styles from './Shell.module.css'

const VIEW_ORDER = ['corpus', 'discover', 'graph', 'detail'] as const

const VIEW_LABELS: Record<string, string> = {
  corpus: 'Select',
  discover: 'Discover',
  graph: 'Explore',
  detail: 'Detail',
}

interface Props {
  children: [ReactNode, ReactNode, ReactNode, ReactNode]
}

export function Shell({ children }: Props) {
  const {
    activeView, setActiveView,
    selectedDocumentIds, selectedNodeId, selectedArgumentId,
    selectedConceptId, selectedRelation, selectedHypothesisIds,
  } = useStore()
  const viewIndex = VIEW_ORDER.indexOf(activeView)

  const hasCorpusSelection = selectedDocumentIds.length > 0
  const hasHypothesisSelection = selectedHypothesisIds.length > 0
  const hasDetailTarget =
    selectedNodeId !== null ||
    selectedArgumentId !== null ||
    selectedConceptId !== null ||
    selectedRelation !== null

  const showCTA =
    (activeView === 'corpus' && hasCorpusSelection) ||
    (activeView === 'discover' && hasHypothesisSelection) ||
    (activeView === 'graph' && hasDetailTarget)

  const ctaLabel =
    activeView === 'corpus' ? 'Go to Discover' :
    activeView === 'discover' ? 'Go to Explore' :
    'Go to Detail'

  const handleCTA = () => {
    if (activeView === 'corpus') setActiveView('discover')
    else if (activeView === 'discover') setActiveView('graph')
    else setActiveView('detail')
  }

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeTab = tabRefs.current[viewIndex]
    const indicator = indicatorRef.current
    if (!activeTab || !indicator) return
    const { offsetLeft, offsetWidth } = activeTab
    indicator.style.left = `${offsetLeft}px`
    indicator.style.width = `${offsetWidth}px`
  }, [viewIndex])

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.logo}>GRAPHVISOR</span>
        <nav className={styles.tabs}>
          <div ref={indicatorRef} className={styles.indicator} />
          {(['corpus', 'discover', 'graph', 'detail'] as const).map((v, i, arr) => (
            <>
              <button
                key={v}
                ref={el => { tabRefs.current[i] = el }}
                className={[
                  styles.tab,
                  activeView === v ? styles.active : '',
                  (v === 'detail' && !hasDetailTarget) || (v === 'graph' && !hasHypothesisSelection) || (v === 'discover' && !hasCorpusSelection) ? styles.dimmed : '',
                ].join(' ')}
                onClick={() => {
                  if (v === 'detail' && !hasDetailTarget) return
                  if (v === 'graph' && !hasHypothesisSelection) return
                  if (v === 'discover' && !hasCorpusSelection) return
                  setActiveView(v)
                }}
                disabled={(v === 'detail' && !hasDetailTarget) || (v === 'graph' && !hasHypothesisSelection) || (v === 'discover' && !hasCorpusSelection)}
              >
                {VIEW_LABELS[v]}
                {v === 'discover' && hasCorpusSelection && (
                  <span className={styles.badge}>{selectedDocumentIds.length}</span>
                )}
                {v === 'graph' && hasHypothesisSelection && (
                  <span className={styles.badge}>{selectedHypothesisIds.length}</span>
                )}
                {v === 'detail' && hasDetailTarget && (
                  <span className={styles.badge}>●</span>
                )}
              </button>
              {i < arr.length - 1 && <span key={`sep-${v}`} className={styles.sep}>›</span>}
            </>
          ))}
        </nav>
        {showCTA && (
          <button className={styles.cta} onClick={handleCTA}>
            {ctaLabel}
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M4 2L8 5.5L4 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </header>

      <div className={styles.viewArea}>
        <div
          className={styles.viewTrack}
          style={{ transform: `translateX(calc(-${viewIndex} * 100%))` }}
        >
          {children.map((child, i) => (
            <div key={i} className={styles.viewPanel}>{child}</div>
          ))}
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
