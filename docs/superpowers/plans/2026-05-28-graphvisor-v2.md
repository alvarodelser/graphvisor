# GraphVisor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign GraphVisor v1 with a navy/gold chrome system, improved corpus and graph views, animated edges, hover interactions, and a compact detail view.

**Architecture:** Six focused tasks — chrome first, then Corpus View, then Graph View (three passes: animations, interaction panel, hover-mute), then Detail View. Each task commits independently. All changes are in existing files except three new Graph View components.

**Tech Stack:** React 18, TypeScript, D3 v7, Zustand, Vite, CSS Modules, global CSS keyframes

---

## File Map

**Modified:**
- `src/styles/global.css` — add edge animation keyframes
- `src/components/Shell/Shell.module.css` — navy top bar, gold active tab, gold CTA
- `src/components/FilterRail/FilterRail.tsx` — render label text, not icon; make icon optional
- `src/components/FilterRail/FilterRail.module.css` — 120px width, navy bg, gold active border
- `src/views/CorpusView/useCorpusD3.ts` — dot colors, rings, title labels on zoom, ResizeObserver
- `src/views/CorpusView/CorpusView.tsx` — lasso chip, updated section labels
- `src/views/CorpusView/CorpusView.module.css` — crosshair cursor on canvas
- `src/views/GraphView/useGraphD3.ts` — missing links fix, SVG defs/markers, edge CSS classes, pulse timer, hover callbacks, adjacency-based muting, ResizeObserver
- `src/views/GraphView/GraphView.tsx` — hover + panel state, new components, canvas click dismiss
- `src/views/GraphView/GraphView.module.css` — panel flex layout
- `src/views/GraphView/GraphFilterRail.tsx` — remove icon fields, fix label
- `src/views/DetailView/RelationList.tsx` — compact table rows
- `src/views/DetailView/DetailView.module.css` — header padding, separator
- `src/views/DetailView/DetailFilterRail.tsx` — remove icon fields, fix label

**Created:**
- `src/views/GraphView/HoverTooltip.tsx` — small floating div on node hover
- `src/views/GraphView/NodePanel.tsx` — 280px right-side click panel
- `src/views/GraphView/NodePanel.module.css` — panel styles

**Deleted:**
- `src/views/GraphView/NodeDetailCard.tsx` — replaced by NodePanel

---

### Task 1: Chrome + FilterRail

**Files:**
- Modify: `src/components/Shell/Shell.module.css`
- Modify: `src/components/FilterRail/FilterRail.tsx`
- Modify: `src/components/FilterRail/FilterRail.module.css`
- Modify: `src/views/CorpusView/CorpusView.tsx` (labels only)
- Modify: `src/views/GraphView/GraphFilterRail.tsx` (labels only)
- Modify: `src/views/DetailView/DetailFilterRail.tsx` (labels only)

- [ ] **Step 1: Replace Shell.module.css**

```css
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.topBar {
  height: 48px; background: #073b4c; display: flex; align-items: center;
  padding: 0 20px; gap: 24px; flex-shrink: 0; z-index: 100;
  box-shadow: 0 1px 0 rgba(0,0,0,0.2);
}
.logo { font-size: 13px; font-weight: 800; letter-spacing: 0.12em; color: #fff; }
.tabs { display: flex; gap: 2px; }
.tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 4px 14px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6);
  cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.tab.active  { color: #fff; border-bottom-color: #F4A124; }
.tab.dimmed  { opacity: 0.4; cursor: not-allowed; }
.badge {
  background: #F4A124; color: #073b4c; border-radius: 10px;
  padding: 1px 6px; font-size: 9px; font-weight: 700;
}
.cta {
  margin-left: auto; background: #F4A124; color: #073b4c;
  border: none; border-radius: 8px; padding: 6px 16px;
  font-size: 11px; font-weight: 700; cursor: pointer;
}
.cta:hover { background: #e8940f; }
.viewArea  { flex: 1; overflow: hidden; position: relative; }
.viewTrack {
  display: flex; height: 100%;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.viewPanel { flex: 0 0 100%; width: 100%; height: 100%; overflow: hidden; }
```

- [ ] **Step 2: Replace FilterRail.tsx**

```tsx
import { useState, type ReactNode } from 'react'
import styles from './FilterRail.module.css'

export interface RailSection {
  id: string
  icon?: ReactNode
  label: string
  content: ReactNode
}

export function FilterRail({ sections }: { sections: RailSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id))
  const open = sections.find((s) => s.id === openId)

  return (
    <div className={styles.rail}>
      <div className={styles.strip}>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`${styles.iconBtn} ${openId === s.id ? styles.active : ''}`}
            onClick={() => toggle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {open && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{open.label}</div>
          <div className={styles.panelContent}>{open.content}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Replace FilterRail.module.css**

```css
.rail  { display: flex; height: 100%; flex-shrink: 0; }
.strip {
  width: 120px; background: #073b4c;
  display: flex; flex-direction: column; padding: 8px 0; gap: 1px;
}
.iconBtn {
  width: 120px; height: 40px; background: none; border: none;
  border-left: 3px solid transparent;
  cursor: pointer; display: flex; align-items: center;
  padding: 0 14px;
  color: rgba(255,255,255,0.6);
  font-size: 11px; font-weight: 600;
  text-align: left;
}
.iconBtn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.iconBtn.active { background: #0a4d63; color: #fff; border-left-color: #F4A124; }
.panel {
  width: 160px; background: #fff; border-right: 1px solid rgba(7,59,76,0.08);
  overflow-y: auto; padding: 12px;
}
.panelTitle {
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #073b4c; opacity: 0.55; margin-bottom: 10px;
}
.panelContent { display: flex; flex-direction: column; gap: 12px; }
```

- [ ] **Step 4: Update CorpusView.tsx rail section labels**

In `src/views/CorpusView/CorpusView.tsx`, find the `railSections` array. Remove all `icon:` fields and change label `'Size nodes by'` to `'Size by'`:

```tsx
  const railSections = [
    {
      id: 'selection', label: 'Selection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
            {selectedDocumentIds.length} selected
          </div>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      ),
    },
    {
      id: 'projection', label: 'Projection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['umap', 'pca'] as const).map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" name="proj" checked={projection === p} onChange={() => setProjection(p)} style={{ accentColor: '#073b4c' }} />
              {p.toUpperCase()}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'size', label: 'Size by',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([['argument_count', 'Arg count'], ['uniform', 'Uniform'], ['page_count', 'Page count']] as const).map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" name="size" checked={sizeBy === val} onChange={() => setSizeBy(val)} style={{ accentColor: '#073b4c' }} />
              {lbl}
            </label>
          ))}
        </div>
      ),
    },
  ]
```

- [ ] **Step 5: Update GraphFilterRail.tsx — remove icons, fix label**

Replace the entire file `src/views/GraphView/GraphFilterRail.tsx`:

```tsx
import type React from 'react'
import type { FilterState } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  filters: FilterState
  nodeCount: number
  onFilterChange: (f: Partial<FilterState>) => void
  onReheat: () => void
  onFreeze: () => void
}

export function graphRailSections({ filters, nodeCount: _nodeCount, onFilterChange, onReheat, onFreeze }: Props) {
  return [
    {
      id: 'nodes', label: 'Node Types',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['Argument', 'Entity', 'Concept'] as const).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.nodeTypes[type]}
                onChange={e => onFilterChange({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                style={{ accentColor: '#073b4c' }}
              />
              {type}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'confidence', label: 'Confidence',
      content: (
        <div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={filters.minConfidence}
            onChange={e => onFilterChange({ minConfidence: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#F4A124' }}
          />
          <div style={{ fontSize: 10, color: '#F4A124', fontWeight: 700, textAlign: 'right' }}>
            ≥ {filters.minConfidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', label: 'Relations',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.relationGroups[group]}
                onChange={e => onFilterChange({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                style={{ accentColor: '#073b4c' }}
              />
              <span style={{ width: 14, height: 2, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 1 }} />
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'layout', label: 'Layout',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onReheat} style={btnS}>Reheat simulation</button>
          <button onClick={onFreeze} style={{ ...btnS, background: '#f4f7fa', color: '#073b4c', border: '1px solid rgba(7,59,76,0.15)' }}>Freeze</button>
        </div>
      ),
    },
  ]
}

const btnS: React.CSSProperties = {
  background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
```

- [ ] **Step 6: Update DetailFilterRail.tsx — remove icons, fix label**

Replace `src/views/DetailView/DetailFilterRail.tsx`:

```tsx
import type { ArgumentDetail, RelationGroup } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<RelationGroup, boolean>
  onToggleGroup: (group: RelationGroup) => void
}

export function detailRailSections({ detail, visibleGroups, onToggleGroup }: Props) {
  return [
    {
      id: 'focus', label: 'Focus',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c' }}>{detail.argument.id}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>{detail.argument.source_document_title}</div>
          <div style={{ fontSize: 9, color: '#F4A124', fontWeight: 700 }}>
            conf {detail.argument.confidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', label: 'Filter',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['positive', 'negative', 'causal'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={visibleGroups[group]}
                onChange={() => onToggleGroup(group)}
                style={{ accentColor: '#073b4c' }}
              />
              <span style={{ width: 14, height: 2, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 1 }} />
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </label>
          ))}
        </div>
      ),
    },
  ]
}
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/components/Shell/Shell.module.css src/components/FilterRail/FilterRail.tsx src/components/FilterRail/FilterRail.module.css src/views/CorpusView/CorpusView.tsx src/views/GraphView/GraphFilterRail.tsx src/views/DetailView/DetailFilterRail.tsx && git commit -m "feat: navy chrome, gold accents, labelled FilterRail strip"
```

---

### Task 2: Corpus View — Colors, Rings, Titles, Lasso Chip, Resize

**Files:**
- Modify: `src/views/CorpusView/useCorpusD3.ts`
- Modify: `src/views/CorpusView/CorpusView.tsx`
- Modify: `src/views/CorpusView/CorpusView.module.css`

- [ ] **Step 1: Replace useCorpusD3.ts**

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { DocNode, Projection, SizeBy } from '../../types'
import { isPointInPolygon } from '../../utils/geometry'

interface Options {
  selectedIds: Set<string>
  projection: Projection
  sizeBy: SizeBy
  onLassoSelect: (ids: string[]) => void
  onClickToggle: (id: string, shiftKey: boolean) => void
  setTooltip: (t: { doc: DocNode; x: number; y: number } | null) => void
}

const CANVAS_BG = '#fafbfc'
const DOT_DEFAULT = '#74b9d6'
const DOT_SELECTED = '#ef476f'

export function useCorpusD3(
  svgRef: RefObject<SVGSVGElement | null>,
  docs: DocNode[],
  opts: Options
) {
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>()
  const simPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Refs so ResizeObserver can access current scales
  const xScaleRef = useRef<d3.ScaleLinear<number, number>>()
  const yScaleRef = useRef<d3.ScaleLinear<number, number>>()

  useEffect(() => {
    if (!svgRef.current || docs.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', CANVAS_BG)

    const pad = 60
    const getX = (d: DocNode) => optsRef.current.projection === 'umap' ? d.umap_x : d.pca_x
    const getY = (d: DocNode) => optsRef.current.projection === 'umap' ? d.umap_y : d.pca_y

    const xScale = d3.scaleLinear()
      .domain(d3.extent(docs, getX) as [number, number]).range([pad, width - pad])
    const yScale = d3.scaleLinear()
      .domain(d3.extent(docs, getY) as [number, number]).range([height - pad, pad])
    xScaleRef.current = xScale
    yScaleRef.current = yScale

    const sizeVals = docs.map(dd => optsRef.current.sizeBy === 'argument_count' ? dd.argument_count : dd.page_count)
    const sizeExt = d3.extent(sizeVals) as [number, number]
    const sizeScale = optsRef.current.sizeBy === 'uniform' ? null : d3.scaleLinear().domain(sizeExt).range([4, 9])
    const getRadius = (d: DocNode) => {
      if (!sizeScale) return 6
      const val = optsRef.current.sizeBy === 'argument_count' ? d.argument_count : d.page_count
      return sizeScale(val)
    }

    const simNodes = docs.map(d => ({
      id: d.id, data: d,
      x: xScale(getX(d)), y: yScale(getY(d)),
      r: getRadius(d),
    }))
    const sim = d3.forceSimulation(simNodes)
      .force('collide', d3.forceCollide<typeof simNodes[0]>(n => n.r + 2).strength(0.3))
      .stop()
    for (let i = 0; i < 60; i++) sim.tick()
    simNodes.forEach(n => simPositions.current.set(n.id, { x: n.x, y: n.y }))

    // Zoom
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform)
        // Toggle title visibility based on scale
        const scale = event.transform.k
        zoomG.classed('titles-visible', scale >= 2.0)
      })
    svg.call(zoom)
    zoomRef.current = zoom

    // Concentric rings (inside zoom group)
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 7; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 120)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.05)')
        .attr('stroke-width', 1)
    }

    const dotLayer = zoomG.append('g').attr('class', 'dots')

    // Dots
    dotLayer.selectAll<SVGCircleElement, DocNode>('circle')
      .data(docs, d => d.id)
      .join('circle')
      .attr('class', 'corpus-dot')
      .attr('cx', d => simPositions.current.get(d.id)?.x ?? xScale(getX(d)))
      .attr('cy', d => simPositions.current.get(d.id)?.y ?? yScale(getY(d)))
      .attr('r', d => getRadius(d))
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : DOT_DEFAULT)
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : 'none')
      .attr('stroke-width', 4)
      .attr('stroke-opacity', 0.4)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onClickToggle(d.id, event.shiftKey)
      })
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.setTooltip({ doc: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.setTooltip(null))

    // Title labels (opacity controlled by CSS .titles-visible class)
    zoomG.append('g').attr('class', 'title-layer')
      .selectAll<SVGTextElement, DocNode>('text')
      .data(docs, d => d.id)
      .join('text')
      .attr('class', 'doc-title')
      .attr('x', d => simPositions.current.get(d.id)?.x ?? xScale(getX(d)))
      .attr('y', d => (simPositions.current.get(d.id)?.y ?? yScale(getY(d))) + getRadius(d) + 10)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('fill', '#073b4c')
      .attr('font-size', '9px')
      .text(d => d.title.length > 20 ? d.title.slice(0, 20) + '…' : d.title)

    // Lasso
    let lassoPath: [number, number][] = []
    let lassoEl: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null

    const lassoBehavior = d3.drag<SVGSVGElement, unknown>()
      .filter(event => !event.button && !event.ctrlKey)
      .on('start', (event) => {
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        lassoPath = [[mx, my]]
        lassoEl = zoomG.append('path')
          .attr('class', 'lasso')
          .attr('fill', 'rgba(244,161,36,0.08)')
          .attr('stroke', '#F4A124')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '5 3')
      })
      .on('drag', (event) => {
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        lassoPath.push([mx, my])
        lassoEl?.attr('d', 'M' + lassoPath.map(p => p.join(',')).join('L') + 'Z')
      })
      .on('end', () => {
        if (lassoPath.length > 3) {
          const inside: string[] = []
          dotLayer.selectAll<SVGCircleElement, DocNode>('circle').each(function(d) {
            const cx = +d3.select(this).attr('cx')
            const cy = +d3.select(this).attr('cy')
            if (isPointInPolygon([cx, cy], lassoPath)) inside.push(d.id)
          })
          if (inside.length > 0) optsRef.current.onLassoSelect(inside)
        }
        lassoEl?.remove()
        lassoEl = null
        lassoPath = []
      })

    svg.call(lassoBehavior)

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      if (!xScaleRef.current || !yScaleRef.current) return
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      xScaleRef.current.range([pad, w - pad])
      yScaleRef.current.range([h - pad, pad])
      const xS = xScaleRef.current
      const yS = yScaleRef.current
      const proj = optsRef.current.projection
      d3.select(svgEl).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
        .attr('cx', d => xS(proj === 'umap' ? d.umap_x : d.pca_x))
        .attr('cy', d => yS(proj === 'umap' ? d.umap_y : d.pca_y))
      d3.select(svgEl).selectAll<SVGTextElement, DocNode>('.doc-title')
        .attr('x', d => xS(proj === 'umap' ? d.umap_x : d.pca_x))
        .attr('y', d => yS(proj === 'umap' ? d.umap_y : d.pca_y) + 14)
      d3.select(svgEl).selectAll('.rings circle')
        .attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    return () => { observer.disconnect() }
  }, [docs, opts.projection, opts.sizeBy])

  // Sync dot colors when selection changes
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : DOT_DEFAULT)
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : 'none')
  }, [opts.selectedIds])

  const zoomToFit = () => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    const { width, height } = svgRef.current.getBoundingClientRect()
    svg.transition().duration(500).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9).translate(-width / 2, -height / 2)
    )
  }

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current)
      .transition().duration(400)
      .call(zoomRef.current.transform, d3.zoomIdentity)
  }

  return { zoomToFit, resetZoom }
}
```

- [ ] **Step 2: Add lasso chip and title CSS to CorpusView.tsx**

In `src/views/CorpusView/CorpusView.tsx`, add the lasso chip div inside the canvas div, right after the `<svg>` tag:

```tsx
  return (
    <div className={styles.view}>
      <FilterRail sections={railSections} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        <div className={styles.lassoChip}>LASSO</div>
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={zoomToFit}>Fit</button>
          <button className={styles.toolBtn} onClick={resetZoom}>Reset</button>
        </div>
        {tooltip && (
          <FloatingCard style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
              {tooltip.doc.title}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {tooltip.doc.page_count} pages · {tooltip.doc.argument_count} arguments
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
              {tooltip.doc.top_terms.join(' · ')}
            </div>
          </FloatingCard>
        )}
      </div>
    </div>
  )
```

- [ ] **Step 3: Replace CorpusView.module.css**

```css
.view   { display: flex; height: 100%; overflow: hidden; }
.canvas { flex: 1; position: relative; background: #fafbfc; cursor: crosshair; }
.svg    { width: 100%; height: 100%; display: block; }
.toolbar {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px; background: #fff; border-radius: 8px; padding: 4px;
  box-shadow: 0 0 0 1px rgba(17,138,178,0.22), 0 2px 6px rgba(7,59,76,0.08);
}
.toolBtn {
  background: none; border: none; padding: 4px 10px; font-size: 10px;
  font-weight: 600; color: #073b4c; cursor: pointer; border-radius: 5px;
}
.toolBtn:hover { background: #f4f7fa; }
.lassoChip {
  position: absolute; top: 12px; left: 12px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  color: #073b4c; opacity: 0.4;
  background: rgba(255,255,255,0.8); border-radius: 4px; padding: 3px 7px;
  pointer-events: none;
}
```

- [ ] **Step 4: Add title visibility CSS to global.css**

Append to `src/styles/global.css`:

```css
/* Corpus doc-title labels: hidden until zoom >= 2 */
.zoom-group .doc-title {
  opacity: 0;
  transition: opacity 0.2s;
}
.zoom-group.titles-visible .doc-title {
  opacity: 0.7;
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/CorpusView/ src/styles/global.css && git commit -m "feat: corpus view — cyan/red dots, rings, zoom titles, lasso chip, resize"
```

---

### Task 3: Graph View — Missing Links Fix + Animations + ResizeObserver

**Files:**
- Modify: `src/views/GraphView/useGraphD3.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add edge animation keyframes to global.css**

Append to `src/styles/global.css`:

```css
/* Graph edge animations */
@keyframes dash-flow {
  from { stroke-dashoffset: 12; }
  to   { stroke-dashoffset: 0; }
}
@keyframes dash-flow-reverse {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: 12; }
}
.edge-semantic-forward {
  stroke-dasharray: 8 4;
  animation: dash-flow 1.5s linear infinite;
}
.edge-semantic-reverse {
  stroke-dasharray: 8 4;
  animation: dash-flow-reverse 1.5s linear infinite;
}
.edge-structural {
  stroke-dasharray: 3 3;
}
```

- [ ] **Step 2: Replace useGraphD3.ts**

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState } from '../../types'
import { computeRadialTiers, RELATION_COLORS } from '../../utils/geometry'

const RADIAL_RADII = [0, 120, 240, 360]
const PULSE_DUR = 3000

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  onNodeClick: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null, x: number, y: number) => void
  onCanvasClick?: () => void
}

export function useGraphD3(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: Options
) {
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge>>()
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', '#fafbfc')

    // Canvas background click → deselect
    svg.on('click', () => optsRef.current.onCanvasClick?.())

    // SVG defs: arrowhead markers per relation group
    const defs = svg.append('defs')
    const markerDefs = [
      { id: 'arrow-positive', color: '#06d6a0' },
      { id: 'arrow-negative', color: '#ef476f' },
      { id: 'arrow-causal',   color: '#ffd166' },
    ]
    markerDefs.forEach(({ id, color }) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 Z')
        .attr('fill', color)
    })

    const markerMap: Record<string, string> = {
      positive: 'url(#arrow-positive)',
      negative: 'url(#arrow-negative)',
      causal:   'url(#arrow-causal)',
    }

    // Zoom
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => zoomG.attr('transform', e.transform))
    svg.call(zoom)

    // Concentric rings
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 7; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 120)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.05)')
        .attr('stroke-width', 1)
    }

    const { minConfidence, relationGroups, nodeTypes } = optsRef.current.filters
    const filteredEdges = edges.filter(
      e => e.confidence >= minConfidence && relationGroups[e.group]
    )

    const visibleNodes = nodes.filter(n => nodeTypes[n.type])
    const visibleNodeIdSet = new Set(visibleNodes.map(n => n.id))
    const tiers = computeRadialTiers(visibleNodes, filteredEdges)

    const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))

    // Fix: only include edges where BOTH endpoints are in visibleNodes
    const simEdges: GraphEdge[] = filteredEdges
      .filter(e => {
        const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return visibleNodeIdSet.has(sid) && visibleNodeIdSet.has(tid)
      })
      .map(e => ({ ...e }))

    // Adjacency maps for hover-mute (built before D3 resolves string IDs)
    const adjNodes = new Map<string, Set<string>>()
    const adjEdges = new Map<string, Set<string>>()
    simNodes.forEach(n => { adjNodes.set(n.id, new Set()); adjEdges.set(n.id, new Set()) })
    simEdges.forEach(e => {
      const sn = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tn = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      adjNodes.get(sn)?.add(tn)
      adjNodes.get(tn)?.add(sn)
      adjEdges.get(sn)?.add(e.id)
      adjEdges.get(tn)?.add(e.id)
    })

    const degree = new Map<string, number>()
    simNodes.forEach(n => degree.set(n.id, 0))
    simEdges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      degree.set(sid, (degree.get(sid) ?? 0) + 1)
      degree.set(tid, (degree.get(tid) ?? 0) + 1)
    })

    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const pulseG = zoomG.append('g').attr('class', 'pulses').attr('pointer-events', 'none')

    // Edges (mute handlers added AFTER nodeGroups is defined below)
    const edgeSel = edgeG.selectAll<SVGLineElement, GraphEdge>('line')
      .data(simEdges, d => d.id)
      .join('line')
      .attr('class', d => {
        if (d.group === 'structural') return 'edge-structural'
        if (d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS') return 'edge-semantic-reverse'
        return 'edge-semantic-forward'
      })
      .attr('stroke', d => RELATION_COLORS[d.group])
      .attr('stroke-width', d => d.group === 'structural' ? 1 : Math.max(1, d.confidence * 3))
      .attr('opacity', d => d.group === 'structural' ? 0.25 : 0.8)
      .attr('marker-end', d => markerMap[d.group] ?? null)

    edgeSel.append('title').text(d => `${d.relation_type} · ${d.confidence.toFixed(2)}`)

    // Pulse circles for semantic edges
    const semanticEdges = simEdges.filter(e => e.group !== 'structural')
    const pulseOffsets = new Map(semanticEdges.map((e, i) => [e.id, (i / Math.max(semanticEdges.length, 1)) * PULSE_DUR]))

    const pulses = pulseG.selectAll<SVGCircleElement, GraphEdge>('circle')
      .data(semanticEdges, d => d.id)
      .join('circle')
      .attr('r', 3)
      .attr('fill', d => RELATION_COLORS[d.group])
      .attr('opacity', 0)

    // Node groups
    const nodeGroups = nodeG.selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes, d => d.id)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, _d) => {
            if (!event.active) sim.alphaTarget(0)
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onNodeClick(d)
      })
      .on('mouseenter.tooltip', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onNodeHover?.(d, mx, my)
      })
      .on('mouseleave.tooltip', () => {
        optsRef.current.onNodeHover?.(null, 0, 0)
      })
      .on('mouseenter.mute', (_, d) => {
        const neighbours = adjNodes.get(d.id) ?? new Set()
        const neighbourEdges = adjEdges.get(d.id) ?? new Set()
        nodeGroups.attr('opacity', (nd: GraphNode) => nd.id === d.id || neighbours.has(nd.id) ? 1 : 0.06)
        edgeSel.attr('opacity', (ed: GraphEdge) => neighbourEdges.has(ed.id) ? 0.8 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeSel.attr('opacity', (d: GraphEdge) => d.group === 'structural' ? 0.25 : 0.8)
      })

    // Edge mute handlers — added here so nodeGroups closure is already initialized
    edgeSel
      .on('mouseenter.mute', (_, d) => {
        const sn = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id
        const tn = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id
        const involvedNodes = new Set([sn, tn])
        const involvedEdges = new Set<string>([d.id])
        ;(adjEdges.get(sn) ?? new Set()).forEach(id => involvedEdges.add(id))
        ;(adjEdges.get(tn) ?? new Set()).forEach(id => involvedEdges.add(id))
        nodeGroups.attr('opacity', (nd: GraphNode) => involvedNodes.has(nd.id) ? 1 : 0.06)
        edgeSel.attr('opacity', (ed: GraphEdge) => involvedEdges.has(ed.id) ? 0.8 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeSel.attr('opacity', (d: GraphEdge) => d.group === 'structural' ? 0.25 : 0.8)
      })

    nodeGroups.each(function(d) {
      const g = d3.select(this)
      const deg = degree.get(d.id) ?? 0
      if (d.type === 'Argument') {
        const size = 16 + Math.min(deg, 10) * 1.5
        g.append('rect')
          .attr('x', -size / 2).attr('y', -size / 2)
          .attr('width', size).attr('height', size)
          .attr('rx', 4).attr('fill', '#073b4c')
        g.append('title').text(d.full_text ?? d.label)
      } else if (d.type === 'Entity') {
        g.append('circle').attr('r', 8).attr('fill', '#118ab2')
        g.append('title').text(d.label)
      } else {
        g.append('polygon').attr('points', '0,-10 10,0 0,10 -10,0').attr('fill', '#74b9d6')
        g.append('title').text(d.label)
      }
    })

    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
        .id(d => d.id)
        .strength(d => d.group === 'structural' ? 0.2 : d.confidence * 0.4))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-180).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(d => d.type === 'Argument' ? 22 : 14).strength(0.7))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('radial',
        d3.forceRadial<GraphNode>(
          d => d.type === 'Argument' ? RADIAL_RADII[tiers.get(d.id) ?? 3] : 0,
          width / 2, height / 2
        ).strength(d => d.type === 'Argument' ? 0.4 : 0)
      )

    sim.on('tick', () => {
      edgeSel
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!)
      nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Pulse timer
    const pulseTimer = d3.timer(() => {
      const now = Date.now()
      pulses.each(function(e) {
        const src = e.source as GraphNode
        const tgt = e.target as GraphNode
        if (src.x == null || tgt.x == null) return
        const offset = pulseOffsets.get(e.id) ?? 0
        const t = ((now + offset) % PULSE_DUR) / PULSE_DUR
        const opacity = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 0.9
        d3.select(this)
          .attr('cx', src.x! + (tgt.x! - src.x!) * t)
          .attr('cy', src.y! + (tgt.y! - src.y!) * t)
          .attr('opacity', opacity)
      })
    })

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      ;(sim.force('center') as d3.ForceCenter<GraphNode>).x(w / 2).y(h / 2)
      sim.alpha(0.1).restart()
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    simRef.current = sim
    return () => { sim.stop(); pulseTimer.stop(); observer.disconnect() }
  }, [nodes, edges, opts.filters])

  // Selection halo
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGGElement, GraphNode>('.nodes g')
      .each(function(d) {
        const g = d3.select(this)
        g.select('.selection-halo').remove()
        if (d.id === optsRef.current.selectedNodeId) {
          g.insert('circle', ':first-child')
            .attr('class', 'selection-halo')
            .attr('r', 18).attr('fill', 'none')
            .attr('stroke', '#F4A124').attr('stroke-width', 2.5)
        }
      })
  }, [opts.selectedNodeId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()

  return { reheat, freeze }
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/GraphView/useGraphD3.ts src/styles/global.css && git commit -m "feat: graph view — fix missing links, animated edges with arrows, pulse, hover-mute, resize"
```

---

### Task 4: Graph View — HoverTooltip + NodePanel

**Files:**
- Create: `src/views/GraphView/HoverTooltip.tsx`
- Create: `src/views/GraphView/NodePanel.tsx`
- Create: `src/views/GraphView/NodePanel.module.css`
- Modify: `src/views/GraphView/GraphView.tsx`
- Modify: `src/views/GraphView/GraphView.module.css`
- Delete: `src/views/GraphView/NodeDetailCard.tsx`

- [ ] **Step 1: Create HoverTooltip.tsx**

```tsx
import type { GraphNode } from '../../types'

const TYPE_BG: Record<string, string> = {
  Argument: '#073b4c',
  Entity: '#118ab2',
  Concept: '#74b9d6',
}
const TYPE_FG: Record<string, string> = {
  Argument: '#fff',
  Entity: '#fff',
  Concept: '#073b4c',
}

interface Props {
  node: GraphNode
  x: number
  y: number
}

export function HoverTooltip({ node, x, y }: Props) {
  return (
    <div
      className="card"
      style={{
        position: 'absolute', left: x + 12, top: y + 12,
        padding: '6px 10px', fontSize: 10, pointerEvents: 'none',
        zIndex: 150, display: 'flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        background: TYPE_BG[node.type] ?? '#073b4c',
        color: TYPE_FG[node.type] ?? '#fff',
        borderRadius: 4, padding: '1px 6px', fontSize: 8, fontWeight: 700,
      }}>
        {node.type}
      </span>
      <span style={{ color: '#073b4c', fontWeight: 600 }}>{node.label}</span>
      <span style={{ color: '#F4A124', fontWeight: 700 }}>{node.confidence.toFixed(2)}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create NodePanel.tsx**

```tsx
import styles from './NodePanel.module.css'
import type { GraphNode, GraphEdge } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

const TYPE_BG: Record<string, string> = {
  Argument: '#073b4c',
  Entity: '#118ab2',
  Concept: '#74b9d6',
}

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  onDismiss: () => void
  onOpenDetail: () => void
}

export function NodePanel({ node, edges, onDismiss, onOpenDetail }: Props) {
  const outgoing = edges
    .filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      return sid === node.id && e.group !== 'structural'
    })
    .sort((a, b) => b.confidence - a.confidence)

  return (
    <div className={styles.panel}>
      <button className={styles.close} onClick={onDismiss}>×</button>
      <div className={styles.header}>
        <span
          className={styles.typeChip}
          style={{ background: TYPE_BG[node.type] ?? '#073b4c' }}
        >
          {node.type}
        </span>
        <span className={styles.conf}>{node.confidence.toFixed(2)}</span>
      </div>
      {node.full_text && (
        <div className={styles.fullText}>"{node.full_text}"</div>
      )}
      {node.source_document_title && (
        <div className={styles.source}>
          {node.source_document_title}
          {node.page_reference != null ? ` · p.${node.page_reference}` : ''}
        </div>
      )}
      <div className={styles.relList}>
        {outgoing.map(e => {
          const target = typeof e.target === 'object' ? e.target as GraphNode : null
          return (
            <div key={e.id} className={styles.relRow}>
              <span style={{ color: RELATION_COLORS[e.group], fontWeight: 700, fontSize: 9, flexShrink: 0 }}>
                {e.relation_type}
              </span>
              <span className={styles.relConf}>{e.confidence.toFixed(2)}</span>
              <span className={styles.relTarget}>→ {target?.label ?? ''}</span>
            </div>
          )
        })}
        {outgoing.length === 0 && (
          <div style={{ fontSize: 10, color: '#9ca3af' }}>No outgoing semantic relations.</div>
        )}
      </div>
      <button className={styles.detailBtn} onClick={onOpenDetail}>
        Open in Detail View →
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create NodePanel.module.css**

```css
.panel {
  width: 280px;
  height: 100%;
  background: #fff;
  border-left: 1px solid rgba(7,59,76,0.1);
  box-shadow: -4px 0 16px rgba(7,59,76,0.08);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
  flex-shrink: 0;
  position: relative;
}
.close {
  position: absolute; top: 10px; right: 12px;
  background: none; border: none; font-size: 18px;
  color: #9ca3af; cursor: pointer; line-height: 1; padding: 0;
}
.close:hover { color: #374151; }
.header { display: flex; align-items: center; gap: 8px; }
.typeChip {
  color: #fff; border-radius: 4px;
  padding: 2px 7px; font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
}
.conf { font-size: 10px; font-weight: 700; color: #F4A124; }
.fullText {
  font-size: 10px; color: #374151; line-height: 1.5;
  max-height: 80px; overflow-y: auto;
  border-left: 2px solid #F4A124; padding-left: 8px;
}
.source { font-size: 10px; color: #6b7280; }
.relList { display: flex; flex-direction: column; gap: 4px; flex: 1; min-height: 0; overflow-y: auto; }
.relRow {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 6px; background: #f4f7fa;
  font-size: 9px;
}
.relConf { color: #F4A124; font-weight: 700; flex-shrink: 0; }
.relTarget { color: #6b7280; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detailBtn {
  width: 100%; background: #F4A124; color: #073b4c;
  border: none; border-radius: 7px; padding: 8px 0;
  font-size: 11px; font-weight: 700; cursor: pointer; flex-shrink: 0;
}
.detailBtn:hover { background: #e8940f; }
```

- [ ] **Step 4: Replace GraphView.tsx**

```tsx
import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { useGraphD3 } from './useGraphD3'
import { NodePanel } from './NodePanel'
import { HoverTooltip } from './HoverTooltip'
import { graphRailSections } from './GraphFilterRail'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [hoveredNode, setHoveredNode] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const { selectedDocumentIds, selectedNodeId, setSelectedNode, setActiveView, filters, setFilters } = useStore()

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges }) => {
      setNodes(nodes); setEdges(edges)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    onNodeClick: (node) => setSelectedNode(node.id),
    onNodeHover: (node, x, y) => node ? setHoveredNode({ node, x, y }) : setHoveredNode(null),
    onCanvasClick: () => setSelectedNode(null),
  })

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  return (
    <div className={styles.view}>
      <FilterRail sections={graphRailSections({
        filters, nodeCount: nodes.length,
        onFilterChange: setFilters,
        onReheat: reheat, onFreeze: freeze,
      })} />
      <div className={styles.canvasWrapper}>
        <div className={styles.canvas}>
          <svg ref={svgRef} className={styles.svg} />
          {hoveredNode && (
            <HoverTooltip node={hoveredNode.node} x={hoveredNode.x} y={hoveredNode.y} />
          )}
        </div>
        {selectedNode && (
          <NodePanel
            node={selectedNode}
            edges={edges}
            onDismiss={() => setSelectedNode(null)}
            onOpenDetail={() => setActiveView('detail')}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Replace GraphView.module.css**

```css
.view         { display: flex; height: 100%; overflow: hidden; }
.canvasWrapper { flex: 1; display: flex; flex-direction: row; overflow: hidden; }
.canvas       { flex: 1; position: relative; background: #fafbfc; overflow: hidden; }
.svg          { width: 100%; height: 100%; display: block; }
```

- [ ] **Step 6: Delete NodeDetailCard.tsx**

```bash
rm /Users/alvarodelser/Projects/GraphVisor/src/views/GraphView/NodeDetailCard.tsx
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors. If TypeScript complains about unused imports in App.tsx or other files, remove those imports.

- [ ] **Step 8: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/GraphView/ && git commit -m "feat: graph view — hover tooltip, right-side node panel, remove floating card"
```

---

### Task 5: Detail View — Compact Relation List

**Files:**
- Modify: `src/views/DetailView/RelationList.tsx`
- Modify: `src/views/DetailView/DetailView.module.css`

- [ ] **Step 1: Replace RelationList.tsx**

```tsx
import type { ArgumentDetail } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
}

const GROUP_TEXT_COLOR: Record<string, string> = {
  positive: '#fff',
  negative: '#fff',
  causal: '#073b4c',
  structural: '#073b4c',
}

export function RelationList({ detail, visibleGroups }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Sticky header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '90px 36px 1fr',
        gap: '0 8px',
        padding: '4px 12px',
        background: '#fff',
        borderBottom: '1px solid rgba(7,59,76,0.1)',
        flexShrink: 0,
      }}>
        <span className="sl" style={{ margin: 0 }}>Relation</span>
        <span className="sl" style={{ margin: 0 }}>Conf</span>
        <span className="sl" style={{ margin: 0 }}>Source · Predicate</span>
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.map((rel, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 36px 1fr',
              gap: '0 8px',
              padding: '8px 12px',
              borderBottom: '1px solid rgba(7,59,76,0.06)',
              alignItems: 'start',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f4f7fa')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{
              background: RELATION_COLORS[rel.group],
              color: GROUP_TEXT_COLOR[rel.group] ?? '#fff',
              borderRadius: 20, padding: '2px 7px',
              fontSize: 9, fontWeight: 700,
              display: 'inline-block',
            }}>
              {rel.relation_type}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124', paddingTop: 1 }}>
              {rel.confidence.toFixed(2)}
            </span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#073b4c', marginBottom: 2 }}>
                {rel.source_document_title.split(' — ')[0]} · p.{rel.page_reference}
              </div>
              <div style={{
                fontSize: 10, color: '#374151', lineHeight: 1.4,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                "{rel.full_predicate.length > 80 ? rel.full_predicate.slice(0, 80) + '…' : rel.full_predicate}"
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 24 }}>
            No relations match current filters.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace DetailView.module.css**

```css
.view    { display: flex; height: 100%; overflow: hidden; }
.empty   { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: #9ca3af; }
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 24px 16px 16px; gap: 12px; }
.header  { flex-shrink: 0; border-bottom: 1px solid rgba(7,59,76,0.08); padding-bottom: 12px; }
.mapWrapper { flex-shrink: 0; border-radius: 12px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(17,138,178,0.18), 0 2px 6px rgba(7,59,76,0.06); }
.listWrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/DetailView/RelationList.tsx src/views/DetailView/DetailView.module.css && git commit -m "feat: detail view — compact table relation list with sticky header"
```
