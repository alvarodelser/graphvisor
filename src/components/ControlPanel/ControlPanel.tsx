import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ControlPanel.module.css'

interface Props {
  isActive: boolean
  filterContent?: ReactNode
  legendContent?: ReactNode
  fabBottom?: number
  fabLeft?: number
}

export function ControlPanel({ isActive, filterContent, legendContent, fabBottom = 20, fabLeft = 20 }: Props) {
  const fabRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'filters' | 'legend'>('filters')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ startMx: number; startMy: number; startPx: number; startPy: number } | null>(null)

  const hasBoth = !!(filterContent && legendContent)
  const singleLabel = legendContent && !filterContent ? 'Legend' : 'Filters'

  useEffect(() => { if (!isActive) setOpen(false) }, [isActive])

  useEffect(() => {
    if (!open || !fabRef.current) { setPos(null); return }
    const rect = fabRef.current.getBoundingClientRect()
    setPos({ x: rect.right + 10, y: Math.max(8, rect.top - 360) })
  }, [open])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      setPos({ x: drag.current.startPx + (e.clientX - drag.current.startMx), y: drag.current.startPy + (e.clientY - drag.current.startMy) })
    }
    const onUp = () => { drag.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const startDrag = (e: React.MouseEvent) => {
    if (!pos) return
    e.preventDefault()
    drag.current = { startMx: e.clientX, startMy: e.clientY, startPx: pos.x, startPy: pos.y }
  }

  const activeContent = hasBoth
    ? (tab === 'filters' ? filterContent : legendContent)
    : (filterContent ?? legendContent)

  return (
    <>
      <button
        ref={fabRef}
        className={`${styles.fab} ${open ? styles.open : ''}`}
        style={{ bottom: fabBottom, left: fabLeft }}
        onClick={() => setOpen(v => !v)}
        aria-label={hasBoth ? 'Filters & Legend' : singleLabel}
        title={hasBoth ? 'Filters & Legend' : singleLabel}
      >
        <svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden="true">
          <rect width="14" height="2" rx="1" fill="currentColor"/>
          <rect y="4.5" width="14" height="2" rx="1" fill="currentColor"/>
          <rect y="9" width="14" height="2" rx="1" fill="currentColor"/>
        </svg>
      </button>

      {open && pos && createPortal(
        <div className={`card ${styles.panel}`} style={{ left: pos.x, top: pos.y }}>
          <div className={styles.header} onMouseDown={startDrag}>
            {hasBoth ? (
              <div className={styles.tabBar}>
                <button
                  className={`${styles.tabBtn} ${tab === 'filters' ? styles.activeTab : ''}`}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setTab('filters')}
                >Filters</button>
                <button
                  className={`${styles.tabBtn} ${tab === 'legend' ? styles.activeTab : ''}`}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setTab('legend')}
                >Legend</button>
              </div>
            ) : (
              <span className={styles.singleTitle}>{singleLabel}</span>
            )}
            <button className={styles.close} onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <div className={styles.body}>
            {activeContent}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
