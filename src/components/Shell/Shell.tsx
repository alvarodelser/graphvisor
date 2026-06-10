import type { ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { StatusBar } from '../StatusBar/StatusBar'
import styles from './Shell.module.css'

const VIEW_ORDER = ['corpus', 'graph', 'detail', 'discover'] as const

interface Props {
  children: [ReactNode, ReactNode, ReactNode, ReactNode]
}

export function Shell({ children }: Props) {
  const { activeView, setActiveView, selectedDocumentIds, selectedNodeId, selectedArgumentId } = useStore()
  const viewIndex = VIEW_ORDER.indexOf(activeView)

  const hasCorpusSelection = selectedDocumentIds.length > 0
  const hasDetailTarget = selectedNodeId !== null || selectedArgumentId !== null
  const showCTA =
    (activeView === 'corpus' && selectedDocumentIds.length > 0) ||
    (activeView === 'graph' && hasDetailTarget)
  const ctaLabel = activeView === 'corpus' ? 'View Graph →' : 'Open Detail →'
  const handleCTA = () => setActiveView(activeView === 'corpus' ? 'graph' : 'detail')

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.logo}>GRAPHVISOR</span>
        <nav className={styles.tabs}>
          {(['corpus', 'graph', 'detail', 'discover'] as const).map((v) => (
            <button
              key={v}
              className={[
                styles.tab,
                activeView === v ? styles.active : '',
                (v === 'detail' && !hasDetailTarget) || (v === 'graph' && !hasCorpusSelection) ? styles.dimmed : '',
              ].join(' ')}
              style={v === 'discover' ? { marginLeft: 'auto' } : undefined}
              onClick={() => {
                if (v === 'detail' && !hasDetailTarget) return
                if (v === 'graph' && !hasCorpusSelection) return
                setActiveView(v)
              }}
              disabled={(v === 'detail' && !hasDetailTarget) || (v === 'graph' && !hasCorpusSelection)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
              {v === 'graph' && hasCorpusSelection && (
                <span className={styles.badge}>{selectedDocumentIds.length}</span>
              )}
              {v === 'detail' && hasDetailTarget && (
                <span className={styles.dot}>●</span>
              )}
            </button>
          ))}
        </nav>
        {showCTA && (
          <button className={styles.cta} onClick={handleCTA}>{ctaLabel}</button>
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
