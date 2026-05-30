import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingPanel } from '../../components/FloatingPanel/FloatingPanel'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { RELATION_COLORS } from '../../utils/geometry'
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
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (!selectedNodeId) return
    dataService.getArgumentDetail(selectedNodeId).then(setDetail)
  }, [selectedNodeId])

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

        {/* Filter FAB — inside .content which has position: relative via the view layout */}
        <FloatingPanel
          icon="⚙" label="Filters"
          open={filterOpen} onToggle={() => setFilterOpen(v => !v)}
          fabBottom={20} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Relation groups</div>
            {(['positive', 'negative', 'causal'] as const).map(group => (
              <label key={group} style={checkRow}>
                <input type="checkbox"
                  checked={visibleGroups[group]}
                  onChange={() => toggleGroup(group)}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ width: 10, height: 10, borderRadius: 2, background: RELATION_COLORS[group], flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#374151', textTransform: 'capitalize' }}>{group}</span>
              </label>
            ))}
          </div>
        </FloatingPanel>

        {/* Legend FAB */}
        <FloatingPanel
          icon="◈" label="Legend"
          open={legendOpen} onToggle={() => setLegendOpen(v => !v)}
          fabBottom={68} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Relation groups</div>
            {([
              ['positive', 'Positive', RELATION_COLORS.positive],
              ['negative', 'Negative', RELATION_COLORS.negative],
              ['causal',   'Causal',   RELATION_COLORS.causal],
            ] as const).map(([, lbl, color]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#374151' }}>{lbl}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#073b4c', opacity: 0.5, marginBottom: 8,
}
const checkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
}
