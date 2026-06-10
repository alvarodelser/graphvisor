export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function computeRadialTiers(
  nodes: { id: string; type: string }[],
  edges: { source: string | { id: string }; target: string | { id: string } }[]
): Map<string, number> {
  const getId = (s: string | { id: string }) => (typeof s === 'string' ? s : s.id)
  const degree = new Map<string, number>()
  nodes.filter(n => n.type === 'Argument').forEach(n => degree.set(n.id, 0))
  edges.forEach(e => {
    const sid = getId(e.source); const tid = getId(e.target)
    if (degree.has(sid)) degree.set(sid, (degree.get(sid) ?? 0) + 1)
    if (degree.has(tid)) degree.set(tid, (degree.get(tid) ?? 0) + 1)
  })
  const sorted = [...degree.entries()].sort((a, b) => b[1] - a[1])
  const tierSize = Math.max(1, Math.ceil(sorted.length / 4))
  const tiers = new Map<string, number>()
  sorted.forEach(([id], i) => tiers.set(id, Math.min(3, Math.floor(i / tierSize))))
  return tiers
}

export const RELATION_COLORS: Record<string, string> = {
  positive: '#06d6a0',
  negative: '#ef476f',
  causal: '#ffd166',
  structural: 'rgba(7,59,76,0.2)',
  concept: '#6366f1',
}
