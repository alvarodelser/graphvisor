import type { GraphNode } from '../../types'

const TYPE_BG: Record<string, string> = {
  Argument: '#073b4c',
  Entity: '#118ab2',
  Concept: '#74b9d6',
}
const TYPE_FG: Record<string, string> = {
  Argument: '#fff',
  Entity: '#fff',
  Concept: '#073b4c',
}

interface Props {
  node: GraphNode
  x: number
  y: number
}

export function HoverTooltip({ node, x, y }: Props) {
  return (
    <div
      className="card"
      style={{
        position: 'absolute', left: x + 12, top: y + 12,
        padding: '6px 10px', fontSize: 10, pointerEvents: 'none',
        zIndex: 150, display: 'flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        background: TYPE_BG[node.type] ?? '#073b4c',
        color: TYPE_FG[node.type] ?? '#fff',
        borderRadius: 4, padding: '1px 6px', fontSize: 8, fontWeight: 700,
      }}>
        {node.type}
      </span>
      <span style={{ color: '#073b4c', fontWeight: 600 }}>{node.label}</span>
      <span style={{ color: '#F4A124', fontWeight: 700 }}>{node.confidence.toFixed(2)}</span>
    </div>
  )
}
