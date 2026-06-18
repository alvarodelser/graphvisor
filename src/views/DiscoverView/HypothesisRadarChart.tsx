import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Hypothesis } from '../../types'

interface HypothesisRadarChartProps {
  scores: Hypothesis['scores']
  size?: number
}

const LABELS: Record<string, string> = {
  novelty: 'Nov',
  scientific_plausibility: 'Sci',
  potential_impact: 'Imp',
  commercial_potential: 'Com',
}

export function HypothesisRadarChart({ scores, size = 100 }: HypothesisRadarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const dimensions = ['novelty', 'scientific_plausibility', 'potential_impact', 'commercial_potential'] as const
    const data = dimensions.map(d => ({ axis: d, value: scores[d] }))

    const labelPad = 16
    const chartRadius = (size / 2) - labelPad
    const angleSlice = (Math.PI * 2) / dimensions.length

    const avg = (data.reduce((s, d) => s + d.value, 0) / data.length).toFixed(1)

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')
      .attr('transform', `translate(${size / 2}, ${size / 2})`)

    // Gridlines (3 levels)
    for (let i = 1; i <= 3; i++) {
      g.append('circle')
        .attr('r', (chartRadius / 3) * i)
        .attr('fill', 'none')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 0.5)
    }

    // Axes + labels
    dimensions.forEach((dim, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const tipX = Math.cos(angle) * chartRadius
      const tipY = Math.sin(angle) * chartRadius

      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', tipX).attr('y2', tipY)
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 0.5)

      const labelR = chartRadius + labelPad * 0.7
      g.append('text')
        .attr('x', Math.cos(angle) * labelR)
        .attr('y', Math.sin(angle) * labelR)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', '600')
        .attr('fill', '#9ca3af')
        .text(LABELS[dim])
    })

    // Data polygon
    const pathData = data.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const r = (d.value / 10) * chartRadius
      return `${i === 0 ? 'M' : 'L'}${Math.cos(angle) * r},${Math.sin(angle) * r}`
    }).join(' ') + 'Z'

    g.append('path')
      .attr('d', pathData)
      .attr('fill', 'rgba(6, 214, 160, 0.25)')
      .attr('stroke', '#06d6a0')
      .attr('stroke-width', 1.5)

    // Avg score in center
    g.append('text')
      .attr('x', 0).attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '700')
      .attr('fill', '#073b4c')
      .text(avg)
  }, [scores, size])

  return (
    <svg ref={svgRef} width={size} height={size} overflow="visible" style={{ flexShrink: 0, margin: '12px' }} />
  )
}
