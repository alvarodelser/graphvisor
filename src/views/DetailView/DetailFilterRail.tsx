import type { ArgumentDetail, RelationGroup } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<RelationGroup, boolean>
  onToggleGroup: (group: RelationGroup) => void
}

export function detailRailSections({ detail, visibleGroups, onToggleGroup }: Props) {
  return [
    {
      id: 'focus', label: 'Focus',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c' }}>{detail.argument.id}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>{detail.argument.source_document_title}</div>
          <div style={{ fontSize: 9, color: '#F4A124', fontWeight: 700 }}>
            conf {detail.argument.confidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', label: 'Filter',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['positive', 'negative', 'causal'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={visibleGroups[group]}
                onChange={() => onToggleGroup(group)}
                style={{ accentColor: '#073b4c' }}
              />
              <span style={{ width: 14, height: 2, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 1 }} />
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </label>
          ))}
        </div>
      ),
    },
  ]
}
