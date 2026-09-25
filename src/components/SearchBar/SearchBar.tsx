import { useEffect, useRef, useState, type ReactNode } from 'react'
import { track } from '../../evaluation/evaluationApi'
import styles from './SearchBar.module.css'

export interface SearchItem {
  key: string
  primary: string
  secondary?: string
  score?: number          // 0–1, drawn as a small similarity bar
  onPick: () => void
}

export interface SearchSection {
  title: string
  kind: 'lexical' | 'semantic'
  items: SearchItem[]
  loading?: boolean
  error?: string | null
  note?: string | null
  action?: { label: string; onClick: () => void } | null
}

interface Props {
  placeholder: string
  query: string
  onQueryChange: (q: string) => void
  sections: SearchSection[]
  minChars?: number
}

// One input, several result sections (e.g. a lexical and a semantic search run
// side by side). The dropdown closes on Escape, on picking a result, or on a
// click outside.
export function SearchBar({ placeholder, query, onQueryChange, sections, minChars = 2 }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const active = query.trim().length >= minChars
  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.inputWrap}>
        <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          className={styles.input}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={e => { onQueryChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur() } }}
        />
        {query && (
          <button className={styles.clear} aria-label="Clear search" onClick={() => onQueryChange('')}>×</button>
        )}
      </div>
      {open && active && (
        <div className={styles.dropdown} role="listbox">
          {sections.map(s => (
            <Section key={s.title} section={s} query={query} onPicked={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ section, query, onPicked }: { section: SearchSection; query: string; onPicked: () => void }) {
  let body: ReactNode
  if (section.error) body = <div className={styles.empty}>{section.error}</div>
  else if (section.loading && section.items.length === 0) body = <div className={styles.empty}>Searching…</div>
  else if (section.items.length === 0) body = <div className={styles.empty}>No matches</div>
  else body = section.items.map((item, rank) => (
    <button
      key={item.key}
      className={styles.item}
      role="option"
      onClick={() => {
        track('search_result_picked', item.key, { query, section: section.title, kind: section.kind, rank })
        item.onPick(); onPicked()
      }}
    >
      <span className={styles.primary}>{item.primary}</span>
      {item.secondary && <span className={styles.secondary}>{item.secondary}</span>}
      {item.score !== undefined && (
        <span className={styles.score} title={`similarity ${(item.score * 100).toFixed(0)}%`}>
          <span className={styles.scoreFill} style={{ width: `${Math.round(item.score * 100)}%` }} />
        </span>
      )}
    </button>
  ))
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{section.title}</span>
        <span className={styles.kind}>{section.kind === 'semantic' ? 'by meaning' : 'by words'}</span>
        {section.loading && section.items.length > 0 && <span className={styles.kind}>updating…</span>}
        {section.action && section.items.length > 0 && (
          <button className={styles.action} onClick={() => { section.action!.onClick(); onPicked() }}>
            {section.action.label}
          </button>
        )}
      </div>
      {body}
      {section.note && <div className={styles.note}>{section.note}</div>}
    </div>
  )
}
