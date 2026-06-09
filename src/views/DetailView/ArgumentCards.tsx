import type { ArgumentBlob } from '../../types'

const ARGUMENT_TYPE_COLORS: Record<string, string> = {
  mechanistic: '#6366f1',
  evidence:    '#059669',
  hypothesis:  '#d97706',
  causal:      '#ef4444',
}

function argTypeColor(type: string): string {
  return ARGUMENT_TYPE_COLORS[type.toLowerCase()] ?? '#6b7280'
}

function highlightText(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === label.toLowerCase()
      ? <mark key={i} style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : <span key={i}>{part}</span>
  )
}

interface Props {
  blobs: ArgumentBlob[]
  entityLabel: string
  onBlobClick: (blobId: string) => void
}

export function ArgumentCards({ blobs, entityLabel, onBlobClick }: Props) {
  if (blobs.length === 0) return null

  return (
    <div style={{
      maxHeight: 180, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '8px 12px',
      borderBottom: '1px solid rgba(7,59,76,0.1)',
    }}>
      <span className="sl" style={{ marginBottom: 2, flexShrink: 0 }}>
        {blobs.length} argument{blobs.length !== 1 ? 's' : ''} mentioning this entity
      </span>
      {blobs.map(blob => (
        <div
          key={blob.id}
          onClick={() => onBlobClick(blob.id)}
          style={{
            border: '1px solid rgba(7,59,76,0.1)', borderRadius: 6,
            padding: '7px 10px', cursor: 'pointer', background: '#fafafa', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f0f4f8' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fafafa' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              background: argTypeColor(blob.argument_type), color: '#fff',
              borderRadius: 10, padding: '1px 7px', fontSize: 9, fontWeight: 700,
              textTransform: 'capitalize', flexShrink: 0,
            }}>
              {blob.argument_type}
            </span>
            <span style={{
              fontSize: 9, color: '#6b7280',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {blob.source_document_title}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            {highlightText(blob.full_argument, entityLabel)}
          </div>
        </div>
      ))}
    </div>
  )
}
