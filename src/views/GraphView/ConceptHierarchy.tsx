import { Fragment, useMemo, useRef, useState, useEffect } from 'react'
import { buildConceptTree } from './conceptTree'
import { DemandMeter } from './DemandMeter'
import type { ArgumentBlob, SelectedScope } from '../../types'
import styles from './ConceptHierarchy.module.css'


interface Props {
  blobs: ArgumentBlob[]
  scope: SelectedScope
  onScopeChange: (s: SelectedScope) => void
  entityCount: number
  entityLimit: number
  linkedArgIds: Set<string>
  onSelectOnlyEvidence: () => void
  onConceptHover?: (conceptId: string | null) => void
  onConceptDetail?: (conceptId: string) => void
  onArgumentDetail?: (argId: string) => void
}

export function ConceptHierarchy({ blobs, scope, onScopeChange, entityCount, entityLimit, linkedArgIds, onSelectOnlyEvidence, onConceptHover, onConceptDetail, onArgumentDetail }: Props) {
  const tree = useMemo(() => buildConceptTree(blobs), [blobs])
  // Per-argument entity count — hints which arguments to uncheck to drop demand.
  const entityCountByArg = useMemo(
    () => new Map(blobs.map(b => [b.id, b.entityIds.length])),
    [blobs],
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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

  const allConceptIds = useMemo(() => tree.map(c => c.id), [tree])

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.titleRow}>
            Concept hierarchy
            <DemandMeter count={entityCount} limit={entityLimit} />
          </span>
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
          const hasLinked = concept.args.some(a => linkedArgIds.has(a.id))
          return (
            <Fragment key={concept.id}>
              <div
                className={styles.concept}
                data-selected={allOn}
                data-partial={someOn}
                data-linked={hasLinked}
                onMouseEnter={() => onConceptHover?.(concept.id)}
                onMouseLeave={() => onConceptHover?.(null)}
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
                  {onConceptDetail && (
                    <span
                      className={styles.detailIcon}
                      role="button"
                      title="Open in Detail View"
                      onClick={e => { e.stopPropagation(); onConceptDetail(concept.id) }}
                    >
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M3 1.5L6.5 4.5L3 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
                </button>
              </div>

              {open && (
                <div className={styles.children}>
                  {shownArgs.map(a => (
                    <label
                      key={a.id}
                      className={styles.arg}
                      data-selected={selected.has(a.id)}
                      data-linked={linkedArgIds.has(a.id)}
                      title={a.full}
                    >
                      <input type="checkbox" className={styles.argBox}
                        checked={selected.has(a.id)} onChange={() => toggleArg(a.id)} />
                      <span className={styles.argLabel}>{a.full}</span>
                      <span className={styles.argCount} title="entities in this argument">
                        {entityCountByArg.get(a.id) ?? 0}
                      </span>
                      {onArgumentDetail && (
                        <span
                          className={styles.detailIcon}
                          role="button"
                          title="Open in Detail View"
                          onClick={e => { e.stopPropagation(); onArgumentDetail(a.id) }}
                        >
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M3 1.5L6.5 4.5L3 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
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

      {linkedArgIds.size > 0 && (
        <div className={styles.footer}>
          <button className={styles.evidenceBtn} onClick={onSelectOnlyEvidence}>
            Filter evidence only <span className={styles.evidenceCount}>{linkedArgIds.size}</span>
          </button>
        </div>
      )}
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
