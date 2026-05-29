import type { ArgumentDetail, RelationGroup } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail?: ArgumentDetail
  visibleGroups: Record<RelationGroup, boolean>
  onToggleGroup: (group: RelationGroup) => void
}

export function detailRailSections({ visibleGroups, onToggleGroup }: Props) {
  return [
    {
      id: 'filter', label: 'Filter',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['positive', 'negative', 'causal'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={visibleGroups[group]}
                onChange={() => onToggleGroup(group)}
                style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              <span style={{ width: 8, height: 8, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 2, flexShrink: 0 }} />
            </label>
          ))}
        </div>
      ),
    },
  ]
}
