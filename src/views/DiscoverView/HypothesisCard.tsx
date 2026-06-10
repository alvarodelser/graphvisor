import type { Hypothesis } from '../../types'

interface Props {
  hypothesis: Hypothesis
}

const MAX_R = 28
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

      {/* Radar chart — viewBox sized to fit full-name labels on all 4 axes */}
      <svg width="100%" viewBox="-105 -58 210 128" style={{ display: 'block', overflow: 'visible' }}>
        {GRID_RINGS.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke="rgba(7,59,76,0.08)" strokeWidth={0.7} />
        ))}
        <polygon points={scorePoints} fill={fillColor} stroke={accentColor} strokeWidth={1.5} />

        {/* Novelty — top */}
        <text textAnchor="middle" fontFamily="system-ui, sans-serif">
          <tspan x="0" y="-46" fontSize={6} fill="#9ca3af">Novelty</tspan>
          <tspan x="0" dy="9" fontSize={9} fontWeight={800} fill={accentColor}>{scores.novelty}</tspan>
        </text>

        {/* Plausibility — right */}
        <text textAnchor="start" fontFamily="system-ui, sans-serif">
          <tspan x="33" y="-5" fontSize={6} fill="#9ca3af">Plausibility</tspan>
          <tspan x="33" dy="9" fontSize={9} fontWeight={800} fill={accentColor}>{scores.scientific_plausibility}</tspan>
        </text>

        {/* Impact — bottom */}
        <text textAnchor="middle" fontFamily="system-ui, sans-serif">
          <tspan x="0" y="38" fontSize={9} fontWeight={800} fill={accentColor}>{scores.potential_impact}</tspan>
          <tspan x="0" dy="9" fontSize={6} fill="#9ca3af">Impact</tspan>
        </text>

        {/* Commercial — left */}
        <text textAnchor="end" fontFamily="system-ui, sans-serif">
          <tspan x="-33" y="-5" fontSize={6} fill="#9ca3af">Commercial</tspan>
          <tspan x="-33" dy="9" fontSize={9} fontWeight={800} fill={accentColor}>{scores.commercial_potential}</tspan>
        </text>
      </svg>
    </div>
  )
}
