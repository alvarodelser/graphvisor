# GraphVisor v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign GraphVisor navigation to a slim accordion rail, fix the lasso bug, replace graph edges with animated chevron shapes, unify the node/edge hover card, and improve the Detail View with clickable navigation.

**Architecture:** Seven focused tasks. Tasks 1-3 (types, menu, shell) are foundation — each subsequent task depends on these. Tasks 4-7 (corpus, graph edges, graph card, detail) are independent of each other and can be reviewed separately. The chevron edge task replaces `<line>` elements with `<g>` groups updated on every simulation tick.

**Tech Stack:** React 18, TypeScript, D3 v7, Zustand, CSS Modules, global CSS keyframes

---

## File Map

**Modified:**
- `src/types/index.ts` — add `target_argument_id` to `ArgumentRelation`
- `src/data/mock/detail.json` — add `target_argument_id` to each relation
- `src/styles/global.css` — add chevron march keyframes, replace pulse/dash keyframes
- `src/components/FilterRail/FilterRail.tsx` — accordion inline expansion (no side panel)
- `src/components/FilterRail/FilterRail.module.css` — 52px width, inline expand styles
- `src/components/Shell/Shell.tsx` — Detail tab dot indicator
- `src/components/Shell/Shell.module.css` — `.dot` style
- `src/views/CorpusView/useCorpusD3.ts` — lasso fix (bind to bg rect), remove zoom controls
- `src/views/CorpusView/CorpusView.tsx` — remove toolbar, remove Projection section
- `src/views/GraphView/useGraphD3.ts` — chevron edge groups, updated hover callbacks
- `src/views/GraphView/GraphView.tsx` — NodeFloatingCard state, remove HoverTooltip/NodePanel
- `src/views/GraphView/GraphFilterRail.tsx` — unchanged (sections remain)
- `src/views/DetailView/RelationList.tsx` — 4-column grid, clickable rows
- `src/views/DetailView/DetailView.tsx` — breadcrumb nav stack
- `src/views/DetailView/DetailView.module.css` — header gold accent, no bottom border
- `src/views/DetailView/DetailFilterRail.tsx` — remove Focus section
- `src/views/DetailView/DetailMiniMap.tsx` — minimap visual cleanup

**Created:**
- `src/views/GraphView/NodeFloatingCard.tsx`
- `src/views/GraphView/NodeFloatingCard.module.css`

**Deleted:**
- `src/views/GraphView/HoverTooltip.tsx`
- `src/views/GraphView/NodePanel.tsx`
- `src/views/GraphView/NodePanel.module.css`

---

### Task 1: Types + Mock Data

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/data/mock/detail.json`

- [ ] **Step 1: Add `target_argument_id` to `ArgumentRelation` in `src/types/index.ts`**

Replace the `ArgumentRelation` interface:

```typescript
export interface ArgumentRelation {
  relation_type: string
  confidence: number
  group: 'positive' | 'negative' | 'causal'
  source_document_id: string
  source_document_title: string
  page_reference: number
  full_predicate: string
  target_argument_id: string
}
```

- [ ] **Step 2: Update `src/data/mock/detail.json` — add `target_argument_id` to each relation**

Read the current file first, then update each relation entry with the following mappings. The full updated `relations` array:

```json
"relations": [
  {"relation_type":"CORRELATES_WITH","confidence":0.87,"group":"positive","source_document_id":"doc_003","source_document_title":"Chen 2022 — Biomarker analysis","page_reference":8,"full_predicate":"Elevated PM2.5 levels correlate with inflammatory biomarker upregulation.","target_argument_id":"arg_002"},
  {"relation_type":"CAUSES","confidence":0.79,"group":"causal","source_document_id":"doc_015","source_document_title":"Nguyen 2022 — Oxidative stress","page_reference":5,"full_predicate":"Oxidative stress mediates the link between air pollution and endothelial dysfunction.","target_argument_id":"arg_003"},
  {"relation_type":"CONTRADICTS","confidence":0.81,"group":"negative","source_document_id":"doc_004","source_document_title":"Park 2023 — Population cohort study","page_reference":19,"full_predicate":"No significant effect of PM2.5 on cardiac events was found in the adjusted cohort.","target_argument_id":"arg_005"},
  {"relation_type":"SUPPORTS","confidence":0.83,"group":"positive","source_document_id":"doc_013","source_document_title":"Patel 2023 — Inflammatory markers","page_reference":22,"full_predicate":"Systemic inflammation precedes and predicts cardiovascular events in pollutant-exposed populations.","target_argument_id":"arg_002"},
  {"relation_type":"ASSOCIATED_WITH","confidence":0.68,"group":"causal","source_document_id":"doc_014","source_document_title":"Okonkwo 2021 — Socioeconomic correlates","page_reference":11,"full_predicate":"Socioeconomic deprivation amplifies pollution-related cardiovascular risk.","target_argument_id":"arg_004"},
  {"relation_type":"REVEALS","confidence":0.72,"group":"positive","source_document_id":"doc_009","source_document_title":"Garcia 2023 — Confounding factors","page_reference":15,"full_predicate":"Adjustment for confounders reveals a dose-dependent exposure-response relationship.","target_argument_id":"arg_001"},
  {"relation_type":"INHIBITS","confidence":0.64,"group":"negative","source_document_id":"doc_016","source_document_title":"Rossi 2020 — Epigenetic regulation","page_reference":9,"full_predicate":"Epigenetic silencing of antioxidant genes inhibits the cellular response to PM exposure.","target_argument_id":"arg_003"},
  {"relation_type":"INCREASES","confidence":0.76,"group":"positive","source_document_id":"doc_007","source_document_title":"Müller 2022 — Dose-response modelling","page_reference":13,"full_predicate":"Dose-response modelling shows increased cardiovascular risk at all PM2.5 levels above background.","target_argument_id":"arg_001"}
]
```

Note: `target_argument_id: "arg_001"` means self-reference (same argument) — the Detail View will disable click on these rows.

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass. The `DataService.test.ts` test checks `getArgumentDetail` returns `full_predicate` — it will still pass since `target_argument_id` is additive.

- [ ] **Step 5: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/types/index.ts src/data/mock/detail.json && git commit -m "feat: add target_argument_id to ArgumentRelation type and mock data"
```

---

### Task 2: FilterRail — Slim Accordion

**Files:**
- Modify: `src/components/FilterRail/FilterRail.tsx`
- Modify: `src/components/FilterRail/FilterRail.module.css`

The current FilterRail expands a 160px side panel. The new design expands inline below the clicked button, within the same 52px strip. No side panel.

- [ ] **Step 1: Replace `src/components/FilterRail/FilterRail.tsx`**

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

  return (
    <div className={styles.rail}>
      {sections.map((s) => (
        <div key={s.id} className={styles.section}>
          <button
            className={`${styles.btn} ${openId === s.id ? styles.active : ''}`}
            onClick={() => toggle(s.id)}
          >
            {s.label}
          </button>
          {openId === s.id && (
            <div className={styles.content}>
              {s.content}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/components/FilterRail/FilterRail.module.css`**

```css
.rail {
  width: 52px;
  background: #073b4c;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.section { display: flex; flex-direction: column; }
.btn {
  width: 52px;
  min-height: 40px;
  background: none;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  color: rgba(255,255,255,0.6);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
  padding: 8px 4px;
  line-height: 1.2;
  word-break: break-word;
}
.btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.btn.active { background: #0a4d63; color: #fff; border-left-color: #F4A124; }
.content {
  width: 52px;
  background: #0a4d63;
  padding: 8px 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-left: 3px solid #F4A124;
}
```

- [ ] **Step 3: Update `src/views/CorpusView/CorpusView.tsx` — remove Projection section, update content styles**

Read the current file. Replace the `railSections` array with just two sections (remove Projection entirely), and update inline content styles to fit the 52px width:

```tsx
  const railSections = [
    {
      id: 'selection', label: 'Select',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
            {selectedDocumentIds.length}
          </div>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      ),
    },
    {
      id: 'size', label: 'Size',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {([['argument_count', 'Args'], ['uniform', 'Even'], ['page_count', 'Pages']] as const).map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>
              <input type="radio" name="size" checked={sizeBy === val} onChange={() => setSizeBy(val)} style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              {lbl}
            </label>
          ))}
        </div>
      ),
    },
  ]
```

Also update `btnStyle` to fit:
```tsx
const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 4,
  padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', width: '100%',
}
```

- [ ] **Step 4: Update `src/views/GraphView/GraphFilterRail.tsx` — compact content for 52px**

Read the current file. Replace the four sections with 52px-aware content:

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

export function graphRailSections({ filters, onFilterChange, nodeCount: _n, onReheat, onFreeze }: Props) {
  return [
    {
      id: 'nodes', label: 'Types',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['Argument', 'Entity', 'Concept'] as const).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.nodeTypes[type]}
                onChange={e => onFilterChange({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              {type.slice(0,3)}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'confidence', label: 'Conf',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input type="range" min={0} max={1} step={0.05}
            value={filters.minConfidence}
            onChange={e => onFilterChange({ minConfidence: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#F4A124' }} />
          <div style={{ fontSize: 9, color: '#F4A124', fontWeight: 700, textAlign: 'center' }}>
            ≥{filters.minConfidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', label: 'Rels',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.relationGroups[group]}
                onChange={e => onFilterChange({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              <span style={{ width: 8, height: 8, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 2, flexShrink: 0 }} />
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'layout', label: 'Lay',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={onReheat} style={btnS}>Heat</button>
          <button onClick={onFreeze} style={{ ...btnS, background: 'rgba(255,255,255,0.15)' }}>Freeze</button>
        </div>
      ),
    },
  ]
}

const btnS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: 4,
  padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', width: '100%',
}
```

- [ ] **Step 5: Update `src/views/DetailView/DetailFilterRail.tsx` — remove Focus section**

```tsx
import type { ArgumentDetail, RelationGroup } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<RelationGroup, boolean>
  onToggleGroup: (group: RelationGroup) => void
}

export function detailRailSections({ visibleGroups, onToggleGroup }: Props) {
  return [
    {
      id: 'filter', label: 'Filter',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['positive', 'negative', 'causal'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={visibleGroups[group]}
                onChange={() => onToggleGroup(group)}
                style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              <span style={{ width: 8, height: 8, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 2, flexShrink: 0 }} />
            </label>
          ))}
        </div>
      ),
    },
  ]
}
```

Note: `detail` parameter removed from `Props` since the Focus section is gone. Update the call site in `DetailView.tsx` to not pass `detail`:
In `src/views/DetailView/DetailView.tsx`, change:
```tsx
<FilterRail sections={detailRailSections({ detail, visibleGroups, onToggleGroup: toggleGroup })} />
```
to:
```tsx
<FilterRail sections={detailRailSections({ visibleGroups, onToggleGroup: toggleGroup })} />
```
And remove `detail` from the `detailRailSections` call.

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/components/FilterRail/ src/views/CorpusView/CorpusView.tsx src/views/GraphView/GraphFilterRail.tsx src/views/DetailView/DetailFilterRail.tsx src/views/DetailView/DetailView.tsx && git commit -m "feat: slim accordion FilterRail — inline expand, 52px, no side panel"
```

---

### Task 3: Shell — Detail Tab Dot Indicator

**Files:**
- Modify: `src/components/Shell/Shell.tsx`
- Modify: `src/components/Shell/Shell.module.css`

- [ ] **Step 1: Update `src/components/Shell/Shell.tsx` — Detail tab dot + reset logic**

Replace the tab rendering section:

```tsx
{(['corpus', 'graph', 'detail'] as const).map((v) => (
  <button
    key={v}
    className={[
      styles.tab,
      activeView === v ? styles.active : '',
      v === 'detail' && !selectedNodeId ? styles.dimmed : '',
    ].join(' ')}
    onClick={() => (v !== 'detail' || selectedNodeId) && setActiveView(v)}
    disabled={v === 'detail' && !selectedNodeId}
  >
    {v.charAt(0).toUpperCase() + v.slice(1)}
    {v === 'graph' && selectedDocumentIds.length > 0 && (
      <span className={styles.badge}>{selectedDocumentIds.length}</span>
    )}
    {v === 'detail' && selectedNodeId && (
      <span className={styles.dot}>●</span>
    )}
  </button>
))}
```

Also update `clearSelection` CTA logic — when user clicks "Clear" in corpus, `selectedNodeId` should also be cleared. Add this to `handleCTA`:

The CTA button and navigation logic is correct already. The reset of `selectedNodeId` happens naturally when the user deselects all docs and re-enters graph (nodes are no longer loaded). No additional logic needed.

- [ ] **Step 2: Add `.dot` to `src/components/Shell/Shell.module.css`**

Add after `.badge`:
```css
.dot {
  font-size: 8px;
  color: #F4A124;
  line-height: 1;
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/components/Shell/ && git commit -m "feat: Detail tab gold dot indicator when node selected"
```

---

### Task 4: Corpus View — Lasso Fix + Toolbar Removal

**Files:**
- Modify: `src/views/CorpusView/useCorpusD3.ts`
- Modify: `src/views/CorpusView/CorpusView.tsx`
- Modify: `src/views/CorpusView/CorpusView.module.css`

- [ ] **Step 1: Replace `src/views/CorpusView/useCorpusD3.ts`**

Key changes: lasso now bound to a background `<rect>` inside the zoom group, zoom controls removed, UMAP hardcoded (no projection toggle).

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { DocNode, SizeBy } from '../../types'
import { isPointInPolygon } from '../../utils/geometry'

interface Options {
  selectedIds: Set<string>
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
    svg.style('background', CANVAS_BG)

    const pad = 60
    // Always UMAP — projection toggle removed
    const xScale = d3.scaleLinear()
      .domain(d3.extent(docs, d => d.umap_x) as [number, number]).range([pad, width - pad])
    const yScale = d3.scaleLinear()
      .domain(d3.extent(docs, d => d.umap_y) as [number, number]).range([height - pad, pad])
    xScaleRef.current = xScale
    yScaleRef.current = yScale

    const sizeVals = docs.map(dd => opts.sizeBy === 'argument_count' ? dd.argument_count : dd.page_count)
    const sizeExt = d3.extent(sizeVals) as [number, number]
    const sizeScale = opts.sizeBy === 'uniform' ? null : d3.scaleLinear().domain(sizeExt).range([4, 9])
    const getRadius = (d: DocNode) => {
      if (!sizeScale) return 6
      const val = opts.sizeBy === 'argument_count' ? d.argument_count : d.page_count
      return sizeScale(val)
    }

    const simNodes = docs.map(d => ({
      id: d.id, data: d,
      x: xScale(d.umap_x), y: yScale(d.umap_y),
      r: getRadius(d),
    }))
    const sim = d3.forceSimulation(simNodes)
      .force('collide', d3.forceCollide<typeof simNodes[0]>(n => n.r + 2).strength(0.3))
      .stop()
    for (let i = 0; i < 60; i++) sim.tick()
    simNodes.forEach(n => simPositions.current.set(n.id, { x: n.x, y: n.y }))

    // Zoom bound to SVG
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform)
        zoomG.classed('titles-visible', event.transform.k >= 2.0)
      })
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

    // Background rect — lasso target (distinct from SVG zoom target)
    const bgRect = zoomG.append('rect')
      .attr('class', 'lasso-bg')
      .attr('x', -width * 4).attr('y', -height * 4)
      .attr('width', width * 8).attr('height', height * 8)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')

    const dotLayer = zoomG.append('g').attr('class', 'dots')

    // Dots — stopPropagation prevents lasso trigger on dot click
    dotLayer.selectAll<SVGCircleElement, DocNode>('circle')
      .data(docs, d => d.id)
      .join('circle')
      .attr('class', 'corpus-dot')
      .attr('cx', d => simPositions.current.get(d.id)?.x ?? xScale(d.umap_x))
      .attr('cy', d => simPositions.current.get(d.id)?.y ?? yScale(d.umap_y))
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

    // Title labels
    zoomG.append('g').attr('class', 'title-layer')
      .selectAll<SVGTextElement, DocNode>('text')
      .data(docs, d => d.id)
      .join('text')
      .attr('class', 'doc-title')
      .attr('x', d => simPositions.current.get(d.id)?.x ?? xScale(d.umap_x))
      .attr('y', d => (simPositions.current.get(d.id)?.y ?? yScale(d.umap_y)) + getRadius(d) + 10)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('fill', '#073b4c')
      .attr('font-size', '9px')
      .text(d => d.title.length > 20 ? d.title.slice(0, 20) + '…' : d.title)

    // Lasso bound to bgRect (not SVG) — avoids zoom conflict
    let lassoPath: [number, number][] = []
    let lassoEl: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null

    const lassoBehavior = d3.drag<SVGRectElement, unknown>()
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

    bgRect.call(lassoBehavior)

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      if (!xScaleRef.current || !yScaleRef.current) return
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      xScaleRef.current.range([pad, w - pad])
      yScaleRef.current.range([h - pad, pad])
      const xS = xScaleRef.current
      const yS = yScaleRef.current
      d3.select(svgEl).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
        .attr('cx', d => xS(d.umap_x))
        .attr('cy', d => yS(d.umap_y))
      d3.select(svgEl).selectAll<SVGTextElement, DocNode>('.doc-title')
        .attr('x', d => xS(d.umap_x))
        .attr('y', d => yS(d.umap_y) + 14)
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
      bgRect.attr('x', -w * 4).attr('y', -h * 4)
        .attr('width', w * 8).attr('height', h * 8)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    return () => { observer.disconnect() }
  }, [docs, opts.sizeBy])

  // Sync dot colors
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : DOT_DEFAULT)
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : 'none')
  }, [opts.selectedIds])

  return {}
}
```

- [ ] **Step 2: Update `src/views/CorpusView/CorpusView.tsx`**

Read the current file. Make these changes:
1. Remove `projection`, `setProjection` from `useStore` destructure
2. Remove `zoomToFit`, `resetZoom` from `useCorpusD3` return destructure
3. Remove `SizeBy` import if unused (keep `DocNode`)
4. Remove the toolbar div and FloatingCard tooltip (keep tooltip — it's still needed; just remove toolbar)
5. Update `useCorpusD3` call to remove `projection` from opts

The updated `CorpusView.tsx`:

```tsx
import { useRef, useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [docs, setDocs] = useState<DocNode[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection,
    clearSelection, selectAll, setSizeBy, sizeBy,
  } = useStore()

  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  useCorpusD3(svgRef, docs, {
    selectedIds,
    sizeBy,
    onLassoSelect: (ids) =>
      setSelectedDocuments([...new Set([...selectedDocumentIds, ...ids])]),
    onClickToggle: (id, shiftKey) => {
      if (shiftKey) toggleDocumentSelection(id)
      else setSelectedDocuments(selectedDocumentIds.includes(id) ? [] : [id])
    },
    setTooltip,
  })

  const railSections = [
    {
      id: 'selection', label: 'Select',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
            {selectedDocumentIds.length}
          </div>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      ),
    },
    {
      id: 'size', label: 'Size',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {([['argument_count', 'Args'], ['uniform', 'Even'], ['page_count', 'Pages']] as const).map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>
              <input type="radio" name="size" checked={sizeBy === val} onChange={() => setSizeBy(val)} style={{ accentColor: '#F4A124', width: 10, height: 10 }} />
              {lbl}
            </label>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.view}>
      <FilterRail sections={railSections} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        <div className={styles.lassoChip}>LASSO</div>
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
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 4,
  padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', width: '100%',
}
```

- [ ] **Step 3: Update `src/views/CorpusView/CorpusView.module.css` — remove toolbar**

```css
.view   { display: flex; height: 100%; overflow: hidden; }
.canvas { flex: 1; position: relative; background: #fafbfc; cursor: crosshair; }
.svg    { width: 100%; height: 100%; display: block; }
.lassoChip {
  position: absolute; top: 12px; left: 12px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  color: #073b4c; opacity: 0.4;
  background: rgba(255,255,255,0.8); border-radius: 4px; padding: 3px 7px;
  pointer-events: none;
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/CorpusView/ && git commit -m "feat: corpus view — fix lasso, remove toolbar, UMAP only"
```

---

### Task 5: Graph View — Chevron Edges

**Files:**
- Modify: `src/views/GraphView/useGraphD3.ts`
- Modify: `src/styles/global.css`

Replace `<line>` edges with `<g>` groups containing chevron shapes. Each edge group is translated to `(sx, sy)` and rotated by `atan2(ty-sy, tx-sx)`. In local (horizontal) coordinates, the outer chevron spans from `x=0` to `x=length`, and inner marching chevrons are pre-created as fixed polylines inside an animated `<g>`.

- [ ] **Step 1: Add chevron animation CSS to `src/styles/global.css`**

Append to the end of the file:

```css

/* GraphVisor v3: Chevron edge animations (replace v2 dash animations) */
@keyframes march-forward { from { transform: translateX(0); } to { transform: translateX(28px); } }
@keyframes march-reverse { from { transform: translateX(0); } to { transform: translateX(-28px); } }
.chevrons-forward { animation: march-forward 0.8s linear infinite; }
.chevrons-reverse { animation: march-reverse 0.8s linear infinite; }
```

Also remove the old v2 dash animation classes from `global.css` (the `@keyframes dash-flow`, `@keyframes dash-flow-reverse`, `.edge-semantic-forward`, `.edge-semantic-reverse`, `.edge-structural` blocks) — these are no longer used.

- [ ] **Step 2: Replace `src/views/GraphView/useGraphD3.ts`**

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState } from '../../types'
import { computeRadialTiers, RELATION_COLORS } from '../../utils/geometry'

const RADIAL_RADII = [0, 120, 240, 360]

// Chevron geometry constants
const CHEV_HALF_H = 12    // half-height of chevron (total 24px)
const CHEV_TIP_OFFSET = 25  // how far the tip projects from the body end
const CHEV_SPACING = 28   // px between inner chevron backs
const CHEV_TIP_REACH = 14  // how far each inner chevron tip projects
const CHEV_COUNT = 16     // pre-created inner chevrons per edge (covers up to ~448px)
const CHEV_START = -8     // first chevron starts before x=0 for seamless entry

interface HoverPayload {
  type: 'node'
  node: GraphNode
  x: number
  y: number
}

interface EdgeHoverPayload {
  type: 'edge'
  edge: GraphEdge
  sourceNode: GraphNode
  targetNode: GraphNode
  x: number
  y: number
}

export type HoverItem = HoverPayload | EdgeHoverPayload | null

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  onNodeClick: (node: GraphNode) => void
  onHover?: (item: HoverItem) => void
  onCanvasClick?: () => void
}

function chevronOuterPoints(len: number): string {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}

// Structural edges use a darker stroke for readability (spec 3.3). Semantic edges
// use their relation color. Fills are very faint. RELATION_COLORS values for
// semantic groups are 6-digit hex, so `${hex}0f` makes a valid 8-digit hex (~6% alpha);
// structural is an rgba() string, so it gets its own explicit faint fill.
const STRUCTURAL_STROKE = 'rgba(7,59,76,0.45)'
function edgeStroke(group: string): string {
  return group === 'structural' ? STRUCTURAL_STROKE : RELATION_COLORS[group]
}
function edgeFill(group: string): string {
  return group === 'structural' ? 'rgba(7,59,76,0.04)' : `${RELATION_COLORS[group]}0f`
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

    svg.on('click', () => optsRef.current.onCanvasClick?.())

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
    const filteredEdges = edges.filter(e => e.confidence >= minConfidence && relationGroups[e.group])

    const visibleNodes = nodes.filter(n => nodeTypes[n.type])
    const visibleNodeIdSet = new Set(visibleNodes.map(n => n.id))
    const tiers = computeRadialTiers(visibleNodes, filteredEdges)

    const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))
    const simEdges: GraphEdge[] = filteredEdges
      .filter(e => {
        const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return visibleNodeIdSet.has(sid) && visibleNodeIdSet.has(tid)
      })
      .map(e => ({ ...e }))

    // Adjacency maps for hover-mute
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

    const defs = svg.append('defs')
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')

    // ── Edge groups (chevron shapes) ──
    const edgeGroups = edgeG.selectAll<SVGGElement, GraphEdge>('g.edge-group')
      .data(simEdges, d => d.id)
      .join('g')
      .attr('class', 'edge-group')
      .style('cursor', 'pointer')

    edgeGroups.each(function(d) {
      const g = d3.select(this)
      const isStructural = d.group === 'structural'
      const isReverse = d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS'

      // clipPath (semantic edges only) — keeps inner chevrons inside the outer shape.
      // clipPathUnits userSpaceOnUse: clip geometry is in the edge group's local space
      // (the static clip wrapper has no transform of its own, so it stays aligned with
      // the outer polyline even as the parent group is translated/rotated each tick).
      if (!isStructural) {
        defs.append('clipPath')
          .attr('id', `edgeclip-${d.id}`)
          .attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon')
          .attr('points', chevronOuterPoints(0))
      }

      // outer chevron
      g.append('polyline')
        .attr('class', 'chevron-outer')
        .attr('fill', edgeFill(d.group))
        .attr('stroke', edgeStroke(d.group))
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'miter')
        .attr('stroke-linecap', 'butt')
        .attr('opacity', isStructural ? 1 : 0.7)

      // inner marching chevrons (semantic only), clipped to outer shape.
      // clip-path on a STATIC wrapper; the animation lives on the inner <g> so the
      // translateX motion is clipped rather than moving the clip region itself.
      if (!isStructural) {
        const clipWrap = g.append('g').attr('clip-path', `url(#edgeclip-${d.id})`)
        const innerG = clipWrap.append('g')
          .attr('class', isReverse ? 'chevrons-reverse' : 'chevrons-forward')
        for (let i = 0; i < CHEV_COUNT; i++) {
          const bx = CHEV_START + i * CHEV_SPACING
          innerG.append('polyline')
            .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
            .attr('fill', 'none')
            .attr('stroke', RELATION_COLORS[d.group])
            .attr('stroke-width', 6)
            .attr('stroke-linejoin', 'miter')
            .attr('stroke-linecap', 'butt')
            .attr('opacity', 0.55)
        }
      }

      g.append('title').text(`${d.relation_type} · ${d.confidence.toFixed(2)}`)
    })

    // Edge hover → floating card
    edgeGroups
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        const src = d.source as GraphNode
        const tgt = d.target as GraphNode
        optsRef.current.onHover?.({ type: 'edge', edge: d, sourceNode: src, targetNode: tgt, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))
      .on('mouseenter.mute', (_, d) => {
        const sn = (d.source as GraphNode).id
        const tn = (d.target as GraphNode).id
        const involvedNodes = new Set([sn, tn])
        const involvedEdges = new Set<string>([d.id])
        ;(adjEdges.get(sn) ?? new Set()).forEach(id => involvedEdges.add(id))
        ;(adjEdges.get(tn) ?? new Set()).forEach(id => involvedEdges.add(id))
        nodeGroups.attr('opacity', (nd: GraphNode) => involvedNodes.has(nd.id) ? 1 : 0.06)
        edgeGroups.attr('opacity', (ed: GraphEdge) => involvedEdges.has(ed.id) ? 1 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeGroups.attr('opacity', null)
      })

    // ── Node groups ──
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
          .on('end', (event, _d) => { if (!event.active) sim.alphaTarget(0) })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onNodeClick(d)
      })
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'node', node: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))
      .on('mouseenter.mute', (_, d) => {
        const neighbours = adjNodes.get(d.id) ?? new Set()
        const neighbourEdges = adjEdges.get(d.id) ?? new Set()
        nodeGroups.attr('opacity', (nd: GraphNode) => nd.id === d.id || neighbours.has(nd.id) ? 1 : 0.06)
        edgeGroups.attr('opacity', (ed: GraphEdge) => neighbourEdges.has(ed.id) ? 1 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeGroups.attr('opacity', null)
      })

    nodeGroups.each(function(d) {
      const g = d3.select(this)
      const deg = degree.get(d.id) ?? 0
      if (d.type === 'Argument') {
        const size = 16 + Math.min(deg, 10) * 1.5
        g.append('rect').attr('x', -size / 2).attr('y', -size / 2)
          .attr('width', size).attr('height', size).attr('rx', 4).attr('fill', '#073b4c')
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
      // Update edge group transforms + outer chevron + clip shapes
      edgeGroups.each(function(d) {
        const src = d.source as GraphNode
        const tgt = d.target as GraphNode
        if (src.x == null || tgt.x == null) return
        const dx = tgt.x! - src.x!
        const dy = tgt.y! - src.y!
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        const sel = d3.select(this)
        sel.attr('transform', `translate(${src.x},${src.y}) rotate(${angle})`)
        const pts = chevronOuterPoints(len)
        sel.select('.chevron-outer').attr('points', pts)
        if (d.group !== 'structural') {
          d3.select(`#edgeclip-${d.id} polygon`).attr('points', pts)
        }
      })

      nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
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
    return () => { sim.stop(); observer.disconnect() }
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

- [ ] **Step 3: TypeScript check**

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
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/GraphView/useGraphD3.ts src/styles/global.css && git commit -m "feat: graph view — chevron edges with marching animation"
```

---

### Task 6: Graph View — NodeFloatingCard + GraphView wiring

**Files:**
- Create: `src/views/GraphView/NodeFloatingCard.tsx`
- Create: `src/views/GraphView/NodeFloatingCard.module.css`
- Modify: `src/views/GraphView/GraphView.tsx`
- Delete: `src/views/GraphView/HoverTooltip.tsx`
- Delete: `src/views/GraphView/NodePanel.tsx` + `NodePanel.module.css`

- [ ] **Step 1: Create `src/views/GraphView/NodeFloatingCard.tsx`**

```tsx
import styles from './NodeFloatingCard.module.css'
import type { GraphNode, GraphEdge } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'
import type { HoverItem } from './useGraphD3'

const TYPE_BG: Record<string, string> = {
  Argument: '#073b4c', Entity: '#118ab2', Concept: '#74b9d6',
}
const TYPE_FG: Record<string, string> = {
  Argument: '#fff', Entity: '#fff', Concept: '#073b4c',
}

interface Props {
  item: NonNullable<HoverItem>
  sticky: boolean
  onDismiss: () => void
  onOpenDetail: () => void
}

export function NodeFloatingCard({ item, sticky, onDismiss, onOpenDetail }: Props) {
  if (item.type === 'edge') {
    const { edge, sourceNode, targetNode } = item
    return (
      <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
        {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
        <div className={styles.edgeHeader}>
          <span style={{ background: RELATION_COLORS[edge.group], color: edge.group === 'causal' ? '#073b4c' : '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 700 }}>
            {edge.relation_type}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>{edge.confidence.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 10, color: '#073b4c', marginTop: 6 }}>
          <span style={{ fontWeight: 600 }}>{sourceNode?.label ?? '?'}</span>
          <span style={{ color: '#9ca3af', margin: '0 6px' }}>→</span>
          <span style={{ fontWeight: 600 }}>{targetNode?.label ?? '?'}</span>
        </div>
      </div>
    )
  }

  const { node } = item
  return (
    <div className={`card ${styles.card} ${sticky ? styles.sticky : ''}`}>
      {sticky && <button className={styles.close} onClick={onDismiss}>×</button>}
      <div className={styles.header}>
        <span style={{ background: TYPE_BG[node.type] ?? '#073b4c', color: TYPE_FG[node.type] ?? '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 8, fontWeight: 700 }}>
          {node.type}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124' }}>{node.confidence.toFixed(2)}</span>
      </div>
      {node.full_text && (
        <div className={styles.fullText}>"{node.full_text}"</div>
      )}
      {node.source_document_title && (
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
          {node.source_document_title}{node.page_reference != null ? ` · p.${node.page_reference}` : ''}
        </div>
      )}
      {sticky && node.type === 'Argument' && (
        <button className={styles.detailBtn} onClick={onOpenDetail}>Open in Detail View →</button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/views/GraphView/NodeFloatingCard.module.css`**

```css
.card {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 260px;
  padding: 12px 14px;
  z-index: 200;
  opacity: 1;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.sticky {
  pointer-events: all;
  border-left: 3px solid #F4A124;
}
.close {
  position: absolute; top: 8px; right: 10px;
  background: none; border: none; font-size: 18px;
  color: #9ca3af; cursor: pointer; line-height: 1; padding: 0;
}
.close:hover { color: #374151; }
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.edgeHeader { display: flex; align-items: center; gap: 8px; }
.fullText {
  font-size: 10px; color: #374151; line-height: 1.5;
  max-height: 120px; overflow-y: auto;
  margin-top: 6px;
}
.detailBtn {
  width: 100%; background: #F4A124; color: #073b4c;
  border: none; border-radius: 6px; padding: 6px 0;
  font-size: 10px; font-weight: 700; cursor: pointer;
  margin-top: 10px;
}
.detailBtn:hover { background: #e8940f; }
```

- [ ] **Step 3: Replace `src/views/GraphView/GraphView.tsx`**

```tsx
import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { useGraphD3 } from './useGraphD3'
import type { HoverItem } from './useGraphD3'
import { NodeFloatingCard } from './NodeFloatingCard'
import { graphRailSections } from './GraphFilterRail'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [hoverItem, setHoverItem] = useState<HoverItem>(null)
  const [stickyItem, setStickyItem] = useState<HoverItem>(null)
  const { selectedDocumentIds, selectedNodeId, setSelectedNode, setActiveView, filters, setFilters } = useStore()

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges }) => {
      setNodes(nodes); setEdges(edges)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    onNodeClick: (node) => {
      setSelectedNode(node.id)
      setStickyItem({ type: 'node', node, x: 0, y: 0 })
    },
    onHover: (item) => setHoverItem(item),
    onCanvasClick: () => {
      setSelectedNode(null)
      setStickyItem(null)
    },
  })

  // Displayed item: sticky takes priority, then hover
  const displayItem = stickyItem ?? hoverItem

  return (
    <div className={styles.view}>
      <FilterRail sections={graphRailSections({
        filters, nodeCount: nodes.length,
        onFilterChange: setFilters,
        onReheat: reheat, onFreeze: freeze,
      })} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        {displayItem && (
          <NodeFloatingCard
            item={displayItem}
            sticky={!!stickyItem}
            onDismiss={() => { setStickyItem(null); setSelectedNode(null) }}
            onOpenDetail={() => setActiveView('detail')}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Delete old components**

```bash
rm /Users/alvarodelser/Projects/GraphVisor/src/views/GraphView/HoverTooltip.tsx
rm /Users/alvarodelser/Projects/GraphVisor/src/views/GraphView/NodePanel.tsx
rm /Users/alvarodelser/Projects/GraphVisor/src/views/GraphView/NodePanel.module.css
```

- [ ] **Step 5: TypeScript check**

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
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/GraphView/ && git commit -m "feat: graph view — unified floating card, edge hover, remove NodePanel/HoverTooltip"
```

---

### Task 7: Detail View — Navigation + Minimap + Layout

**Files:**
- Modify: `src/views/DetailView/RelationList.tsx`
- Modify: `src/views/DetailView/DetailView.tsx`
- Modify: `src/views/DetailView/DetailView.module.css`
- Modify: `src/views/DetailView/DetailMiniMap.tsx`

- [ ] **Step 1: Replace `src/views/DetailView/RelationList.tsx`**

4-column grid, clickable rows, self-reference rows disabled:

```tsx
import type { ArgumentDetail, ArgumentRelation } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
  onRowClick: (rel: ArgumentRelation) => void
  focalId: string
}

const GROUP_TEXT_COLOR: Record<string, string> = {
  positive: '#fff', negative: '#fff', causal: '#073b4c', structural: '#073b4c',
}

export function RelationList({ detail, visibleGroups, onRowClick, focalId }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Sticky header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 36px 1fr 1fr',
        gap: '0 8px', padding: '4px 12px',
        background: '#fff', borderBottom: '1px solid rgba(7,59,76,0.1)', flexShrink: 0,
      }}>
        <span className="sl" style={{ margin: 0 }}>Relation</span>
        <span className="sl" style={{ margin: 0 }}>Conf</span>
        <span className="sl" style={{ margin: 0 }}>Source</span>
        <span className="sl" style={{ margin: 0 }}>Argument Text</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.map((rel, i) => {
          const isSelf = rel.target_argument_id === focalId
          return (
            <div
              key={i}
              onClick={() => !isSelf && onRowClick(rel)}
              style={{
                display: 'grid', gridTemplateColumns: '90px 36px 1fr 1fr',
                gap: '0 8px', padding: '8px 12px',
                borderBottom: '1px solid rgba(7,59,76,0.06)',
                alignItems: 'start',
                cursor: isSelf ? 'default' : 'pointer',
                opacity: isSelf ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = '#f4f7fa' }}
              onMouseLeave={e => { e.currentTarget.style.background = '' }}
            >
              <span style={{
                background: RELATION_COLORS[rel.group],
                color: GROUP_TEXT_COLOR[rel.group] ?? '#fff',
                borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700,
                display: 'inline-block',
              }}>
                {rel.relation_type}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#F4A124', paddingTop: 1 }}>
                {rel.confidence.toFixed(2)}
              </span>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#073b4c' }}>
                {rel.source_document_title.split(' — ')[0]} · p.{rel.page_reference}
              </div>
              <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.4 }}>
                "{rel.full_predicate.length > 60 ? rel.full_predicate.slice(0, 60) + '…' : rel.full_predicate}"
              </div>
            </div>
          )
        })}
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

- [ ] **Step 2: Replace `src/views/DetailView/DetailView.tsx`**

Adds breadcrumb navigation stack and passes `onRowClick` to `RelationList`:

```tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { detailRailSections } from './DetailFilterRail'
import type { ArgumentDetail, DocNode, RelationGroup, ArgumentRelation } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false,
}

export function DetailView() {
  const { selectedNodeId, setSelectedNode } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [navStack, setNavStack] = useState<string[]>([])

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (!selectedNodeId) return
    dataService.getArgumentDetail(selectedNodeId).then(d => {
      setDetail(d)
    })
  }, [selectedNodeId])

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  const navigateToArgument = (rel: ArgumentRelation) => {
    if (!detail || !rel.target_argument_id || rel.target_argument_id === detail.argument.id) return
    setNavStack(prev => [...prev, detail.argument.id])
    setSelectedNode(rel.target_argument_id)
    dataService.getArgumentDetail(rel.target_argument_id).then(setDetail)
  }

  const navigateBack = () => {
    if (navStack.length === 0) return
    const prevId = navStack[navStack.length - 1]
    setNavStack(s => s.slice(0, -1))
    setSelectedNode(prevId)
    dataService.getArgumentDetail(prevId).then(setDetail)
  }

  if (!detail) {
    return (
      <div className={styles.empty}>
        Select a node in the Graph view to open its detail.
      </div>
    )
  }

  return (
    <div className={styles.view}>
      <FilterRail sections={detailRailSections({ visibleGroups, onToggleGroup: toggleGroup })} />
      <div className={styles.content}>
        {navStack.length > 0 && (
          <button onClick={navigateBack} className={styles.breadcrumb}>
            ← {navStack.length > 1 ? `${navStack.length} levels back` : 'Back'}
          </button>
        )}
        <div className={styles.header}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#073b4c', marginBottom: 6 }}>
            {detail.argument.source_document_title}
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            "{detail.argument.full_text}"
          </div>
        </div>
        <div className={styles.mapWrapper}>
          <DetailMiniMap detail={detail} allDocs={allDocs} />
        </div>
        <div className={styles.listWrapper}>
          <div className="sl" style={{ padding: '0 0 6px' }}>
            {detail.relations.length} relations across corpus
          </div>
          <RelationList
            detail={detail}
            visibleGroups={visibleGroups}
            onRowClick={navigateToArgument}
            focalId={detail.argument.id}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/views/DetailView/DetailView.module.css`**

```css
.view    { display: flex; height: 100%; overflow: hidden; }
.empty   { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: #9ca3af; }
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px; gap: 12px; }
.header  {
  flex-shrink: 0;
  border-left: 3px solid #F4A124;
  padding-left: 12px;
}
.breadcrumb {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 11px; font-weight: 600; color: #118ab2;
  text-align: left; flex-shrink: 0;
}
.breadcrumb:hover { text-decoration: underline; }
.mapWrapper { flex-shrink: 0; border-radius: 12px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(17,138,178,0.18), 0 2px 6px rgba(7,59,76,0.06); }
.listWrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
```

- [ ] **Step 4: Update `src/views/DetailView/DetailMiniMap.tsx` — visual refinements**

Read the current file. Replace the three `.attr('r', ...)` and `.attr('fill', ...)` lines in the dotG section with updated values:

```typescript
// Replace the dotG circle attrs:
dotG.selectAll('circle')
  .data(allDocs)
  .join('circle')
  .attr('cx', d => xScale(d.umap_x))
  .attr('cy', d => yScale(d.umap_y))
  .attr('r', d => d.id === focalId ? 7 : relatedMap.has(d.id) ? 4 : 2)
  .attr('fill', d =>
    d.id === focalId ? '#F4A124'
    : relatedMap.has(d.id) ? '#118ab2'
    : '#d1d5db')
  .append('title').text(d => d.title)

// Replace the amber ring:
if (focalDoc) {
  dotG.append('circle')
    .attr('cx', xScale(focalDoc.umap_x)).attr('cy', yScale(focalDoc.umap_y))
    .attr('r', 11).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2)
}
```

Also update the line stroke-width in the lineG section:
```typescript
.attr('stroke-width', (_, rel) => Math.max(0.5, rel.confidence * 1.5))
```

Wait — the `detail.relations.forEach(rel => ...)` loop appends `<line>` elements. The current code uses `rel.confidence * 2`. Update to `rel.confidence * 1.5`:

Find this line in `DetailMiniMap.tsx`:
```typescript
.attr('stroke-width', Math.max(0.5, rel.confidence * 2))
```
Replace with:
```typescript
.attr('stroke-width', Math.max(0.5, rel.confidence * 1.5))
```

- [ ] **Step 5: TypeScript check**

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
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/DetailView/ && git commit -m "feat: detail view — clickable navigation, breadcrumb, minimap cleanup, gold header accent"
```
