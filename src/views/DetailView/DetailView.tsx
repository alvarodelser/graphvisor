import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { detailRailSections } from './DetailFilterRail'
import type { ArgumentDetail, DocNode, RelationGroup, ArgumentRelation } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false,
}

export function DetailView() {
  const { selectedNodeId, setSelectedNode } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [navStack, setNavStack] = useState<string[]>([])

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (!selectedNodeId) return
    dataService.getArgumentDetail(selectedNodeId).then(d => {
      setDetail(d)
    })
  }, [selectedNodeId])

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  const navigateToArgument = (rel: ArgumentRelation) => {
    if (!detail || !rel.target_argument_id || rel.target_argument_id === detail.argument.id) return
    setNavStack(prev => [...prev, detail.argument.id])
    setSelectedNode(rel.target_argument_id)
    dataService.getArgumentDetail(rel.target_argument_id).then(setDetail)
  }

  const navigateBack = () => {
    if (navStack.length === 0) return
    const prevId = navStack[navStack.length - 1]
    setNavStack(s => s.slice(0, -1))
    setSelectedNode(prevId)
    dataService.getArgumentDetail(prevId).then(setDetail)
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
      <FilterRail sections={detailRailSections({ visibleGroups, onToggleGroup: toggleGroup })} />
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
          <DetailMiniMap detail={detail} allDocs={allDocs} />
        </div>
        <div className={styles.listWrapper}>
          <div className="sl" style={{ padding: '0 0 6px' }}>
            {detail.relations.length} relations across corpus
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
