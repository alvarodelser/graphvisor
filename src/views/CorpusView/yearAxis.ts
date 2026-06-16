export interface YearScale {
  domain: [number, number]
  scale: (year: number) => number
}

/**
 * Linear year → x-pixel mapping shared by the timeline beeswarm and the stats
 * stream so their axes align. `left`/`right` are inner pixel bounds.
 */
export function makeYearScale(years: number[], left: number, right: number): YearScale {
  const min = Math.min(...years)
  const max = Math.max(...years)
  const span = max - min
  const scale = (year: number) =>
    span === 0 ? (left + right) / 2 : left + ((year - min) / span) * (right - left)
  return { domain: [min, max], scale }
}
