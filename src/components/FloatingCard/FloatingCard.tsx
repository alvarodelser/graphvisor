import type { CSSProperties, ReactNode } from 'react'
import styles from './FloatingCard.module.css'

interface Props {
  style?: CSSProperties
  className?: string
  children: ReactNode
  onDismiss?: () => void
}

export function FloatingCard({ style, className, children, onDismiss }: Props) {
  return (
    <div className={`card ${styles.card} ${className ?? ''}`} style={style}>
      {onDismiss && (
        <button className={styles.dismiss} onClick={onDismiss}>×</button>
      )}
      {children}
    </div>
  )
}
