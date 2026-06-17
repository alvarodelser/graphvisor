# Discover View List Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Discover View from a 2-column grid layout to a single-column scrollable list with inline radar charts, removing all filtering and sorting controls.

**Architecture:** The list displays all hypotheses in a single column. Each list item is a horizontal layout with the hypothesis title on the left and a mini radar chart + score on the right. The radar chart visualizes the 4 score dimensions (novelty, scientific_plausibility, potential_impact, commercial_potential) using SVG/D3.

**Tech Stack:** React, D3 (for radar chart), CSS Modules

## Global Constraints

- Maintain existing hypothesis data structure from DataService
- Keep the 4-dimensional scoring system (novelty, scientific_plausibility, potential_impact, commercial_potential)
- No filtering or sorting functionality (all hypotheses always displayed)
- Radar chart should be consistent across all items for visual comparison

---

### Task 1: Create HypothesisRadarChart component

**Files:**
- Create: `src/views/DiscoverView/HypothesisRadarChart.tsx`

**Interfaces:**
- Consumes: `scores: { novelty: number; scientific_plausibility: number; potential_impact: number; commercial_potential: number; }`
- Produces: `HypothesisRadarChart` React component that accepts `scores` prop and optional `size` prop (default: 60px)

**Description:** This component renders a mini radar/spider chart showing the 4 score dimensions. The chart uses D3's radial SVG approach with 4 axes representing each dimension. All charts should be the same size and styling for visual consistency.

- [ ] **Step 1: Create the component file with test imports**

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Hypothesis } from '../../types'

interface HypothesisRadarChartProps {
  scores: Hypothesis['scores']
  size?: number
}

export function HypothesisRadarChart({ scores, size = 60 }: HypothesisRadarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  return (
    <svg ref={svgRef} width={size} height={size} />
  )
}
```

- [ ] **Step 2: Implement D3 radar chart drawing logic**

```typescript
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

    // Draw axes
    dimensions.forEach((d, i) => {
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
```

- [ ] **Step 3: Run the dev server and verify the component renders without errors**

```bash
npm run dev
```

Expected: No console errors, the app starts successfully.

---

### Task 2: Create DiscoverListItem component

**Files:**
- Create: `src/views/DiscoverView/DiscoverListItem.tsx`

**Interfaces:**
- Consumes: `hypothesis: Hypothesis` (full hypothesis object)
- Produces: `DiscoverListItem` React component that renders a single list item

**Description:** This component renders a single row in the discover list. The left side displays the hypothesis title (larger, bold text). The right side displays the numeric score and the mini radar chart.

- [ ] **Step 1: Create the component structure**

```typescript
import type { Hypothesis } from '../../types'
import { HypothesisRadarChart } from './HypothesisRadarChart'
import styles from './DiscoverListItem.module.css'

interface DiscoverListItemProps {
  hypothesis: Hypothesis
}

export function DiscoverListItem({ hypothesis }: DiscoverListItemProps) {
  const avgScore = (
    (hypothesis.scores.novelty +
      hypothesis.scores.scientific_plausibility +
      hypothesis.scores.potential_impact +
      hypothesis.scores.commercial_potential) /
    4
  ).toFixed(1)

  return (
    <div className={styles.item}>
      <div className={styles.title}>{hypothesis.hypothesis}</div>
      <div className={styles.chart}>
        <span className={styles.score}>{avgScore}</span>
        <HypothesisRadarChart scores={hypothesis.scores} size={60} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create DiscoverListItem.module.css**

```css
.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(7, 59, 76, 0.08);
  background: #fafbfc;
}

.item:hover {
  background: #f3f4f6;
}

.title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.5;
  word-break: break-word;
}

.chart {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.score {
  font-size: 14px;
  font-weight: 600;
  color: #373b4f;
  min-width: 30px;
  text-align: right;
}
```

- [ ] **Step 3: Verify component renders in isolation**

Import and test in the dev app (can be temporary in DiscoverView for testing):

```bash
npm run dev
```

Expected: List item displays with title on left, score and radar chart on right, proper spacing.

---

### Task 3: Update DiscoverView component to use list layout

**Files:**
- Modify: `src/views/DiscoverView/DiscoverView.tsx`

**Interfaces:**
- Consumes: `hypotheses` from DataService (unchanged)
- Produces: List layout rendering all hypotheses in order

**Description:** Remove all filter and sorting logic. Replace the grid rendering with a simple list that displays all hypotheses using the new DiscoverListItem component.

- [ ] **Step 1: Remove filter and sort state**

Replace the existing DiscoverView.tsx with:

```typescript
import { useEffect, useState } from 'react'
import { dataService } from '../../data/DataService'
import { DiscoverListItem } from './DiscoverListItem'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

export function DiscoverView() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])

  useEffect(() => {
    dataService.getHypotheses().then(setHypotheses)
  }, [])

  return (
    <div className={styles.view}>
      <div className={styles.list}>
        {hypotheses.map((h) => (
          <DiscoverListItem key={h.hypothesis} hypothesis={h} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run dev server and verify component loads**

```bash
npm run dev
```

Expected: No errors, DiscoverView loads without crashing.

---

### Task 4: Update DiscoverView.module.css for list layout

**Files:**
- Modify: `src/views/DiscoverView/DiscoverView.module.css`

**Description:** Replace grid styles with list container styles. Remove all header, filter, and sort styles.

- [ ] **Step 1: Replace entire DiscoverView.module.css**

```css
.view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #fafbfc;
}

.list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

@media (max-width: 600px) {
  .list {
    /* List layout is already responsive */
  }
}
```

- [ ] **Step 2: Verify styles in browser**

```bash
npm run dev
```

Expected: List displays full height, scrolls vertically, proper spacing and background color.

---

### Task 5: Clean up unused imports and test the full view

**Files:**
- Modify: `src/views/DiscoverView/DiscoverView.tsx` (verify clean state)

**Description:** Ensure the component is clean with no unused imports, and test the complete discover view with real data.

- [ ] **Step 1: Verify component imports are clean**

Check that `DiscoverView.tsx` only imports:
- `useEffect`, `useState` from React
- `dataService` from data module
- `DiscoverListItem` from the new component
- `Hypothesis` type from types
- `styles` from CSS module

Expected imports in file:
```typescript
import { useEffect, useState } from 'react'
import { dataService } from '../../data/DataService'
import { DiscoverListItem } from './DiscoverListItem'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'
```

- [ ] **Step 2: Run dev server and navigate to Discover view**

```bash
npm run dev
```

Navigate to the Discover view in the app.

Expected: 
- List displays all hypotheses
- Each item shows title on left, score + radar chart on right
- List scrolls vertically
- No filter buttons or sort selector visible
- Radar charts render without errors

- [ ] **Step 3: Verify responsive behavior on small screen**

Resize browser to < 600px width or use dev tools mobile view.

Expected: List items remain readable, radar chart is still visible and properly sized.

- [ ] **Step 4: Commit all changes**

```bash
git add src/views/DiscoverView/
git commit -m "feat(discover): redesign to single-column list with radar charts

- Remove filter chips (All/ADVANCE/BORDERLINE) and sort selector
- Replace 2-column grid layout with single-column scrollable list
- Add DiscoverListItem component showing title + score + radar chart
- Add HypothesisRadarChart component for 4-dimension visualization
- Update styles for list layout with proper spacing and hover states"
```

---

## Implementation Notes

- The radar chart uses D3 for rendering. Ensure `d3` is already installed as a dependency.
- The component assumes the `Hypothesis` type has a `scores` property with all 4 dimensions and a `hypothesis` property for the title.
- The layout is responsive and works on mobile screens — the list items remain in horizontal layout with responsive text sizing.
- No error handling is needed beyond what DataService provides.
