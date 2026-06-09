import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { RELATION_COLORS } from '../../utils/geometry'
import type { ArgumentDetail, DocNode, RelationGroup, ArgumentRelation } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false,
}

export function DetailView() {
  const { activeView, selectedNodeId, setSelectedNode, selectedArgumentId } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [navStack, setNavStack] = useState<string[]>([])

  const isActive = activeView === 'detail'

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    const id = selectedArgumentId ?? selectedNodeId
    if (!id) return
    dataService.getArgumentDetail(id).then(setDetail)
  }, [selectedArgumentId, selectedNodeId])

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  const navigateToArgument = (rel: ArgumentRelation) => {
    if (!detail || !rel.target_argument_id || rel.target_argument_id === detail.argument.id) return
    setNavStack(prev => [...prev, detail.argument.id])
    setSelectedNode(rel.target_argument_id)
  }

  const navigateBack = () => {
    if (navStack.length === 0) return
    const prevId = navStack[navStack.length - 1]
    setNavStack(s => s.slice(0, -1))
    setSelectedNode(prevId)
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

        <div className={styles.header}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#073b4c', marginBottom: 6 }}>
            {detail.argument.source_document_title}
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            "{detail.argument.full_text}"
          </div>
        </div>

        <div className={styles.mapWrapper}>
          <DetailMiniMap detail={detail} allDocs={allDocs} isActive={isActive} />
        </div>

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
            detail={detail}
            visibleGroups={visibleGroups}
            onRowClick={navigateToArgument}
            focalId={detail.argument.id}
          />
        </div>
      </div>
    </div>
  )
}
