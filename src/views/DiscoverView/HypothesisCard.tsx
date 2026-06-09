import type { Hypothesis } from '../../types'

interface Props {
  hypothesis: Hypothesis
}

const MAX_R = 32
const AXES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]

function toPoints(fractions: number[]): string {
  return fractions
    .map((f, i) => {
      const r = f * MAX_R
      return `${(Math.cos(AXES[i]) * r).toFixed(2)},${(Math.sin(AXES[i]) * r).toFixed(2)}`
    })
    .join(' ')
}

const GRID_RINGS = [0.25, 0.5, 0.75, 1.0].map(f => toPoints([f, f, f, f]))

export function HypothesisCard({ hypothesis }: Props) {
  const { decision, scores } = hypothesis
  const avg = (scores.novelty + scores.scientific_plausibility + scores.potential_impact + scores.commercial_potential) / 4
  const isAdvance = decision === 'ADVANCE'
  const accentColor = isAdvance ? '#06d6a0' : '#F4A124'
  const fillColor = isAdvance ? 'rgba(6,214,160,0.15)' : 'rgba(244,161,36,0.15)'

  const scorePoints = toPoints([
    scores.novelty / 10,
    scores.scientific_plausibility / 10,
    scores.potential_impact / 10,
    scores.commercial_potential / 10,
  ])

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid rgba(7,59,76,0.08)',
      boxShadow: '0 1px 4px rgba(7,59,76,0.06)',
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: accentColor,
          background: isAdvance ? 'rgba(6,214,160,0.1)' : 'rgba(244,161,36,0.1)',
          padding: '3px 8px',
          borderRadius: 8,
        }}>
          {decision}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#073b4c' }}>
          {avg.toFixed(1)}<span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>/10</span>
        </span>
      </div>

      <p style={{
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.55,
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }} title={hypothesis.hypothesis}>
        {hypothesis.hypothesis}
      </p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={80} height={80} viewBox={`${-MAX_R - 10} ${-MAX_R - 10} ${(MAX_R + 10) * 2} ${(MAX_R + 10) * 2}`}>
          {GRID_RINGS.map((pts, i) => (
            <polygon key={i} points={pts} fill="none" stroke="rgba(7,59,76,0.08)" strokeWidth={0.7} />
          ))}
          <polygon points={scorePoints} fill={fillColor} stroke={accentColor} strokeWidth={1.5} />
          {(['N', 'P', 'I', 'C'] as const).map((label, i) => {
            const r = MAX_R + 7
            const x = Math.cos(AXES[i]) * r
            const y = Math.sin(AXES[i]) * r
            return (
              <text
                key={label}
                x={x.toFixed(2)}
                y={(y + 2).toFixed(2)}
                fontSize={7}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#9ca3af"
                fontFamily="system-ui, sans-serif"
              >
                {label}
              </text>
            )
          })}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
        {[
          ['N', scores.novelty],
          ['P', scores.scientific_plausibility],
          ['I', scores.potential_impact],
          ['C', scores.commercial_potential],
        ].map(([label, val]) => (
          <span key={label as string} style={{
            fontSize: 8,
            fontWeight: 700,
            background: 'rgba(7,59,76,0.06)',
            color: '#073b4c',
            padding: '2px 6px',
            borderRadius: 6,
          }}>
            {label} {val}
          </span>
        ))}
      </div>
    </div>
  )
}
