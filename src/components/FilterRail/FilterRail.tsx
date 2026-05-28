import { useState, type ReactNode } from 'react'
import styles from './FilterRail.module.css'

export interface RailSection {
  id: string
  icon?: ReactNode
  label: string
  content: ReactNode
}

export function FilterRail({ sections }: { sections: RailSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id))
  const open = sections.find((s) => s.id === openId)

  return (
    <div className={styles.rail}>
      <div className={styles.strip}>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`${styles.iconBtn} ${openId === s.id ? styles.active : ''}`}
            onClick={() => toggle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {open && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{open.label}</div>
          <div className={styles.panelContent}>{open.content}</div>
        </div>
      )}
    </div>
  )
}
