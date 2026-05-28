import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { detailRailSections } from './DetailFilterRail'
import type { ArgumentDetail, DocNode, RelationGroup } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false,
}

export function DetailView() {
  const { selectedNodeId } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (!selectedNodeId) return
    dataService.getArgumentDetail(selectedNodeId).then(setDetail)
  }, [selectedNodeId])

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  if (!detail) {
    return (
      <div className={styles.empty}>
        Select a node in the Graph view to open its detail.
      </div>
    )
  }

  return (
    <div className={styles.view}>
      <FilterRail sections={detailRailSections({ detail, visibleGroups, onToggleGroup: toggleGroup })} />
      <div className={styles.content}>
        <div className={styles.header}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
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
          <RelationList detail={detail} visibleGroups={visibleGroups} />
        </div>
      </div>
    </div>
  )
}
