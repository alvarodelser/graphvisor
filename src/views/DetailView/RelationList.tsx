import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { ArgumentRelation, ArgumentBlob } from '../../types'
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

// Amber causation needs dark text for contrast; the rest read on white.
const GROUP_TEXT_COLOR: Record<string, string> = {
  causation: '#073b4c',
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
  relations: ArgumentRelation[]
  argumentBlobs?: ArgumentBlob[]
  visibleGroups: Record<string, boolean>
  onEntityClick?: (entityId: string) => void
  onBlobClick?: (blobId: string) => void
  onRelationClick?: (rel: ArgumentRelation) => void
  focalId: string
  focalLabel?: string
}

export function RelationList({ relations, argumentBlobs, visibleGroups, onEntityClick, onBlobClick, onRelationClick, focalId, focalLabel }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleReasoning = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const visible = relations.filter(r => visibleGroups[r.group])
  const hasArgCol = !!argumentBlobs
  const groups = groupRelations(visible, argumentBlobs)
  const colTemplate = hasArgCol ? '140px 1fr 90px 1fr 40px 1.6fr' : '1fr 90px 1fr 40px 1.6fr'
  // On phones keep full column widths but let the table scroll horizontally.
  const minTableW = narrow ? (hasArgCol ? 620 : 480) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
     <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowX: narrow ? 'auto' : 'hidden' }}>
      <div style={{ minWidth: minTableW, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: colTemplate,
        gap: '0 8px', padding: '4px 12px',
        background: '#fff', borderBottom: '1px solid rgba(7,59,76,0.1)', flexShrink: 0,
      }}>
        {hasArgCol && <span className="sl" style={{ margin: 0 }}>Argument</span>}
        <span className="sl" style={{ margin: 0 }}>Subject</span>
        <span className="sl" style={{ margin: 0 }}>Relation</span>
        <span className="sl" style={{ margin: 0 }}>Object</span>
        <span className="sl" style={{ margin: 0 }}>Conf</span>
        <span className="sl" style={{ margin: 0 }}>Reasoning</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {groups.map((group, gi) => {
          const n = group.relations.length
          const cells: ReactNode[] = []
          const subjectCol = hasArgCol ? 2 : 1

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
            const subjectFocal = focalLabel !== undefined && rel.subject === focalLabel
            const objectFocal  = focalLabel !== undefined && rel.object  === focalLabel
            const subjectNav   = rel.subject_id && rel.subject_id !== focalId
            const objectNav    = rel.target_argument_id && rel.target_argument_id !== focalId

            const contentRow = ri + 1
            const reasonKey = `${gi}-${ri}`
            const isExpanded = expanded.has(reasonKey)

            cells.push(
              <div
                key={`subj-${ri}`}
                onClick={() => subjectNav && onEntityClick?.(rel.subject_id!)}
                style={{
                  gridColumn: subjectCol, gridRow: contentRow,
                  fontSize: 10, lineHeight: 1.4, padding: '8px 4px', alignSelf: 'start',
                  color: subjectFocal ? '#073b4c' : '#374151',
                  fontWeight: subjectFocal ? 700 : 400,
                  cursor: subjectNav ? 'pointer' : 'default',
                  borderRadius: 4,
                }}
                onMouseEnter={e => { if (subjectNav) { e.currentTarget.style.background = '#f4f7fa'; e.currentTarget.style.color = '#073b4c' } }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = subjectFocal ? '#073b4c' : '#374151' }}
              >
                {rel.subject ?? '—'}
              </div>
            )

            cells.push(
              <div key={`rel-${ri}`} style={{
                gridColumn: subjectCol + 1, gridRow: contentRow,
                padding: '8px 0', alignSelf: 'start',
              }}>
                <span
                  onClick={() => onRelationClick?.(rel)}
                  style={{
                    background: RELATION_COLORS[rel.group],
                    color: GROUP_TEXT_COLOR[rel.group] ?? '#fff',
                    borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700,
                    display: 'inline-block', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                    cursor: onRelationClick ? 'pointer' : 'default',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { if (onRelationClick) (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                >
                  {rel.relation_type}
                </span>
              </div>
            )

            cells.push(
              <div
                key={`obj-${ri}`}
                onClick={() => objectNav && onEntityClick?.(rel.target_argument_id)}
                style={{
                  gridColumn: subjectCol + 2, gridRow: contentRow,
                  fontSize: 10, lineHeight: 1.4, padding: '8px 4px', alignSelf: 'start',
                  color: objectFocal ? '#073b4c' : '#374151',
                  fontWeight: objectFocal ? 700 : 400,
                  cursor: objectNav ? 'pointer' : 'default',
                  borderRadius: 4,
                }}
                onMouseEnter={e => { if (objectNav) { e.currentTarget.style.background = '#f4f7fa'; e.currentTarget.style.color = '#073b4c' } }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = objectFocal ? '#073b4c' : '#374151' }}
              >
                {rel.object ?? '—'}
              </div>
            )

            cells.push(
              <span key={`conf-${ri}`} style={{
                gridColumn: subjectCol + 3, gridRow: contentRow,
                fontSize: 10, fontWeight: 700, color: '#F4A124',
                padding: '8px 0', alignSelf: 'start', whiteSpace: 'nowrap',
              }}>
                {rel.confidence.toFixed(2)}
              </span>
            )

            cells.push(
              <div
                key={`reason-${ri}`}
                onClick={() => rel.reasoning && toggleReasoning(reasonKey)}
                style={{
                  gridColumn: subjectCol + 4, gridRow: contentRow,
                  fontSize: 9, color: '#9ca3af', fontStyle: 'italic', lineHeight: 1.4,
                  padding: '8px 0', alignSelf: 'start',
                  cursor: rel.reasoning ? 'pointer' : 'default',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: isExpanded ? 'unset' : 3,
                  overflow: 'hidden',
                }}
              >
                {rel.reasoning ?? '—'}
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
     </div>
    </div>
  )
}
