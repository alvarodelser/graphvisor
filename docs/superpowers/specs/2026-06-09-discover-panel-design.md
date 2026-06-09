# Discover Panel — Design Spec
**Date:** 2026-06-09
**Status:** Approved

## Overview

Add a fourth top-level "Discover" view to GraphVisor that presents corpus-level AI-generated hypotheses to the user. Hypotheses are precomputed for the whole corpus and stored in `src/data/hypothesis_L2.json`. The panel is always accessible from the top navigation bar.

## Data

`src/data/hypothesis_L2.json` contains 8 hypotheses, each with:
- `hypothesis` — full text string
- `decision` — `"ADVANCE"` or `"BORDERLINE"`
- `scores` — object with four 1–10 dimensions: `novelty`, `scientific_plausibility`, `potential_impact`, `commercial_potential`

## Types (`src/types/index.ts`)

Add to `ActiveView`:
```ts
export type ActiveView = 'corpus' | 'graph' | 'detail' | 'discover'
```

Add new interface:
```ts
export interface Hypothesis {
  hypothesis: string
  decision: 'ADVANCE' | 'BORDERLINE'
  scores: {
    novelty: number
    scientific_plausibility: number
    potential_impact: number
    commercial_potential: number
  }
}
```

## Data Layer (`src/data/DataService.ts`)

Add `getHypotheses(): Promise<Hypothesis[]>` — static import of `hypothesis_L2.json`, same pattern as `getDocuments()`. No network call needed.

## Shell (`src/components/Shell/Shell.tsx`)

- `VIEW_ORDER` becomes `['corpus', 'graph', 'detail', 'discover']`
- `children` prop type widens to `[ReactNode, ReactNode, ReactNode, ReactNode]`
- "Discover" tab added to nav — always enabled (no locked/dimmed state)
- No CTA button logic for Discover
- The sliding `viewTrack` now has 4 panels at 100% width each

## Store (`src/store/useStore.ts`)

No changes. Filter and sort state for the Discover view is local to `DiscoverView` — it does not need to survive tab switches.

## New Files

### `src/views/DiscoverView/DiscoverView.tsx`

Top-level view component. Responsibilities:
- Fetches hypotheses via `dataService.getHypotheses()` on mount
- Owns local state: `filterDecision: 'all' | 'ADVANCE' | 'BORDERLINE'` (default `'all'`) and `sortBy: 'avg' | 'novelty' | 'scientific_plausibility' | 'potential_impact' | 'commercial_potential'` (default `'avg'`)
- Derives `avg` score per hypothesis as `(novelty + scientific_plausibility + potential_impact + commercial_potential) / 4`
- Applies filter then sorts descending before rendering
- Renders a filter/sort bar and a 2-column scrollable card grid of `HypothesisCard`

**Filter bar:**
- Three toggle chips: `All N`, `ADVANCE N`, `BORDERLINE N` (N = static total count for each group — always shows the full corpus counts regardless of active filter)
- Active chip: dark background (`#073b4c` + white text); inactive: colored outline variant
- ADVANCE chip: green (`#06d6a0`) color scheme
- BORDERLINE chip: orange (`#F4A124`) color scheme
- Sort `<select>` dropdown: options for Avg score, Novelty, Impact, Commercial potential — sorted descending

### `src/views/DiscoverView/HypothesisCard.tsx`

Single card component. Props: `hypothesis: Hypothesis`.

Layout (top to bottom):
1. **Header row** — decision badge (left) + avg score `X.X/10` (right)
   - ADVANCE badge: green background tint, green text
   - BORDERLINE badge: orange background tint, orange text
2. **Hypothesis text** — truncated to ~3 lines (CSS `-webkit-line-clamp: 3`), full text on title tooltip
3. **Radar chart** — inline SVG, ~80×80px, 4-axis diamond layout (N top, P right, I bottom, C left — axes at 0°/90°/180°/270°). Background grid rings at 25%/50%/75%/100% of max radius. Fill color matches decision: green for ADVANCE, orange for BORDERLINE, opacity 0.15 fill + 1.5px stroke.
4. **Score pills row** — four pills: `N 9`, `P 8`, `I 9`, `C 8`. Subtle dark tint background, dark text.

Radar axis mapping (4-axis diamond, evenly spaced at 90°):
- N (Novelty) → top (270°)
- P (Scientific Plausibility) → right (0°)
- I (Potential Impact) → bottom (90°)
- C (Commercial Potential) → left (180°)

Score to radius: `(score / 10) * MAX_R` where `MAX_R = 32`.

### `src/views/DiscoverView/DiscoverView.module.css`

- `.view` — `display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #fafbfc`
- `.header` — filter bar, `padding: 14px 20px 10px`, flex row, gap 8px, border-bottom
- `.grid` — `flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 16px 20px`
- `.card` — white background, `border-radius: 10px`, subtle border, shadow, padding 14px
- Responsive: at narrow widths (`< 600px`) grid collapses to 1 column

## App (`src/App.tsx`)

```tsx
import { DiscoverView } from './views/DiscoverView/DiscoverView'

export function App() {
  return (
    <Shell>
      <CorpusView />
      <GraphView />
      <DetailView />
      <DiscoverView />
    </Shell>
  )
}
```

## Radar Chart Implementation Notes

Use pure inline SVG — no D3 needed. The chart is static per card (no interaction). Compute each axis point with:
```ts
const angle = (i / 4) * 2 * Math.PI - Math.PI / 2  // start at top
const r = (score / 10) * MAX_R
const x = Math.cos(angle) * r
const y = Math.sin(angle) * r
```
Four axes → square polygon, but rendered as a `<polygon>` with 4 points. Grid rings are `<polygon>` elements at 0.25/0.5/0.75/1.0 of MAX_R.

## Out of Scope

- No click-to-expand or detail drawer for hypotheses
- No persistence of filter/sort state across tab switches
- No editing or annotation of hypotheses
- No connection between hypothesis cards and the Graph or Detail views
