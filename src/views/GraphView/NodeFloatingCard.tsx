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
}

export function NodeFloatingCard({ item, sticky, onDismiss }: Props) {
  if (item.type === 'concept') {
    return (
      <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
        {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
        <div className={styles.header}>
          <span style={{ background: '#6366f1', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 8, fontWeight: 700 }}>
            CONCEPT
          </span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#073b4c', marginTop: 6, lineHeight: 1.4 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>
          {item.argCount} argument{item.argCount === 1 ? '' : 's'}
        </div>
      </div>
    )
  }

  if (item.type === 'blob') {
    const { blob } = item
    const snippet = blob.full_argument.length > 160
      ? blob.full_argument.slice(0, 160) + '…'
      : blob.full_argument
    return (
      <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
        {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
        <div className={styles.header}>
          <span style={{ background: 'rgba(100,116,139,0.18)', color: '#475569', border: '1px solid rgba(100,116,139,0.35)', borderRadius: 4, padding: '1px 6px', fontSize: 8, fontWeight: 700 }}>
            ARGUMENT · {blob.argument_type}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>{blob.confidence.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5, marginTop: 6, fontStyle: 'italic' }}>
          "{snippet}"
        </div>
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>
          {blob.source_document_title} · {blob.entityIds.length} entities
        </div>
      </div>
    )
  }

  if (item.type === 'edge') {
    const { edge, sourceNode, targetNode } = item
    const subjectText = sourceNode?.full_text ? `"${sourceNode.full_text.slice(0, 60)}…"` : sourceNode?.label ?? '?'
    const objectText  = targetNode?.full_text ? `"${targetNode.full_text.slice(0, 60)}…"` : targetNode?.label ?? '?'
    return (
      <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
        {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
        <div className={styles.edgeHeader}>
          <span className="sl" style={{ margin: 0 }}>Relation</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>{edge.confidence.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: '#073b4c', lineHeight: 1.4 }}>
            {subjectText}
          </div>
          <span style={{ background: RELATION_COLORS[edge.group], color: edge.group === 'causation' ? '#073b4c' : '#fff', borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {edge.relation_type}
          </span>
          <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: '#073b4c', lineHeight: 1.4 }}>
            {objectText}
          </div>
        </div>
        {edge.full_predicate && (
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5, marginTop: 8, fontStyle: 'italic' }}>
            "{edge.full_predicate}"
          </div>
        )}
        {edge.reasoning && (
          <div style={{ marginTop: 8 }}>
            <span className="sl" style={{ display: 'block', marginBottom: 2 }}>Reasoning</span>
            <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.5 }}>{edge.reasoning}</div>
          </div>
        )}
        {edge.source_document_title && (
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>
            {edge.source_document_title}
          </div>
        )}
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
      {node.type !== 'Argument' && (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#073b4c', marginTop: 6, lineHeight: 1.4 }}>
          {node.label}
        </div>
      )}
      {node.full_text && (
        <div className={styles.fullText}>"{node.full_text}"</div>
      )}
      {node.source_document_title && (
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
          {node.source_document_title}{node.page_reference != null ? ` · p.${node.page_reference}` : ''}
        </div>
      )}
    </div>
  )
}
