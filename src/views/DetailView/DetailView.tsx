import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { DetailMiniMap } from './DetailMiniMap'
import { ConceptMiniMap } from './ConceptMiniMap'
import { ArgumentMiniGraph } from './ArgumentMiniGraph'
import { RelationList } from './RelationList'
import { RELATION_COLORS } from '../../utils/geometry'
import type { ArgumentDetail, ConceptDetail, DocNode, RelationGroup, SelectedRelation } from '../../types'
import styles from './DetailView.module.css'

const ARGUMENT_TYPE_COLORS: Record<string, string> = {
  mechanistic: '#6366f1', evidence: '#059669', hypothesis: '#d97706', causal: '#ef4444',
}
const argTypeColor = (t: string) => ARGUMENT_TYPE_COLORS[t.toLowerCase()] ?? '#6b7280'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  evidence: true, correlation: true, causation: true, definition: true, concept: false,
}

type NavKind = 'node' | 'argument' | 'concept' | 'relation'
interface NavEntry {
  id: string
  kind: NavKind
  label: string
  relation?: SelectedRelation
}
interface NavState { entries: NavEntry[]; cursor: number }

const GROUP_TEXT_COLOR: Record<string, string> = { causation: '#073b4c' }

export function DetailView() {
  const {
    selectedNodeId, setSelectedNode,
    selectedArgumentId, setSelectedArgumentId,
    selectedConceptId, setSelectedConceptId,
    selectedRelation, setSelectedRelation,
  } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [conceptDetail, setConceptDetail] = useState<ConceptDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [nav, setNav] = useState<NavState>({ entries: [], cursor: -1 })
  const pendingHistoryRef = useRef<string | null>(null)

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (selectedConceptId) {
      const label = selectedConceptId.startsWith('concept-')
        ? selectedConceptId.slice('concept-'.length)
        : selectedConceptId
      dataService.getConceptDetail(label).then(cd => { setConceptDetail(cd); setDetail(null) })
      return
    }
    setConceptDetail(null)
    const id = selectedArgumentId ?? selectedNodeId
    if (!id) return
    dataService.getArgumentDetail(id).then(setDetail)
  }, [selectedConceptId, selectedArgumentId, selectedNodeId])

  // Record relation entries immediately (no async fetch needed)
  useEffect(() => {
    if (!selectedRelation) return
    const entry: NavEntry = {
      id: selectedRelation.id,
      kind: 'relation',
      label: `${selectedRelation.sourceLabel} → ${selectedRelation.targetLabel}`,
      relation: selectedRelation,
    }
    if (pendingHistoryRef.current === entry.id) { pendingHistoryRef.current = null; return }
    setNav(prev => {
      if (prev.entries[prev.cursor]?.id === entry.id) return prev
      const kept = prev.entries.slice(0, prev.cursor + 1)
      return { entries: [...kept, entry], cursor: kept.length }
    })
  }, [selectedRelation])

  // Record node/argument/concept entries once data resolves
  useEffect(() => {
    if (selectedRelation) return
    let entry: NavEntry | null = null
    if (selectedConceptId) {
      const expected = selectedConceptId.startsWith('concept-')
        ? selectedConceptId.slice('concept-'.length)
        : selectedConceptId
      if (!conceptDetail || conceptDetail.label !== expected) return
      entry = { id: selectedConceptId, kind: 'concept', label: conceptDetail.label }
    } else {
      const id = selectedArgumentId ?? selectedNodeId
      if (!id || !detail || detail.argument.id !== id) return
      const a = detail.argument
      const label = a.type === 'Argument' ? (a.source_document_title ?? 'Argument') : a.label
      entry = { id, kind: selectedArgumentId ? 'argument' : 'node', label }
    }
    const settled = entry
    if (pendingHistoryRef.current === settled.id) { pendingHistoryRef.current = null; return }
    setNav(prev => {
      if (prev.entries[prev.cursor]?.id === settled.id) return prev
      const kept = prev.entries.slice(0, prev.cursor + 1)
      return { entries: [...kept, settled], cursor: kept.length }
    })
  }, [detail, conceptDetail, selectedConceptId, selectedArgumentId, selectedNodeId, selectedRelation])

  const applyEntry = (entry: NavEntry) => {
    pendingHistoryRef.current = entry.id
    if (entry.kind === 'relation' && entry.relation) {
      setSelectedNode(null); setSelectedArgumentId(null); setSelectedConceptId(null)
      setSelectedRelation(entry.relation)
    } else if (entry.kind === 'concept') {
      setSelectedNode(null); setSelectedArgumentId(null); setSelectedConceptId(entry.id); setSelectedRelation(null)
    } else if (entry.kind === 'argument') {
      setSelectedConceptId(null); setSelectedNode(null); setSelectedArgumentId(entry.id); setSelectedRelation(null)
    } else {
      setSelectedConceptId(null); setSelectedArgumentId(null); setSelectedNode(entry.id); setSelectedRelation(null)
    }
  }

  const prevEntry = nav.cursor > 0 ? nav.entries[nav.cursor - 1] : null
  const nextEntry = nav.cursor < nav.entries.length - 1 ? nav.entries[nav.cursor + 1] : null

  const goBack = () => {
    if (!prevEntry) return
    setNav(prev => ({ ...prev, cursor: prev.cursor - 1 }))
    applyEntry(prevEntry)
  }
  const goForward = () => {
    if (!nextEntry) return
    setNav(prev => ({ ...prev, cursor: prev.cursor + 1 }))
    applyEntry(nextEntry)
  }

  const openArgument = (argId: string) => {
    setSelectedConceptId(null); setSelectedNode(null); setSelectedRelation(null)
    setSelectedArgumentId(argId)
  }
  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))
  const navigateToEntity = (entityId: string) => {
    if (!detail || entityId === detail.argument.id) return
    setSelectedArgumentId(null); setSelectedRelation(null)
    setSelectedNode(entityId)
  }
  const navigateToBlob = (blobId: string) => {
    if (!detail) return
    setSelectedArgumentId(null); setSelectedRelation(null)
    setSelectedNode(blobId)
  }

  const navBar = (prevEntry || nextEntry) ? (
    <div className={styles.navBar}>
      <button className={styles.navBtn} onClick={goBack} disabled={!prevEntry}
        title={prevEntry ? `Back to ${prevEntry.label}` : undefined}>
        <span className={styles.navArrow}>←</span>
        <span className={styles.navLabel}>{prevEntry?.label ?? 'Back'}</span>
      </button>
      <button className={styles.navBtn} onClick={goForward} disabled={!nextEntry}
        title={nextEntry ? `Forward to ${nextEntry.label}` : undefined}>
        <span className={styles.navLabel}>{nextEntry?.label ?? 'Forward'}</span>
        <span className={styles.navArrow}>→</span>
      </button>
      <span className={styles.navSpacer} />
      <span className={styles.navCount}>{nav.cursor + 1} / {nav.entries.length}</span>
    </div>
  ) : null

  // ── Relation mode ────────────────────────────────────────────────────────────
  if (selectedRelation) {
    const rel = selectedRelation
    const relColor = RELATION_COLORS[rel.group] ?? '#6b7280'
    const textColor = rel.group === 'causation' ? '#073b4c' : '#fff'
    return (
      <div className={styles.view}>
        <div className={styles.content}>
          {navBar}
          <div className={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                background: relColor, color: textColor,
                borderRadius: 20, padding: '3px 12px', fontSize: 10, fontWeight: 700,
                textTransform: 'capitalize', flexShrink: 0,
              }}>
                {rel.relation_type.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
                {rel.confidence.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{ color: '#118ab2', fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1, textAlign: 'right' }}
                onClick={() => { setSelectedNode(rel.sourceId); setSelectedArgumentId(null); setSelectedConceptId(null); setSelectedRelation(null) }}
              >
                {rel.sourceLabel}
              </span>
              <svg width="32" height="14" viewBox="0 0 32 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 7H30M22 1L30 7L22 13" stroke={relColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span
                style={{ color: '#118ab2', fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1 }}
                onClick={() => { setSelectedNode(rel.targetId); setSelectedArgumentId(null); setSelectedConceptId(null); setSelectedRelation(null) }}
              >
                {rel.targetLabel}
              </span>
            </div>
          </div>

          {rel.full_predicate && (
            <div style={{ padding: '10px 16px', fontSize: 11, color: '#374151', lineHeight: 1.6, borderBottom: '1px solid rgba(7,59,76,0.08)' }}>
              <span className="sl" style={{ display: 'block', marginBottom: 4 }}>Full predicate</span>
              "{rel.full_predicate}"
            </div>
          )}

          {rel.reasoning && (
            <div style={{ padding: '10px 16px', fontSize: 11, color: '#6b7280', lineHeight: 1.6, borderBottom: '1px solid rgba(7,59,76,0.08)' }}>
              <span className="sl" style={{ display: 'block', marginBottom: 4 }}>Reasoning</span>
              {rel.reasoning}
            </div>
          )}

          {rel.source_document_title && (
            <div style={{ padding: '8px 16px', fontSize: 10, color: '#9ca3af' }}>
              {rel.source_document_title}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Concept mode ─────────────────────────────────────────────────────────────
  if (conceptDetail) {
    return (
      <div className={styles.view}>
        <div className={styles.content}>
          {navBar}
          <div className={styles.header}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span className="sl" style={{ margin: 0 }}>Concept</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#073b4c' }}>{conceptDetail.label}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              {conceptDetail.arguments.length} argument{conceptDetail.arguments.length === 1 ? '' : 's'} across the corpus
            </div>
          </div>

          <div className={styles.splitRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="sl" style={{ display: 'block', marginBottom: 6 }}>Arguments with this concept</span>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conceptDetail.arguments.map(arg => (
                  <div
                    key={arg.id}
                    onClick={() => openArgument(arg.id)}
                    style={{ border: '1px solid rgba(7,59,76,0.1)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', background: '#fafafa' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f0f4f8' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fafafa' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ background: argTypeColor(arg.argument_type), color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 9, fontWeight: 700, textTransform: 'capitalize', flexShrink: 0 }}>
                        {arg.argument_type}
                      </span>
                      <span style={{ fontSize: 9, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {arg.source_document_title}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
                      {arg.full_argument.length > 200 ? arg.full_argument.slice(0, 200) + '…' : arg.full_argument}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.sideCol}>
              <span className="sl" style={{ display: 'block', marginBottom: 6 }}>Documents by share of arguments</span>
              <ConceptMiniMap docStats={conceptDetail.docStats} allDocs={allDocs} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className={styles.empty}>
        Select a node in the Graph view to open its detail.
      </div>
    )
  }

  // ── Argument / Entity mode ───────────────────────────────────────────────────
  return (
    <div className={styles.view}>
      <div className={styles.content}>
        {navBar}

        {detail.argument.type === 'Argument' ? (
          <div className={styles.topRow}>
            <div className={styles.header} style={{ flex: 1, minWidth: 0 }}>
              <div className="sl">{detail.argument.type}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#073b4c', marginBottom: 6 }}>
                {detail.argument.source_document_title}
              </div>
              {detail.argument.full_text && (
                <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
                  "{detail.argument.full_text}"
                </div>
              )}
            </div>
            <div className={styles.mapWrapper}>
              <ArgumentMiniGraph detail={detail} />
            </div>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span className="sl" style={{ margin: 0 }}>{detail.argument.type}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#073b4c' }}>{detail.argument.label}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                {detail.argument.source_document_title}
              </div>
              {detail.argument.full_text && (
                <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
                  "{detail.argument.full_text}"
                </div>
              )}
            </div>
            <div className={styles.splitRow}>
              <div style={{ flex: 1, minWidth: 0 }} />
              <div className={styles.sideCol}>
                <span className="sl" style={{ display: 'block', marginBottom: 6 }}>Documents this entity appears in</span>
                <div className={styles.mapWrapper}>
                  <DetailMiniMap detail={detail} allDocs={allDocs} />
                </div>
              </div>
            </div>
          </>
        )}

        <div className={styles.listWrapper}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
            <span className="sl" style={{ marginBottom: 0 }}>
              {detail.relations.length} relations
            </span>
            <div style={{ flex: 1 }} />
            {(['evidence', 'correlation', 'causation', 'definition'] as const).map(group => (
              <button
                key={group}
                onClick={() => toggleGroup(group)}
                style={{
                  background: visibleGroups[group] ? RELATION_COLORS[group] : 'transparent',
                  border: `1.5px solid ${RELATION_COLORS[group]}`,
                  color: visibleGroups[group] ? (GROUP_TEXT_COLOR[group] ?? '#fff') : RELATION_COLORS[group],
                  borderRadius: 10, padding: '2px 9px', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', textTransform: 'capitalize', transition: 'background 0.15s, color 0.15s',
                }}
              >
                {group}
              </button>
            ))}
          </div>

          <RelationList
            relations={detail.relations}
            argumentBlobs={detail.argumentBlobs}
            visibleGroups={visibleGroups}
            onEntityClick={navigateToEntity}
            onBlobClick={navigateToBlob}
            focalId={detail.argument.id}
            focalLabel={detail.argument.type !== 'Argument' ? detail.argument.label : undefined}
          />
        </div>
      </div>
    </div>
  )
}
