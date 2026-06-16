export interface BeeswarmItem { id: string; year: number }
export interface BeeswarmOpts {
  xOf: (year: number) => number
  centerY: number
  radius: number
}

/**
 * Deterministic beeswarm: x is fixed to the item's year; same-year items are
 * stacked alternately above/below centerY, separated by at least one diameter.
 * y carries no value meaning — it is pure collision spacing (density).
 */
export function computeBeeswarm(
  items: BeeswarmItem[],
  { xOf, centerY, radius }: BeeswarmOpts,
): Map<string, { x: number; y: number }> {
  const diameter = radius * 2
  const byYear = new Map<number, BeeswarmItem[]>()
  for (const it of items) {
    if (!byYear.has(it.year)) byYear.set(it.year, [])
    byYear.get(it.year)!.push(it)
  }

  const pos = new Map<string, { x: number; y: number }>()
  for (const [year, group] of byYear) {
    // Stable order within a year for determinism
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const x = xOf(year)
    group.forEach((it, i) => {
      // 0 → center, 1 → +d, 2 → -d, 3 → +2d, 4 → -2d, ...
      const rank = Math.ceil(i / 2)
      const sign = i % 2 === 1 ? 1 : -1
      const y = centerY + (i === 0 ? 0 : sign * rank * diameter)
      pos.set(it.id, { x, y })
    })
  }
  return pos
}
