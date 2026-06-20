export type LodMode = 'full' | 'calm' | 'lean' | 'blocked'

// Entity-count thresholds selecting the level-of-detail mode (inclusive-low).
export const LOD_THRESHOLDS = { calm: 400, lean: 800, blocked: 1200 } as const

export function lodMode(count: number): LodMode {
  if (count >= LOD_THRESHOLDS.blocked) return 'blocked'
  if (count >= LOD_THRESHOLDS.lean) return 'lean'
  if (count >= LOD_THRESHOLDS.calm) return 'calm'
  return 'full'
}

export type MeterLevel = 'ok' | 'warn' | 'over'

// Demand meter state: how many of `bars` are lit, and the colour band. `ok` below
// 60% of the limit, `warn` approaching it, `over` at/above the limit.
export function meterFill(count: number, limit: number, bars: number): { filled: number; level: MeterLevel } {
  const ratio = limit > 0 ? count / limit : 0
  const filled = Math.max(0, Math.min(bars, Math.ceil(ratio * bars)))
  const level: MeterLevel = ratio >= 1 ? 'over' : ratio >= 0.6 ? 'warn' : 'ok'
  return { filled, level }
}
