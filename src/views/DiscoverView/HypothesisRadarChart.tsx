import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Hypothesis } from '../../types'
import { scoreColor } from './scoreColor'

interface HypothesisRadarChartProps {
  scores: Hypothesis['scores']
  size?: number
  /** When sorting by a specific dimension, that dimension's value stays visible without hover. */
  highlightDimension?: keyof Hypothesis['scores']
  /** When true, always show full dimension names and scores without requiring hover. */
  alwaysExpanded?: boolean
}

const LABELS: Record<string, string> = {
  novelty: 'Nov',
  scientific_plausibility: 'Sci',
  potential_impact: 'Imp',
  commercial_potential: 'Com',
}

const LABELS_FULL: Record<string, string> = {
  novelty: 'Novelty',
  scientific_plausibility: 'Plausibility',
  potential_impact: 'Impact',
  commercial_potential: 'Commercial',
}

// Reserve horizontal room for the side names (which expand on hover) and sit the
// chart left of centre so the right-hand name has space to grow rightward.
const PAD_L = 30
const PAD_R = 58

export function HypothesisRadarChart({ scores, size = 100, highlightDimension, alwaysExpanded = false }: HypothesisRadarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const svgWidth = size + PAD_L + PAD_R
  const svgHeight = size
  const originX = PAD_L + size / 2
  const originY = size / 2

  useEffect(() => {
    if (!svgRef.current) return

    const dimensions = ['novelty', 'scientific_plausibility', 'potential_impact', 'commercial_potential'] as const
    const data = dimensions.map(d => ({ axis: d, value: scores[d] }))

    const labelPad = 16
    const chartRadius = (size / 2) - labelPad
    const angleSlice = (Math.PI * 2) / dimensions.length

    const avgNum = data.reduce((s, d) => s + d.value, 0) / data.length
    const avg = avgNum.toFixed(1)
    const c = scoreColor(avgNum)
    const polyColor = c.solid
    const polyFill = c.bg

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')
      .attr('transform', `translate(${originX}, ${originY})`)

    // Gridlines (3 levels)
    for (let i = 1; i <= 3; i++) {
      g.append('circle')
        .attr('r', (chartRadius / 3) * i)
        .attr('fill', 'none')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 0.5)
    }

    // Axes + labels (name on the inner side, value pinned just outside it so the
    // two never overlap the polygon edge or each other)
    type TextSel = d3.Selection<SVGTextElement, unknown, null, undefined>
    const valueLabels: TextSel[] = []
    const nameLabels: { sel: TextSel; dim: string }[] = []
    dimensions.forEach((dim, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const tipX = Math.cos(angle) * chartRadius
      const tipY = Math.sin(angle) * chartRadius

      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', tipX).attr('y2', tipY)
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 0.5)

      // Stack number + name so they never collide. Top/bottom axes stack
      // radially (number inner, name pushed further out). Left/right axes stack
      // vertically (name on top of number) and are anchored OUTWARD — growing
      // away from the plot — so the expanded name never re-enters the chart.
      const isRight = i === 1
      const isLeft = i === 3
      let numX: number, numY: number, nameX: number, nameY: number
      let anchor: 'start' | 'middle' | 'end' = 'middle'
      if (isRight || isLeft) {
        const sideR = chartRadius + 5
        numX = (isRight ? 1 : -1) * sideR
        numY = 6
        nameX = numX
        nameY = -6
        anchor = isRight ? 'start' : 'end'
      } else {
        numX = Math.cos(angle) * (chartRadius + labelPad * 0.45)
        numY = Math.sin(angle) * (chartRadius + labelPad * 0.45)
        nameX = Math.cos(angle) * (chartRadius + labelPad * 1.35)
        nameY = Math.sin(angle) * (chartRadius + labelPad * 1.35)
      }

      const persistent = highlightDimension === dim
      valueLabels.push(
        g.append('text')
          .attr('x', numX)
          .attr('y', numY)
          .attr('text-anchor', anchor)
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '9px')
          .attr('font-weight', '700')
          .attr('fill', polyColor)
          .attr('opacity', (alwaysExpanded || persistent) ? 1 : 0)
          .attr('data-persistent', persistent ? '1' : '0')
          .text(Number(scores[dim]).toFixed(1))
      )

      const nameLabel = g.append('text')
        .attr('x', nameX)
        .attr('y', nameY)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', '600')
        .attr('fill', '#9ca3af')
        .text(alwaysExpanded ? LABELS_FULL[dim] : LABELS[dim])
      nameLabels.push({ sel: nameLabel, dim })
    })

    // Data polygon
    const pathData = data.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const r = (d.value / 10) * chartRadius
      return `${i === 0 ? 'M' : 'L'}${Math.cos(angle) * r},${Math.sin(angle) * r}`
    }).join(' ') + 'Z'

    g.append('path')
      .attr('d', pathData)
      .attr('fill', polyFill)
      .attr('stroke', polyColor)
      .attr('stroke-width', 1.5)

    // Avg score in center
    g.append('text')
      .attr('x', 0).attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '700')
      .attr('fill', polyColor)
      .text(avg)

    if (!alwaysExpanded) {
      svg
        .on('mouseenter', () => {
          valueLabels.forEach(t => t.attr('opacity', 1))
          nameLabels.forEach(({ sel, dim }) => sel.text(LABELS_FULL[dim]))
        })
        .on('mouseleave', () => {
          valueLabels.forEach(t => t.attr('opacity', t.attr('data-persistent') === '1' ? 1 : 0))
          nameLabels.forEach(({ sel, dim }) => sel.text(LABELS[dim]))
        })
    }
  }, [scores, size, highlightDimension, alwaysExpanded])

  return (
    <svg ref={svgRef} width={svgWidth} height={svgHeight} overflow="visible" style={{ flexShrink: 0, margin: '12px' }} />
  )
}
