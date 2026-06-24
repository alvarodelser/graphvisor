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
    discoveredHypothesisCount, scopedArgumentCount,
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
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([])
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const label = labelRefs.current[viewIndex]
    const indicator = indicatorRef.current
    if (!label || !indicator) return
    const tabsEl = label.closest('nav')
    if (!tabsEl) return
    const tabsRect = tabsEl.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()
    indicator.style.left = `${labelRect.left - tabsRect.left}px`
    indicator.style.width = `${labelRect.width}px`
  }, [viewIndex])

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.brand}>
          <svg className={styles.brandIcon} viewBox="0 0 180.00415 100.00003" aria-hidden="true">
            <g transform="translate(-14.673589,-68.475939)">
              <path fill="#fff" d="m 14.676203,118.47595 c 0.323797,6.52405 50.000004,50 89.999997,50 40,0 90.3238,-43.47595 90,-50 -0.42047,-8.47171 -50,-50.000015 -90,-50.000015 -39.999993,0 -90.420459,41.528305 -89.999997,50.000015 z" />
              <ellipse fill="#073b4c" cx="84.676201" cy="133.65865" rx="32.500004" ry="32.5" />
              <ellipse fill="#073b4c" cx="124.6762" cy="96.158646" rx="10" ry="9.999999" />
              <ellipse fill="#073b4c" cx="144.67621" cy="126.15864" rx="5" ry="4.9999995" />
              <path fill="none" stroke="#073b4c" strokeWidth="4.99999" strokeLinecap="round" strokeLinejoin="round" d="M 79.676204,136.15865 124.6762,96.158645" />
              <path fill="none" stroke="#073b4c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="m 144.6762,126.15864 -20,-29.999995" />
            </g>
          </svg>
          <span className={styles.logo}>GRAPHVISOR</span>
        </span>
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
                <span ref={el => { labelRefs.current[i] = el }}>{VIEW_LABELS[v]}</span>
                {v === 'discover' && discoveredHypothesisCount > 0 && (
                  <span className={styles.badge}>{discoveredHypothesisCount}</span>
                )}
                {v === 'graph' && hasHypothesisSelection && (
                  <span className={styles.badge}>{scopedArgumentCount}</span>
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
