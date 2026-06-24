import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { DetailMiniMap } from './DetailMiniMap'
import { ConceptMiniMap } from './ConceptMiniMap'
import { ArgumentMiniGraph } from './ArgumentMiniGraph'
import { RelationList } from './RelationList'
import { RELATION_COLORS } from '../../utils/geometry'
import type { DocHoverInfo } from './DetailMiniMap'
import type { PanelInfo } from './ArgumentMiniGraph'
import type { ConceptHoverInfo } from './ConceptMiniMap'
import type {
  ArgumentDetail, ArgumentRelation, ConceptDetail, DocNode,
  RelationGroup, SelectedRelation,
} from '../../types'
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

// ── Shared hover panel components ────────────────────────────────────────────

function EntityHoverPanel({ info }: { info: DocHoverInfo }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', lineHeight: 1.3, marginBottom: 6 }}>
        {info.doc.title}
      </div>
      {info.isFocal && (
        <div style={{ fontSize: 9, color: '#ef476f', fontWeight: 600, marginBottom: 4 }}>Source document</div>
      )}
      {!info.isFocal && info.relInfo && (
        <div style={{ marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: RELATION_COLORS[info.relInfo.group as RelationGroup], display: 'block', marginBottom: 3,
          }}>
            {info.relInfo.group}
          </span>
          {info.relInfo.relations.map((r, i) => (
            <div key={i} style={{ fontSize: 9, color: '#6b7280', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.type.replace(/_/g, ' ').toLowerCase()}
              </span>
              <span style={{ color: '#9ca3af', flexShrink: 0 }}>{r.confidence.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {!info.isFocal && !info.relInfo && (
        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>Not directly related</div>
      )}
      <div style={{ fontSize: 9, color: '#9ca3af', borderTop: '1px solid rgba(7,59,76,0.06)', paddingTop: 4, marginTop: 4 }}>
        {info.doc.citations} citations · {info.doc.argument_count} args
      </div>
    </>
  )
}

function ArgHoverPanel({ panel }: { panel: PanelInfo }) {
  if (panel.kind === 'node') {
    return (
      <>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', lineHeight: 1.3, marginBottom: 6 }}>
          {panel.label}
        </div>
        {panel.rels.map((r, i) => (
          <div key={i} style={{ fontSize: 9, color: '#6b7280', display: 'flex', gap: 4, marginBottom: 2, lineHeight: 1.4 }}>
            <span style={{ color: '#9ca3af', flexShrink: 0 }}>{r.out ? '→' : '←'}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#F4A124' }}>{r.type}</span>{' '}{r.other}
            </span>
            <span style={{ color: '#d1d5db', flexShrink: 0 }}>{r.confidence.toFixed(2)}</span>
          </div>
        ))}
      </>
    )
  }
  const edgeColor = panel.group === 'structural' ? '#64748b' : RELATION_COLORS[panel.group as RelationGroup]
  return (
    <>
      <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 3 }}>relation</div>
      <div style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.6 }}>
        <span style={{ color: '#073b4c', fontWeight: 600 }}>{panel.subject}</span>
        {' '}
        <span style={{ color: edgeColor, fontWeight: 700 }}>{panel.relation}</span>
        {' '}
        <span style={{ color: '#073b4c', fontWeight: 600 }}>{panel.object}</span>
      </div>
      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
        confidence {panel.confidence.toFixed(2)}
      </div>
    </>
  )
}

function ConceptHoverPanel({ info }: { info: ConceptHoverInfo }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', lineHeight: 1.3, marginBottom: 6 }}>
        {info.doc.title}
      </div>
      {info.stat && info.stat.withConcept > 0 ? (
        <div style={{ fontSize: 9, color: '#6366f1', fontWeight: 600, marginBottom: 4 }}>
          {info.stat.withConcept} / {info.stat.total} args
          {' '}({Math.round((info.stat.withConcept / info.stat.total) * 100)}%)
        </div>
      ) : (
        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>No arguments with this concept</div>
      )}
      <div style={{ fontSize: 9, color: '#9ca3af', borderTop: '1px solid rgba(7,59,76,0.06)', paddingTop: 4, marginTop: 4 }}>
        {info.doc.citations} citations · {info.doc.argument_count} args
      </div>
    </>
  )
}

function HoverPlaceholder({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', paddingTop: 20, lineHeight: 1.5 }}>
      {text}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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

  // Hover state per mode
  const [entityHover, setEntityHover] = useState<DocHoverInfo | null>(null)
  const [argPanel, setArgPanel] = useState<PanelInfo | null>(null)
  const [conceptHover, setConceptHover] = useState<ConceptHoverInfo | null>(null)

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

  // Reset hover when selection changes
  useEffect(() => { setEntityHover(null); setArgPanel(null); setConceptHover(null) },
    [selectedNodeId, selectedArgumentId, selectedConceptId, selectedRelation])

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
  const handleRelationClick = (rel: ArgumentRelation) => {
    if (!detail) return
    const selRel: SelectedRelation = {
      id: `${detail.argument.id}-${rel.relation_type}-${rel.target_argument_id}-${rel.source_argument_id ?? ''}`,
      relation_type: rel.relation_type,
      confidence: rel.confidence,
      group: rel.group,
      full_predicate: rel.full_predicate,
      source_document_title: rel.source_document_title,
      reasoning: rel.reasoning,
      sourceId: rel.subject_id ?? detail.argument.id,
      sourceLabel: rel.subject ?? detail.argument.label,
      targetId: rel.target_argument_id,
      targetLabel: rel.object ?? rel.target_argument_id,
    }
    setSelectedArgumentId(null); setSelectedNode(null); setSelectedConceptId(null)
    setSelectedRelation(selRel)
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span
                style={{ color: '#118ab2', fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1, textAlign: 'right' }}
                onClick={() => { setSelectedNode(rel.sourceId); setSelectedArgumentId(null); setSelectedConceptId(null); setSelectedRelation(null) }}
              >
                {rel.sourceLabel}
              </span>
              <svg width="52" height="14" viewBox="0 -7 52 14" fill="none" style={{ flexShrink: 0, overflow: 'visible' }}>
                <defs>
                  <clipPath id="chev-rel-detail">
                    <polygon points="0,-6 44,-6 52,0 44,6 0,6" />
                  </clipPath>
                </defs>
                <polygon
                  points="0,-6 44,-6 52,0 44,6 0,6"
                  fill={`${relColor}15`}
                  stroke={relColor}
                  strokeWidth="1"
                  strokeLinejoin="miter"
                  opacity="0.85"
                />
                <g clipPath="url(#chev-rel-detail)">
                  <polyline points="10,-6 18,0 10,6" fill="none" stroke={relColor} strokeWidth="2" strokeLinejoin="miter" opacity="0.55" />
                  <polyline points="30,-6 38,0 30,6" fill="none" stroke={relColor} strokeWidth="2" strokeLinejoin="miter" opacity="0.55" />
                </g>
              </svg>
              <span
                style={{ color: '#118ab2', fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 1 }}
                onClick={() => { setSelectedNode(rel.targetId); setSelectedArgumentId(null); setSelectedConceptId(null); setSelectedRelation(null) }}
              >
                {rel.targetLabel}
              </span>
            </div>
            {rel.source_document_title && (
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{rel.source_document_title}</div>
            )}
          </div>

          {rel.full_predicate && (
            <div style={{ padding: '10px 16px', fontSize: 11, color: '#374151', lineHeight: 1.6, borderBottom: '1px solid rgba(7,59,76,0.08)' }}>
              <span className="sl" style={{ display: 'block', marginBottom: 4 }}>Full predicate</span>
              "{rel.full_predicate}"
            </div>
          )}
          {rel.reasoning && (
            <div style={{ padding: '10px 16px', fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
              <span className="sl" style={{ display: 'block', marginBottom: 4 }}>Reasoning</span>
              {rel.reasoning}
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

          <div className={styles.threeCol}>
            <div className={styles.infoCol}>
              <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span className="sl" style={{ margin: 0 }}>Concept</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#073b4c' }}>{conceptDetail.label}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  {conceptDetail.arguments.length} argument{conceptDetail.arguments.length === 1 ? '' : 's'} across the corpus
                </div>
              </div>
            </div>

            <div className={styles.canvasCol}>
              <ConceptMiniMap
                docStats={conceptDetail.docStats}
                allDocs={allDocs}
                onHoverChange={setConceptHover}
              />
            </div>

            <div className={styles.hoverCol}>
              {conceptHover
                ? <ConceptHoverPanel info={conceptHover} />
                : <HoverPlaceholder text="Hover a document to see concept coverage" />
              }
            </div>
          </div>

          <div className={styles.listWrapper}>
            <span className="sl" style={{ display: 'block', marginBottom: 8, flexShrink: 0 }}>Arguments with this concept</span>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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

        <div className={styles.threeCol}>
          {/* Left — info */}
          <div className={styles.infoCol}>
            {detail.argument.type === 'Argument' ? (
              <div className={styles.header}>
                <div className="sl">{detail.argument.type}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#073b4c', marginBottom: 6 }}>
                  {detail.argument.source_document_title}
                </div>
                {detail.argument.full_text && (
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                    "{detail.argument.full_text}"
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span className="sl" style={{ margin: 0 }}>{detail.argument.type}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#073b4c' }}>{detail.argument.label}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  {detail.argument.source_document_title}
                </div>
                {detail.argument.full_text && (
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                    "{detail.argument.full_text}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center — canvas */}
          <div className={styles.canvasCol}>
            {detail.argument.type === 'Argument' ? (
              <ArgumentMiniGraph detail={detail} onPanelChange={setArgPanel} />
            ) : (
              <DetailMiniMap detail={detail} allDocs={allDocs} onHoverChange={setEntityHover} />
            )}
          </div>

          {/* Right — hover panel */}
          <div className={styles.hoverCol}>
            {detail.argument.type === 'Argument' ? (
              argPanel
                ? <ArgHoverPanel panel={argPanel} />
                : <HoverPlaceholder text="Hover an entity or relation" />
            ) : (
              entityHover
                ? <EntityHoverPanel info={entityHover} />
                : <HoverPlaceholder text="Hover a document to explore" />
            )}
          </div>
        </div>

        {/* Relations table */}
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
            onRelationClick={handleRelationClick}
            focalId={detail.argument.id}
            focalLabel={detail.argument.type !== 'Argument' ? detail.argument.label : undefined}
          />
        </div>
      </div>
    </div>
  )
}
