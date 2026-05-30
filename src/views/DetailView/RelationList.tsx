import type { ArgumentDetail, ArgumentRelation } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
  onRowClick: (rel: ArgumentRelation) => void
  focalId: string
}

const GROUP_TEXT_COLOR: Record<string, string> = {
  positive: '#fff', negative: '#fff', causal: '#073b4c', structural: '#073b4c',
}

export function RelationList({ detail, visibleGroups, onRowClick, focalId }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Sticky header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 36px 1fr 1fr',
        gap: '0 8px', padding: '4px 12px',
        background: '#fff', borderBottom: '1px solid rgba(7,59,76,0.1)', flexShrink: 0,
      }}>
        <span className="sl" style={{ margin: 0 }}>Relation</span>
        <span className="sl" style={{ margin: 0 }}>Conf</span>
        <span className="sl" style={{ margin: 0 }}>Source</span>
        <span className="sl" style={{ margin: 0 }}>Argument Text</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.map((rel, i) => {
          const isSelf = rel.target_argument_id === focalId
          return (
            <div
              key={i}
              onClick={() => !isSelf && onRowClick(rel)}
              style={{
                display: 'grid', gridTemplateColumns: '90px 36px 1fr 1fr',
                gap: '0 8px', padding: '8px 12px',
                borderBottom: '1px solid rgba(7,59,76,0.06)',
                alignItems: 'start',
                cursor: isSelf ? 'default' : 'pointer',
                opacity: isSelf ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = '#f4f7fa' }}
              onMouseLeave={e => { e.currentTarget.style.background = '' }}
            >
              <span style={{
                background: RELATION_COLORS[rel.group],
                color: GROUP_TEXT_COLOR[rel.group] ?? '#fff',
                borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700,
                display: 'inline-block', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
              }}>
                {rel.relation_type}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124', paddingTop: 1, whiteSpace: 'nowrap' }}>
                {rel.confidence.toFixed(2)}
              </span>
              <div style={{
                fontSize: 10, fontWeight: 600, color: '#073b4c',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              }}>
                {rel.source_document_title.split(' — ')[0]} · p.{rel.page_reference}
              </div>
              <div style={{
                fontSize: 10, color: '#374151', lineHeight: 1.4,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                "{rel.full_predicate}"
              </div>
            </div>
          )
        })}
        {visible.length === 0 && (
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 24 }}>
            No relations match current filters.
          </div>
        )}
      </div>
    </div>
  )
}
