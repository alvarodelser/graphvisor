export type LodMode = 'full' | 'calm' | 'lean' | 'blocked'

// Entity-count thresholds selecting the level-of-detail mode (inclusive-low).
export const LOD_THRESHOLDS = { calm: 120, lean: 210, blocked: 300 } as const

export function lodMode(count: number): LodMode {
  if (count >= LOD_THRESHOLDS.blocked) return 'blocked'
  if (count >= LOD_THRESHOLDS.lean) return 'lean'
  if (count >= LOD_THRESHOLDS.calm) return 'calm'
  return 'full'
}
