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

// Color per semantic relation group. Polarity (positive/negative) is no longer
// encoded — each of the four groups gets one distinct hue, plus concept.
export const RELATION_COLORS: Record<string, string> = {
  evidence: '#3b82f6',     // blue  — "A is a tool for discovering B"
  correlation: '#8b5cf6',  // violet — "A and B behave similarly"
  causation: '#f59e0b',    // amber — "A influences B"
  definition: '#6b7280',   // gray  — "A explains B"
  concept: '#6366f1',
}
