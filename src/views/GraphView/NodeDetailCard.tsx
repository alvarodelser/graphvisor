import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import type { GraphNode, GraphEdge } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  onDismiss: () => void
  onOpenDetail: () => void
}

export function NodeDetailCard({ node, edges, onDismiss, onOpenDetail }: Props) {
  const outgoing = edges
    .filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      return sid === node.id && e.group !== 'structural'
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)

  return (
    <FloatingCard style={{ bottom: 16, right: 16, top: 'auto', left: 'auto', maxWidth: 240 }} onDismiss={onDismiss}>
      <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(7,59,76,0.4)', letterSpacing: '0.08em', marginBottom: 3 }}>
        {node.type.toUpperCase()} · {node.confidence.toFixed(2)}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
        {node.source_document_title
          ? `${node.source_document_title.split(' — ')[0]} · p.${node.page_reference}`
          : node.label}
      </div>
      {node.full_text && (
        <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.45, marginBottom: 8 }}>
          "{node.full_text.slice(0, 120)}{node.full_text.length > 120 ? '…' : ''}"
        </div>
      )}
      {outgoing.map(e => {
        const targetNode = typeof e.target === 'object' ? e.target as GraphNode : null
        return (
          <div key={e.id} className="card-mid" style={{ padding: '5px 8px', marginBottom: 4, borderRadius: 7 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: RELATION_COLORS[e.group] }}>
              {e.relation_type} {e.confidence.toFixed(2)}
            </span>
            {targetNode?.full_text && (
              <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>
                "{targetNode.full_text.slice(0, 60)}…"
              </div>
            )}
          </div>
        )
      })}
      <button
        onClick={onOpenDetail}
        style={{
          width: '100%', background: '#F4A124', color: '#073b4c',
          border: 'none', borderRadius: 7, padding: '6px 0',
          fontSize: 10, fontWeight: 700, cursor: 'pointer', marginTop: 4,
        }}
      >
        Open full detail →
      </button>
    </FloatingCard>
  )
}
