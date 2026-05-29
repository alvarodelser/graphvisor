import styles from './NodeFloatingCard.module.css'
import { RELATION_COLORS } from '../../utils/geometry'
import type { HoverItem } from './useGraphD3'

const TYPE_BG: Record<string, string> = {
  Argument: '#073b4c', Entity: '#118ab2', Concept: '#74b9d6',
}
const TYPE_FG: Record<string, string> = {
  Argument: '#fff', Entity: '#fff', Concept: '#073b4c',
}

interface Props {
  item: NonNullable<HoverItem>
  sticky: boolean
  onDismiss: () => void
  onOpenDetail: () => void
}

export function NodeFloatingCard({ item, sticky, onDismiss, onOpenDetail }: Props) {
  if (item.type === 'edge') {
    const { edge, sourceNode, targetNode } = item
    return (
      <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
        {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
        <div className={styles.edgeHeader}>
          <span style={{ background: RELATION_COLORS[edge.group], color: edge.group === 'causal' ? '#073b4c' : '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 700 }}>
            {edge.relation_type}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>{edge.confidence.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 10, color: '#073b4c', marginTop: 6 }}>
          <span style={{ fontWeight: 600 }}>{sourceNode?.label ?? '?'}</span>
          <span style={{ color: '#9ca3af', margin: '0 6px' }}>→</span>
          <span style={{ fontWeight: 600 }}>{targetNode?.label ?? '?'}</span>
        </div>
      </div>
    )
  }

  const { node } = item
  return (
    <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
      {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
      <div className={styles.header}>
        <span style={{ background: TYPE_BG[node.type] ?? '#073b4c', color: TYPE_FG[node.type] ?? '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 8, fontWeight: 700 }}>
          {node.type}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>{node.confidence.toFixed(2)}</span>
      </div>
      {node.full_text && (
        <div className={styles.fullText}>"{node.full_text}"</div>
      )}
      {node.source_document_title && (
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
          {node.source_document_title}{node.page_reference != null ? ` · p.${node.page_reference}` : ''}
        </div>
      )}
      {sticky && node.type === 'Argument' && (
        <button className={styles.detailBtn} onClick={onOpenDetail}>Open in Detail View →</button>
      )}
    </div>
  )
}
