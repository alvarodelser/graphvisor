import type { ReactNode } from 'react'
import type { ArgumentDetail, ArgumentRelation, ArgumentBlob } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

const ARGUMENT_TYPE_COLORS: Record<string, string> = {
  mechanistic: '#6366f1',
  evidence:    '#059669',
  hypothesis:  '#d97706',
  causal:      '#ef4444',
}

function argTypeColor(type: string): string {
  return ARGUMENT_TYPE_COLORS[type.toLowerCase()] ?? '#6b7280'
}

const GROUP_TEXT_COLOR: Record<string, string> = {
  positive: '#fff', negative: '#fff', causal: '#073b4c', structural: '#073b4c',
}

interface RelGroup {
  blobId: string | null
  blob: ArgumentBlob | null
  relations: ArgumentRelation[]
}

function groupRelations(relations: ArgumentRelation[], blobs: ArgumentBlob[] | undefined): RelGroup[] {
  if (!blobs) {
    return relations.map(r => ({ blobId: null, blob: null, relations: [r] }))
  }
  const blobById = new Map(blobs.map(b => [b.id, b]))
  const groups: RelGroup[] = []
  const seen = new Map<string, RelGroup>()
  for (const rel of relations) {
    const key = rel.source_argument_id ?? '__none__'
    if (!seen.has(key)) {
      const resolvedBlobId = rel.source_argument_id && blobById.has(rel.source_argument_id)
        ? rel.source_argument_id
        : null
      const g: RelGroup = {
        blobId: resolvedBlobId,
        blob: resolvedBlobId ? (blobById.get(resolvedBlobId) ?? null) : null,
        relations: [],
      }
      seen.set(key, g)
      groups.push(g)
    }
    seen.get(key)!.relations.push(rel)
  }
  return groups
}

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
  onRowClick: (rel: ArgumentRelation) => void
  onBlobClick?: (blobId: string) => void
  focalId: string
}

export function RelationList({ detail, visibleGroups, onRowClick, onBlobClick, focalId }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])
  const hasArgCol = !!detail.argumentBlobs
  const groups = groupRelations(visible, detail.argumentBlobs)
  const colTemplate = hasArgCol ? '140px 90px 36px 1fr 1fr' : '90px 36px 1fr 1fr'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: colTemplate,
        gap: '0 8px', padding: '4px 12px',
        background: '#fff', borderBottom: '1px solid rgba(7,59,76,0.1)', flexShrink: 0,
      }}>
        {hasArgCol && <span className="sl" style={{ margin: 0 }}>Argument</span>}
        <span className="sl" style={{ margin: 0 }}>Relation</span>
        <span className="sl" style={{ margin: 0 }}>Conf</span>
        <span className="sl" style={{ margin: 0 }}>Source</span>
        <span className="sl" style={{ margin: 0 }}>Predicate</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {groups.map((group, gi) => {
          const n = group.relations.length
          const cells: ReactNode[] = []
          const relCol = hasArgCol ? 2 : 1

          if (hasArgCol) {
            cells.push(
              <div
                key="arg"
                onClick={() => group.blobId && onBlobClick?.(group.blobId)}
                style={{
                  gridColumn: 1, gridRow: `1 / ${n + 1}`,
                  padding: '8px 6px',
                  borderRight: '1px solid rgba(7,59,76,0.06)',
                  cursor: group.blobId ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
                onMouseEnter={e => { if (group.blobId) e.currentTarget.style.background = '#f4f7fa' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                {group.blob && (
                  <>
                    <span style={{
                      background: argTypeColor(group.blob.argument_type), color: '#fff',
                      borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                      textTransform: 'capitalize', alignSelf: 'flex-start',
                    }}>
                      {group.blob.argument_type}
                    </span>
                    <div style={{ fontSize: 9, color: '#374151', lineHeight: 1.4 }}>
                      {group.blob.full_argument.length > 80
                        ? group.blob.full_argument.slice(0, 80) + '…'
                        : group.blob.full_argument}
                    </div>
                  </>
                )}
              </div>
            )
          }

          group.relations.forEach((rel, ri) => {
            const isSelf = rel.target_argument_id === focalId

            cells.push(
              <div key={`rel-${ri}`} style={{
                gridColumn: relCol, gridRow: ri + 1,
                padding: '8px 0', alignSelf: 'start',
              }}>
                <span style={{
                  background: RELATION_COLORS[rel.group],
                  color: GROUP_TEXT_COLOR[rel.group] ?? '#fff',
                  borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700,
                  display: 'inline-block', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                }}>
                  {rel.relation_type}
                </span>
              </div>
            )
            cells.push(
              <span key={`conf-${ri}`} style={{
                gridColumn: relCol + 1, gridRow: ri + 1,
                fontSize: 10, fontWeight: 700, color: '#F4A124',
                padding: '8px 0', alignSelf: 'start', whiteSpace: 'nowrap',
              }}>
                {rel.confidence.toFixed(2)}
              </span>
            )
            cells.push(
              <div
                key={`src-${ri}`}
                onClick={() => { if (!hasArgCol && !isSelf) onRowClick(rel) }}
                style={{
                  gridColumn: relCol + 2, gridRow: ri + 1,
                  fontSize: 10, fontWeight: 600, color: '#073b4c',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  minWidth: 0, padding: '8px 0', alignSelf: 'start',
                  cursor: (!hasArgCol && !isSelf) ? 'pointer' : 'default',
                  opacity: isSelf ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!hasArgCol && !isSelf) e.currentTarget.style.color = '#1a6b8a' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#073b4c' }}
              >
                {rel.source_document_title.split(' — ')[0]} · p.{rel.page_reference}
              </div>
            )
            cells.push(
              <div
                key={`pred-${ri}`}
                onClick={() => { if (hasArgCol && !isSelf) onRowClick(rel) }}
                style={{
                  gridColumn: relCol + 3, gridRow: ri + 1,
                  fontSize: 10, color: '#374151', lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  padding: '8px 0', minWidth: 0, alignSelf: 'start',
                  cursor: (hasArgCol && !isSelf) ? 'pointer' : 'default',
                }}
                onMouseEnter={e => { if (hasArgCol && !isSelf) e.currentTarget.style.background = '#f4f7fa' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                "{rel.full_predicate}"
              </div>
            )
          })

          return (
            <div
              key={gi}
              style={{
                display: 'grid', gridTemplateColumns: colTemplate,
                gap: '0 8px', padding: '0 12px',
                borderBottom: '1px solid rgba(7,59,76,0.06)',
              }}
            >
              {cells}
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
