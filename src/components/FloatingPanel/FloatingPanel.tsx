import { useState, useEffect, useRef, type ReactNode } from 'react'
import styles from './FloatingPanel.module.css'

interface Props {
  icon: string
  label: string
  open: boolean
  onToggle: () => void
  /** bottom + left in px, absolute inside the canvas div */
  fabBottom: number
  fabLeft: number
  children: ReactNode
}

export function FloatingPanel({ icon, label, open, onToggle, fabBottom, fabLeft, children }: Props) {
  const fabRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ startMx: number; startMy: number; startPx: number; startPy: number } | null>(null)

  // Set initial panel position once, relative to FAB, on first open
  const initialized = useRef(false)
  useEffect(() => {
    if (!open || initialized.current || !fabRef.current) return
    initialized.current = true
    const rect = fabRef.current.getBoundingClientRect()
    setPos({ x: rect.right + 10, y: Math.max(8, rect.top - 120) })
  }, [open])

  // Drag handlers on document so the panel doesn't lose drag if cursor exits it
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      const dx = e.clientX - drag.current.startMx
      const dy = e.clientY - drag.current.startMy
      setPos({ x: drag.current.startPx + dx, y: drag.current.startPy + dy })
    }
    const onUp = () => { drag.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (!pos) return
    e.preventDefault()
    drag.current = { startMx: e.clientX, startMy: e.clientY, startPx: pos.x, startPy: pos.y }
  }

  return (
    <>
      <button
        ref={fabRef}
        className={`${styles.fab} ${open ? styles.open : ''}`}
        style={{ bottom: fabBottom, left: fabLeft }}
        onClick={onToggle}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>

      {open && pos && (
        <div
          className={`card ${styles.panel}`}
          style={{ left: pos.x, top: pos.y }}
        >
          <div className={styles.header} onMouseDown={onHeaderMouseDown}>
            <span className={styles.headerTitle}>{label}</span>
            <button className={styles.close} onClick={onToggle} aria-label="Close">×</button>
          </div>
          <div className={styles.body}>
            {children}
          </div>
        </div>
      )}
    </>
  )
}
