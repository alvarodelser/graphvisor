import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { DetailMiniMap } from './DetailMiniMap'
import { ConceptMiniMap } from './ConceptMiniMap'
import { ArgumentMiniGraph } from './ArgumentMiniGraph'
import { RelationList } from './RelationList'
import { ArgumentCards } from './ArgumentCards'
import { RELATION_COLORS } from '../../utils/geometry'
import type { ArgumentDetail, ConceptDetail, DocNode, RelationGroup } from '../../types'
import styles from './DetailView.module.css'

const ARGUMENT_TYPE_COLORS: Record<string, string> = {
  mechanistic: '#6366f1', evidence: '#059669', hypothesis: '#d97706', causal: '#ef4444',
}
const argTypeColor = (t: string) => ARGUMENT_TYPE_COLORS[t.toLowerCase()] ?? '#6b7280'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false, concept: false,
}

export function DetailView() {
  const {
    selectedNodeId, setSelectedNode, selectedArgumentId, setSelectedArgumentId,
    selectedConceptId, setSelectedConceptId,
  } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [conceptDetail, setConceptDetail] = useState<ConceptDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [navStack, setNavStack] = useState<string[]>([])

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

  const openArgument = (argId: string) => {
    setSelectedConceptId(null)
    setSelectedNode(null)
    setSelectedArgumentId(argId)
  }

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  const navigateToEntity = (entityId: string) => {
    if (!detail || entityId === detail.argument.id) return
    setNavStack(prev => [...prev, detail.argument.id])
    setSelectedArgumentId(null)
    setSelectedNode(entityId)
  }

  const navigateBack = () => {
    if (navStack.length === 0) return
    const prevId = navStack[navStack.length - 1]
    setNavStack(s => s.slice(0, -1))
    setSelectedArgumentId(null)
    setSelectedNode(prevId)
  }

  const navigateToBlob = (blobId: string) => {
    if (!detail) return
    setNavStack(prev => [...prev, detail.argument.id])
    setSelectedArgumentId(null)
    setSelectedNode(blobId)
  }

  if (conceptDetail) {
    return (
      <div className={styles.view}>
        <div className={styles.content}>
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
              <div style={{
                maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {conceptDetail.arguments.map(arg => (
                  <div
                    key={arg.id}
                    onClick={() => openArgument(arg.id)}
                    style={{
                      border: '1px solid rgba(7,59,76,0.1)', borderRadius: 6,
                      padding: '7px 10px', cursor: 'pointer', background: '#fafafa',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f0f4f8' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fafafa' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{
                        background: argTypeColor(arg.argument_type), color: '#fff',
                        borderRadius: 10, padding: '1px 7px', fontSize: 9, fontWeight: 700,
                        textTransform: 'capitalize', flexShrink: 0,
                      }}>
                        {arg.argument_type}
                      </span>
                      <span style={{
                        fontSize: 9, color: '#6b7280',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
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
              <span className="sl" style={{ display: 'block', marginBottom: 6 }}>
                Documents by share of arguments
              </span>
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

  return (
    <div className={styles.view}>
      <div className={styles.content}>
        {navStack.length > 0 && (
          <button onClick={navigateBack} className={styles.breadcrumb}>
            ← {navStack.length > 1 ? `${navStack.length} levels back` : 'Back'}
          </button>
        )}

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
              <div style={{ flex: 1, minWidth: 0 }}>
                {detail.argumentBlobs && detail.argumentBlobs.length > 0 && (
                  <ArgumentCards
                    blobs={detail.argumentBlobs}
                    entityLabel={detail.argument.label}
                    onBlobClick={navigateToBlob}
                  />
                )}
              </div>
              <div className={styles.sideCol}>
                <span className="sl" style={{ display: 'block', marginBottom: 6 }}>
                  Documents this entity appears in
                </span>
                <div className={styles.mapWrapper}>
                  <DetailMiniMap detail={detail} allDocs={allDocs} />
                </div>
              </div>
            </div>
          </>
        )}

        <div className={styles.listWrapper}>
          {/* Inline relation group filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
            <span className="sl" style={{ marginBottom: 0 }}>
              {detail.relations.length} relations
            </span>
            <div style={{ flex: 1 }} />
            {(['positive', 'negative', 'causal'] as const).map(group => (
              <button
                key={group}
                onClick={() => toggleGroup(group)}
                style={{
                  background: visibleGroups[group] ? RELATION_COLORS[group] : 'transparent',
                  border: `1.5px solid ${RELATION_COLORS[group]}`,
                  color: visibleGroups[group] ? '#fff' : RELATION_COLORS[group],
                  borderRadius: 10,
                  padding: '2px 9px',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'background 0.15s, color 0.15s',
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
