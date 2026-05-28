import type { ArgumentDetail } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
}

export function RelationList({ detail, visibleGroups }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
      {visible.map((rel, i) => (
        <div key={i} className="card-mid" style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              background: RELATION_COLORS[rel.group], color: rel.group === 'causal' ? '#073b4c' : '#fff',
              borderRadius: 20, padding: '2px 8px', fontSize: 9, fontWeight: 700,
            }}>
              {rel.relation_type}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#F4A124' }}>{rel.confidence.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#073b4c', marginBottom: 2 }}>
            {rel.source_document_title} · p.{rel.page_reference}
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            "{rel.full_predicate}"
          </div>
        </div>
      ))}
      {visible.length === 0 && (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 24 }}>
          No relations match current filters.
        </div>
      )}
    </div>
  )
}
