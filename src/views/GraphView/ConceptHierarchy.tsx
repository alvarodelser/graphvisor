import { Fragment, useMemo, useRef, useState, useEffect } from 'react'
import { buildConceptTree } from './conceptTree'
import type { ArgumentBlob, SelectedScope } from '../../types'
import styles from './ConceptHierarchy.module.css'

const conceptLabelFromId = (id: string) => id.replace(/^concept-/, '')

interface Props {
  blobs: ArgumentBlob[]
  scope: SelectedScope
  onScopeChange: (s: SelectedScope) => void
}

export function ConceptHierarchy({ blobs, scope, onScopeChange }: Props) {
  const tree = useMemo(() => buildConceptTree(blobs), [blobs])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hoverArg, setHoverArg] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = (s: string) => !q || s.toLowerCase().includes(q)

  const visible = useMemo(() => tree
    .map(c => ({ concept: c, argMatches: c.args.filter(a => matches(a.label) || matches(a.full)) }))
    .filter(({ concept, argMatches }) => !q || matches(concept.label) || argMatches.length > 0),
    [tree, q],
  )

  const selected = useMemo(() => new Set(scope.argumentIds), [scope.argumentIds])
  const setSelection = (next: Set<string>) => onScopeChange({ argumentIds: [...next] })

  const toggleArg = (id: string) => {
    const n = new Set(selected)
    if (n.has(id)) n.delete(id); else n.add(id)
    setSelection(n)
  }
  const toggleConcept = (argIds: string[], allOn: boolean) => {
    const n = new Set(selected)
    if (allOn) argIds.forEach(id => n.delete(id))
    else argIds.forEach(id => n.add(id))
    setSelection(n)
  }
  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  // Related concepts = the secondary memberships of the active (hovered) argument.
  const related = useMemo(() => {
    if (!hoverArg) return new Set<string>()
    for (const c of tree) {
      const a = c.args.find(x => x.id === hoverArg)
      if (a) return new Set(a.secondaryConceptIds)
    }
    return new Set<string>()
  }, [tree, hoverArg])

  const allConceptIds = useMemo(() => tree.map(c => c.id), [tree])

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.title}>
          Concept hierarchy
          <small>{tree.length} concepts · {blobs.length} arguments</small>
        </div>
        <input
          className={styles.search}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter concepts or arguments…"
        />
        <div className={styles.selbar}>
          <span className={styles.selcount} data-active={selected.size > 0}>
            {selected.size} selected
          </span>
          <div className={styles.actions}>
            <button className={styles.miniBtn} onClick={() => setExpanded(new Set(allConceptIds))}>Expand</button>
            <button className={styles.miniBtn} onClick={() => setExpanded(new Set())}>Collapse</button>
            <button className={styles.miniBtn} disabled={selected.size === 0} onClick={() => setSelection(new Set())}>Clear</button>
          </div>
        </div>
      </div>

      <div className={styles.list}>
        {visible.length === 0 ? (
          <div className={styles.empty}>No concepts match.</div>
        ) : visible.map(({ concept, argMatches }) => {
          const open = expanded.has(concept.id) || (!!q && argMatches.length > 0)
          const shownArgs = q ? argMatches : concept.args
          const selCount = concept.args.reduce((n, a) => n + (selected.has(a.id) ? 1 : 0), 0)
          const allOn = selCount > 0 && selCount === concept.args.length
          const someOn = selCount > 0 && !allOn
          return (
            <Fragment key={concept.id}>
              <div
                className={styles.concept}
                data-selected={allOn}
                data-partial={someOn}
                data-related={related.has(concept.id)}
              >
                <button className={styles.caretBtn} onClick={() => toggleExpand(concept.id)} aria-label={open ? 'collapse' : 'expand'}>
                  <svg className={`${styles.caret} ${open ? styles.caretOpen : ''}`} viewBox="0 0 12 12" width="12" height="12">
                    <path d="M2.5 6 H9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    {!open && <path d="M6 2.5 V9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
                  </svg>
                </button>
                <TriCheckbox checked={allOn} indeterminate={someOn}
                  onChange={() => toggleConcept(concept.args.map(a => a.id), allOn)} />
                <button className={styles.conceptMain} onClick={() => toggleExpand(concept.id)} title={concept.label}>
                  <span className={styles.conceptLabel}>{concept.label}</span>
                  <span className={styles.count}>{selCount > 0 ? `${selCount}/` : ''}{concept.args.length}</span>
                </button>
              </div>

              {open && (
                <div className={styles.children}>
                  {shownArgs.map(a => (
                    <label
                      key={a.id}
                      className={styles.arg}
                      data-selected={selected.has(a.id)}
                      onMouseEnter={() => setHoverArg(a.id)}
                      onMouseLeave={() => setHoverArg(null)}
                      title={a.full}
                    >
                      <input type="checkbox" className={styles.argBox}
                        checked={selected.has(a.id)} onChange={() => toggleArg(a.id)} />
                      <span className={styles.argLabel}>{a.full}</span>
                      {a.secondaryConceptIds.length > 0 && (
                        <span className={styles.chips}>
                          {a.secondaryConceptIds.slice(0, 2).map(cid => (
                            <span key={cid} className={styles.chip}>{conceptLabelFromId(cid)}</span>
                          ))}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function TriCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className={styles.conceptBox}
      checked={checked}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
    />
  )
}
