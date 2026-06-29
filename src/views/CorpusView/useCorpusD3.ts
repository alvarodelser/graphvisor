import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { DocNode, SizeBy } from '../../types'
import type { ConceptGrounding } from '../../data/dataset'
import { isPointInPolygon } from '../../utils/geometry'

interface Options {
  selectedIds: Set<string>
  sizeBy: SizeBy
  conceptGroundings: ConceptGrounding[]
  onLassoSelect: (ids: string[], shiftKey: boolean) => void
  onClickToggle: (id: string, shiftKey: boolean) => void
  setTooltip: (t: { doc: DocNode; x: number; y: number } | null) => void
}

const DOT_DEFAULT = '#74b9d6'
const DOT_SELECTED = '#ef476f'

const hasImpactData = (d: DocNode) => d.citations > 0

const dotFill = (d: DocNode, selected: boolean, sizeBy: SizeBy) => {
  if (selected) return DOT_SELECTED
  if (sizeBy === 'impact' && !hasImpactData(d)) return 'white'
  return DOT_DEFAULT
}

const dotStroke = (d: DocNode, selected: boolean, sizeBy: SizeBy) => {
  if (selected) return DOT_SELECTED
  if (sizeBy === 'impact' && !hasImpactData(d)) return DOT_DEFAULT
  return 'none'
}

export function useCorpusD3(
  svgRef: RefObject<SVGSVGElement | null>,
  docs: DocNode[],
  opts: Options
) {
  const simPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const optsRef = useRef(opts)
  optsRef.current = opts

  const xScaleRef = useRef<d3.ScaleLinear<number, number>>()
  const yScaleRef = useRef<d3.ScaleLinear<number, number>>()

  useEffect(() => {
    if (!svgRef.current || docs.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()

    const pad = 60
    const xScale = d3.scaleLinear()
      .domain(d3.extent(docs, d => d.pca_x) as [number, number]).range([pad, width - pad])
    const yScale = d3.scaleLinear()
      .domain(d3.extent(docs, d => d.pca_y) as [number, number]).range([height - pad, pad])
    xScaleRef.current = xScale
    yScaleRef.current = yScale

    const sizeVals = docs.map(dd => opts.sizeBy === 'argument_count' ? dd.argument_count : dd.citations)
    const sizeExt = d3.extent(sizeVals) as [number, number]
    const sizeScale = opts.sizeBy === 'uniform' ? null : d3.scaleLinear().domain(sizeExt).range([4, 9])
    const getRadius = (d: DocNode) => {
      if (!sizeScale) return 6
      if (opts.sizeBy === 'impact' && !hasImpactData(d)) return 4
      const val = opts.sizeBy === 'argument_count' ? d.argument_count : d.citations
      return sizeScale(val)
    }

    const simNodes = docs.map(d => ({
      id: d.id, data: d,
      x: xScale(d.pca_x), y: yScale(d.pca_y),
      r: getRadius(d),
    }))
    const sim = d3.forceSimulation(simNodes)
      .force('collide', d3.forceCollide<typeof simNodes[0]>(n => n.r + 2).strength(0.3))
      .stop()
    for (let i = 0; i < 60; i++) sim.tick()
    simNodes.forEach(n => simPositions.current.set(n.id, { x: n.x, y: n.y }))

    const zoomG = svg.append('g').attr('class', 'zoom-group')

    // Dot grid
    const gridDefs = svg.insert('defs', ':first-child')
    const pat = gridDefs.append('pattern')
      .attr('id', 'corpus-dot-grid').attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 40).attr('height', 40)
    pat.append('circle').attr('cx', 20).attr('cy', 20).attr('r', 0.8)
      .attr('fill', '#073b4c').attr('opacity', 0.18)
    zoomG.append('rect')
      .attr('x', -5000).attr('y', -5000).attr('width', 10000).attr('height', 10000)
      .attr('fill', 'url(#corpus-dot-grid)').attr('pointer-events', 'none')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform)
        zoomG.classed('titles-visible', event.transform.k >= 2.0)
      })
    svg.call(zoom)

    // Concept labels
    if (opts.conceptGroundings.length > 0) {
      const CHAR_PX = 4.2
      type LabelNode = d3.SimulationNodeDatum & {
        g: ConceptGrounding; ax: number; ay: number; hw: number; label: string
      }
      const labelNodes: LabelNode[] = opts.conceptGroundings.map(g => {
        const label = g.concept.length > 24 ? g.concept.slice(0, 24) + '…' : g.concept
        const ax = xScale(g.pca_x), ay = yScale(g.pca_y)
        return { g, x: ax, y: ay, ax, ay, hw: label.length * CHAR_PX * 0.5 + 3, label }
      })
      const labelSim = d3.forceSimulation<LabelNode>(labelNodes)
        .force('collide', d3.forceCollide<LabelNode>(n => n.hw + 2).strength(0.9))
        .force('x', d3.forceX<LabelNode>(n => n.ax).strength(0.18))
        .force('y', d3.forceY<LabelNode>(n => n.ay).strength(0.18))
        .stop()
      for (let i = 0; i < 200; i++) labelSim.tick()
      const labelG = zoomG.append('g').attr('class', 'concept-labels')
      labelNodes.forEach(n => {
        labelG.append('text')
          .attr('x', n.x ?? n.ax).attr('y', n.y ?? n.ay)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('pointer-events', 'none')
          .attr('fill', '#8b5cf6').attr('font-size', '8px').attr('font-weight', '500')
          .attr('letter-spacing', '0.05em').attr('opacity', 0.5)
          .text(n.label)
      })
    }

    // Dots — purely visual, no pointer events (hitRect below handles all interaction)
    const dotLayer = zoomG.append('g').attr('class', 'dots').attr('pointer-events', 'none')

    dotLayer.selectAll<SVGCircleElement, DocNode>('circle')
      .data(docs, d => d.id)
      .join('circle')
      .attr('class', 'corpus-dot')
      .attr('cx', d => simPositions.current.get(d.id)?.x ?? xScale(d.pca_x))
      .attr('cy', d => simPositions.current.get(d.id)?.y ?? yScale(d.pca_y))
      .attr('r', d => getRadius(d))
      .attr('fill', d => dotFill(d, optsRef.current.selectedIds.has(d.id), opts.sizeBy))
      .attr('stroke', d => dotStroke(d, optsRef.current.selectedIds.has(d.id), opts.sizeBy))
      .attr('stroke-width', d => (opts.sizeBy === 'impact' && !hasImpactData(d)) ? 1.5 : 4)
      .attr('stroke-opacity', d =>
        (opts.sizeBy === 'impact' && !hasImpactData(d) && !optsRef.current.selectedIds.has(d.id)) ? 1 : 0.4
      )

    // Title labels
    zoomG.append('g').attr('class', 'title-layer')
      .selectAll<SVGTextElement, DocNode>('text')
      .data(docs, d => d.id)
      .join('text')
      .attr('class', 'doc-title')
      .attr('x', d => simPositions.current.get(d.id)?.x ?? xScale(d.pca_x))
      .attr('y', d => (simPositions.current.get(d.id)?.y ?? yScale(d.pca_y)) + getRadius(d) + 10)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('fill', '#073b4c').attr('font-size', '9px')
      .text(d => d.title.length > 20 ? d.title.slice(0, 20) + '…' : d.title)

    // ── Interaction overlay ──────────────────────────────────────────────────
    // Sits on top of everything. Dots have pointer-events:none so this rect
    // receives all mouse events uniformly — no dot can block a lasso start.
    const hitRect = zoomG.append('rect')
      .attr('class', 'hit-layer')
      .attr('x', -width * 4).attr('y', -height * 4)
      .attr('width', width * 8).attr('height', height * 8)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')

    // Nearest dot within its radius (used for hover and click)
    const nearestDot = (mx: number, my: number, radiusMult = 1): DocNode | null => {
      let nearest: DocNode | null = null
      let nearestDist = Infinity
      dotLayer.selectAll<SVGCircleElement, DocNode>('circle').each(function(d) {
        const cx = +d3.select(this).attr('cx')
        const cy = +d3.select(this).attr('cy')
        const r = +d3.select(this).attr('r')
        const dist = Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2)
        if (dist <= r * radiusMult && dist < nearestDist) { nearest = d; nearestDist = dist }
      })
      return nearest
    }

    // Hover / tooltip
    hitRect
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        const hit = nearestDot(mx, my, 1.5)
        hitRect.style('cursor', hit ? 'pointer' : 'default')
        if (hit) {
          const [sx, sy] = d3.pointer(event, svgEl)
          optsRef.current.setTooltip({ doc: hit, x: sx, y: sy })
        } else {
          optsRef.current.setTooltip(null)
        }
      })
      .on('mouseleave', () => {
        hitRect.style('cursor', 'default')
        optsRef.current.setTooltip(null)
      })

    // Lasso + click (drag distinguishes the two)
    let lassoPath: [number, number][] = []
    let lassoEl: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null
    let lassoShiftKey = false
    let lassoActive = false
    let dragOrigin: [number, number] = [0, 0]

    const lassoBehavior = d3.drag<SVGRectElement, unknown>()
      .on('start', (event) => {
        event.sourceEvent?.stopPropagation()  // prevent zoom pan from firing on SVG parent
        lassoShiftKey = !!event.sourceEvent?.shiftKey
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        dragOrigin = [mx, my]
        lassoPath = [[mx, my]]
        lassoActive = false
      })
      .on('drag', (event) => {
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        lassoPath.push([mx, my])
        const dx = mx - dragOrigin[0], dy = my - dragOrigin[1]
        if (!lassoActive && Math.sqrt(dx * dx + dy * dy) > 6) {
          lassoActive = true
          lassoEl = zoomG.append('path')
            .attr('class', 'lasso')
            .attr('fill', 'rgba(244,161,36,0.08)')
            .attr('stroke', '#F4A124')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5 3')
        }
        if (lassoActive) {
          lassoEl?.attr('d', 'M' + lassoPath.map(p => p.join(',')).join('L') + 'Z')
        }
      })
      .on('end', (event) => {
        if (lassoActive && lassoPath.length > 3) {
          const inside: string[] = []
          dotLayer.selectAll<SVGCircleElement, DocNode>('circle').each(function(d) {
            const cx = +d3.select(this).attr('cx')
            const cy = +d3.select(this).attr('cy')
            if (isPointInPolygon([cx, cy], lassoPath)) inside.push(d.id)
          })
          optsRef.current.onLassoSelect(inside, lassoShiftKey)
        } else if (!lassoActive) {
          const [mx, my] = dragOrigin
          const hit = nearestDot(mx, my, 1.5)
          if (hit) optsRef.current.onClickToggle(hit.id, event.sourceEvent?.shiftKey || false)
        }
        lassoEl?.remove()
        lassoEl = null
        lassoPath = []
        lassoActive = false
      })

    hitRect.call(lassoBehavior)

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      if (!xScaleRef.current || !yScaleRef.current) return
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      xScaleRef.current.range([pad, w - pad])
      yScaleRef.current.range([h - pad, pad])
      const xS = xScaleRef.current, yS = yScaleRef.current
      d3.select(svgEl).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
        .attr('cx', d => xS(d.pca_x)).attr('cy', d => yS(d.pca_y))
      d3.select(svgEl).selectAll<SVGTextElement, DocNode>('.doc-title')
        .attr('x', d => xS(d.pca_x)).attr('y', d => yS(d.pca_y) + 14)
      hitRect.attr('x', -w * 4).attr('y', -h * 4).attr('width', w * 8).attr('height', h * 8)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    return () => { observer.disconnect() }
  }, [docs, opts.sizeBy, opts.conceptGroundings])

  // Sync dot colors on selection change
  useEffect(() => {
    if (!svgRef.current) return
    const { selectedIds, sizeBy } = optsRef.current
    d3.select(svgRef.current).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
      .attr('fill', d => dotFill(d, selectedIds.has(d.id), sizeBy))
      .attr('stroke', d => dotStroke(d, selectedIds.has(d.id), sizeBy))
  }, [opts.selectedIds])

  return {}
}
