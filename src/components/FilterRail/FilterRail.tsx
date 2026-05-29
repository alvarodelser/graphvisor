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

  return (
    <div className={styles.rail}>
      {sections.map((s) => (
        <div key={s.id} className={styles.section}>
          <button
            className={`${styles.btn} ${openId === s.id ? styles.active : ''}`}
            onClick={() => toggle(s.id)}
          >
            {s.label}
          </button>
          {openId === s.id && (
            <div className={styles.content}>
              {s.content}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
