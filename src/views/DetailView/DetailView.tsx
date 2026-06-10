import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { DetailMiniMap } from './DetailMiniMap'
import { ArgumentMiniGraph } from './ArgumentMiniGraph'
import { RelationList } from './RelationList'
import { ArgumentCards } from './ArgumentCards'
import { RELATION_COLORS } from '../../utils/geometry'
import type { ArgumentDetail, DocNode, RelationGroup } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false, concept: false,
}

export function DetailView() {
  const { selectedNodeId, setSelectedNode, selectedArgumentId, setSelectedArgumentId } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [navStack, setNavStack] = useState<string[]>([])

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    const id = selectedArgumentId ?? selectedNodeId
    if (!id) return
    dataService.getArgumentDetail(id).then(setDetail)
  }, [selectedArgumentId, selectedNodeId])

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
            <div style={{ display: 'flex', gap: 12, flexShrink: 0, minHeight: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {detail.argumentBlobs && detail.argumentBlobs.length > 0 && (
                  <ArgumentCards
                    blobs={detail.argumentBlobs}
                    entityLabel={detail.argument.label}
                    onBlobClick={navigateToBlob}
                  />
                )}
              </div>
              <div style={{ width: 200, flexShrink: 0 }}>
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
