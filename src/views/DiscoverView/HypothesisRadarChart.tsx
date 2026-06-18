import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Hypothesis } from '../../types'

interface HypothesisRadarChartProps {
  scores: Hypothesis['scores']
  size?: number
}

export function HypothesisRadarChart({ scores, size = 60 }: HypothesisRadarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const dimensions = ['novelty', 'scientific_plausibility', 'potential_impact', 'commercial_potential'] as const
    const data = dimensions.map(d => ({
      axis: d,
      value: scores[d]
    }))

    const margin = 4
    const radius = (size - margin * 2) / 2
    const angleSlice = (Math.PI * 2) / dimensions.length

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')
      .attr('transform', `translate(${size / 2}, ${size / 2})`)

    // Draw background circles (gridlines)
    const levels = 4
    for (let i = 1; i <= levels; i++) {
      const levelRadius = (radius / levels) * i
      g.append('circle')
        .attr('r', levelRadius)
        .attr('fill', 'none')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', '0.5px')
    }

    // Draw axes and dimension labels
    const labelDistance = radius + 12
    dimensions.forEach((dim, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius

      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', '0.5px')

      const labelX = Math.cos(angle) * labelDistance
      const labelY = Math.sin(angle) * labelDistance

      const shortLabels: Record<string, string> = {
        novelty: 'Nov',
        scientific_plausibility: 'Sci',
        potential_impact: 'Imp',
        commercial_potential: 'Cmm'
      }

      g.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '8px')
        .attr('font-weight', '500')
        .attr('fill', '#6b7280')
        .text(shortLabels[dim] || dim)
    })

    // Draw data polygon
    const points = data.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const r = (d.value / 10) * radius
      return [Math.cos(angle) * r, Math.sin(angle) * r]
    })

    const pathData = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ') + 'Z'

    g.append('path')
      .attr('d', pathData)
      .attr('fill', 'rgba(6, 214, 160, 0.3)')
      .attr('stroke', '#06d6a0')
      .attr('stroke-width', '1px')

    // Draw score values at data points
    data.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const r = (d.value / 10) * radius
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r

      g.append('text')
        .attr('x', x)
        .attr('y', y - 4)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '7px')
        .attr('font-weight', '600')
        .attr('fill', '#06d6a0')
        .text(d.value.toFixed(1))
    })
  }, [scores, size])

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    />
  )
}
