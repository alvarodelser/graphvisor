import styles from './NodePanel.module.css'
import type { GraphNode, GraphEdge } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

const TYPE_BG: Record<string, string> = {
  Argument: '#073b4c',
  Entity: '#118ab2',
  Concept: '#74b9d6',
}

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  onDismiss: () => void
  onOpenDetail: () => void
}

export function NodePanel({ node, edges, onDismiss, onOpenDetail }: Props) {
  const outgoing = edges
    .filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      return sid === node.id && e.group !== 'structural'
    })
    .sort((a, b) => b.confidence - a.confidence)

  return (
    <div className={styles.panel}>
      <button className={styles.close} onClick={onDismiss}>×</button>
      <div className={styles.header}>
        <span
          className={styles.typeChip}
          style={{ background: TYPE_BG[node.type] ?? '#073b4c' }}
        >
          {node.type}
        </span>
        <span className={styles.conf}>{node.confidence.toFixed(2)}</span>
      </div>
      {node.full_text && (
        <div className={styles.fullText}>"{node.full_text}"</div>
      )}
      {node.source_document_title && (
        <div className={styles.source}>
          {node.source_document_title}
          {node.page_reference != null ? ` · p.${node.page_reference}` : ''}
        </div>
      )}
      <div className={styles.relList}>
        {outgoing.map(e => {
          const target = typeof e.target === 'object' ? e.target as GraphNode : null
          return (
            <div key={e.id} className={styles.relRow}>
              <span style={{ color: RELATION_COLORS[e.group], fontWeight: 700, fontSize: 9, flexShrink: 0 }}>
                {e.relation_type}
              </span>
              <span className={styles.relConf}>{e.confidence.toFixed(2)}</span>
              <span className={styles.relTarget}>→ {target?.label ?? ''}</span>
            </div>
          )
        })}
        {outgoing.length === 0 && (
          <div style={{ fontSize: 10, color: '#9ca3af' }}>No outgoing semantic relations.</div>
        )}
      </div>
      <button className={styles.detailBtn} onClick={onOpenDetail}>
        Open in Detail View →
      </button>
    </div>
  )
}
