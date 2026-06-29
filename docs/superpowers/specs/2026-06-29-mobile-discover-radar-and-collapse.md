# Mobile: Discover Radar Layout, Always-On Labels, Pinch-to-Collapse

**Date:** 2026-06-29
**Status:** Approved

## Overview

Three mobile UX improvements:

1. Stack the radar chart below the hypothesis text in DiscoverListItem on narrow screens.
2. Show full dimension names and scores on the radar always on mobile (no hover required).
3. Enable the scroll-to-collapse graph feature on mobile via a two-finger pinch gesture.

---

## 1. DiscoverListItem — Mobile Stacked Layout

**File:** `src/views/DiscoverView/DiscoverListItem.module.css`

Add a `@media (max-width: 640px)` block that switches `.item` from its default horizontal flex layout to `flex-direction: column` with `align-items: flex-start`. The `.left` div (hypothesis text, concept badge, research question) appears first; the `HypothesisRadarChart` SVG below it. The SVG already carries `margin: 12px` inline so spacing is handled.

No JS changes. Breakpoint matches the existing `640px` breakpoint used in `DetailView.module.css` and `RelationList.tsx`.

---

## 2. HypothesisRadarChart — Always-On Labels on Mobile

**Files:**
- `src/views/DiscoverView/HypothesisRadarChart.tsx` — new `alwaysExpanded` prop
- `src/views/DiscoverView/DiscoverListItem.tsx` — detect mobile, pass prop

### HypothesisRadarChart prop

Add `alwaysExpanded?: boolean` to the props interface. When `true`:
- All value labels start at `opacity: 1` (not 0)
- Use `LABELS_FULL` (Novelty, Plausibility, Impact, Commercial) as the initial text instead of `LABELS` (Nov, Sci, Imp, Com)
- Skip attaching the `mouseenter`/`mouseleave` handlers entirely

When `false` (default): existing hover behavior unchanged — abbreviated names at rest, full names + scores on hover.

The existing `PAD_R = 58` was already sized for full-length names, so no SVG width change is needed.

### DiscoverListItem mobile detection

Add a `useState<boolean>` + `useEffect` that tracks `window.innerWidth <= 640` and updates on `resize`, matching the pattern in `RelationList.tsx`. Pass `alwaysExpanded={isMobile}` to `HypothesisRadarChart`. Clean up the resize listener on unmount.

---

## 3. GraphView — Pinch-to-Collapse

**File:** `src/views/GraphView/useGraphD3.ts`

### Mechanism

Add `touchstart`, `touchmove`, and `touchend` event listeners to the SVG element, alongside the existing `wheel` listener. Use a `pinchStartDist` ref (or local variable in the effect closure) to track the previous frame's two-finger distance.

**touchstart**: If `e.touches.length === 2`, compute and store initial inter-touch distance. If not 2 touches, clear `pinchStartDist`.

**touchmove**: 
- Guard: only proceed if `showBlobs && e.touches.length === 2 && pinchStartDist != null`.
- Also only proceed when `zoomKRef.current <= LOCK_K + 1e-4 || collapseRef.current > 0` (mirrors the `atLock` check in the wheel handler).
- Compute new distance between the two touch points.
- Compute `delta = (pinchStartDist - newDist) * PINCH_COLLAPSE_SCALE` where `PINCH_COLLAPSE_SCALE` is tuned so a ~100px pinch drives roughly the same collapse progress as a comparable wheel scroll (suggested starting value: `0.003`).
- Clamp `collapseRef.current` to `[0, 1]`.
- Update `pinchStartDist` to `newDist`.
- Kick the sim alpha and run the same hint/collapse update that the wheel handler runs.
- Call `e.preventDefault()` to prevent the browser's native pinch-zoom from interfering.

**touchend**: Clear `pinchStartDist`.

### Cleanup

Add all three listeners to the effect's cleanup return alongside `svgEl.removeEventListener('wheel', onWheel)`.

### Touch event registration

Must use `{ passive: false }` on `touchmove` to allow `preventDefault()` to work.

---

## Breakpoint consistency

All three changes use `640px` as the mobile/narrow threshold, consistent with `DetailView.module.css` and `RelationList.tsx`.

---

## Out of scope

- No changes to the HypothesisCard component (used in a different context).
- No changes to the collapse hint UI — the existing hint bar already tracks progress and will display correctly when driven by pinch.
- No changes to desktop behavior anywhere.
