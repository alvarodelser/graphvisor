# Relation Types Redesign — Design Spec

**Date:** 2026-06-16
**Status:** Approved, ready for implementation plan

## Problem

The current relation taxonomy groups edges by **polarity** (positive / negative / causal / structural / concept). User feedback: the positive/negative distinction is irrelevant, and the grouping should instead reflect the *epistemic role* a relation plays — what kind of claim it makes about A and B. The visual encoding (color, arrow shape, length) should follow the new semantic grouping.

## New Taxonomy

Four semantic groups, **polarity dropped**. Each group is one color. The `structural` group is removed entirely. Concept-membership rendering is unaffected.

| # | Group (name) | Meaning | Relation types | Color |
|---|--------------|---------|----------------|-------|
| ① | **Evidence** | "A is a tool for discovering B" | `supports`, `reveals`, `suggests`, `contradicts` | blue `#3b82f6` |
| ② | **Correlation** | "A and B behave similarly" | `correlates_with`, `associated_with`, `analogous_to` | violet `#8b5cf6` |
| ③ | **Causation** | "A influences B · B depends on A" | `causes`, `increases`, `decreases`, `inhibits`, `induces`, `may_cause` | amber `#f59e0b` |
| ④ | **Definition** | "A explains B" | `describes`, `is_defined_as` | gray `#6b7280` |

Notes:
- `contradicts` folds into **Evidence** (refutation is discovery; polarity no longer encoded).
- `describes` / `is_defined_as` move out of the old `structural` group into **Definition**.
- The old `structural` group (`HAS_SUBJECT`, `HAS_OBJECT`) is **removed** from the relation taxonomy and legend. This is safe: `buildGraphModel` already keeps only entity↔entity edges in the force layout, so these plumbing edges were never drawn as semantic chevrons in the main graph.
- `HAS_CONCEPT` / concept membership is a separate render path (dashed orbit lines) and is **not** part of this change.

## Visual Encoding

### Color
Color is driven solely by group (the four colors above). No red/green polarity coding.

### Edge shape & animation — two variants
- **Directional** (Evidence, Causation, Definition): the current edge style, unchanged — pentagon outer chevron, inner open chevrons marching from A toward B (target).
- **Association / symmetric** (Correlation only): a **bidirectional** edge.
  - Outer shape: arrowhead at **both** ends (a hexagon pointed left and right) rather than the one-ended pentagon.
  - Inner chevrons: originate at the **midpoint** and march **outward** toward both ends simultaneously (left half marches left, right half marches right).
  - This encodes the symmetry of "behaves similarly" — no source/target direction.

The existing `march-reverse` keyframe (already in `global.css`) supports the outward-from-center animation; the association variant pairs a forward half and a reverse half.

### Edge length
**Uniform** — unchanged. All groups share the same link distance (scaled by confidence as today). Color + shape carry the grouping; varying length per group was considered and rejected for layout stability.

## Preserving the Old Options

Per user request, the **current rendering options must be preserved as reusable components, not deleted** — they may be reused later (e.g. the opposing/reverse-direction arrow treatment).

Requirement: factor the edge rendering into a small, named set of reusable edge-style builders rather than inlining a single hard-coded chevron in `useGraphD3.ts`. At minimum:
- `directionalChevron` — the existing one-ended marching chevron (current behavior).
- `associationChevron` — the new bidirectional, center-out variant.
- Keep the prior polarity-based coloring and any opposing-direction-arrow variant available as a named option (kept in the codebase, not wired into the default render), so it can be re-enabled without reconstruction.

The selection of which builder to use is a pure function of the edge's group: Correlation → `associationChevron`, all others → `directionalChevron`.

## Affected Code (for the implementation plan to detail)

- `src/types/index.ts` — replace `RelationGroup` union with `'evidence' | 'correlation' | 'causation' | 'definition'` (plus `'concept'` retained for membership). Update `RELATION_TYPE_GROUPS`.
- `src/data/DataService.ts` — rewrite `RELATION_GROUP_MAP` to the new four buckets. Fallback for any unmapped relation type changes from `'causal'` to **`'evidence'`** (the most neutral "makes some claim about B" default).
- `src/utils/geometry.ts` — replace `RELATION_COLORS` with the four new colors (+ concept).
- `src/views/GraphView/GraphView.tsx` — `REL_GROUP_COLORS`, `GROUPED_RELATION_TYPES`, legend entries; drop the structural group.
- `src/views/GraphView/useGraphD3.ts` — `edgeStroke` / `edgeFill` (no more special-cased `structural`); introduce the edge-style builders and the directional-vs-association branch.
- `src/styles/global.css` — confirm/extend marching keyframes for the center-out association animation.
- Downstream consumers of `RELATION_COLORS` / group: `NodeFloatingCard.tsx`, `RelationList.tsx`, `DetailView/*` (mini-graphs) — update to the new groups/colors.
- Tests touching groups/edges in `src/graph/*.test.ts` — update fixtures/expectations.

## Out of Scope
- Concept orbit / membership rendering.
- Edge length / force-layout tuning.
- Any change to the underlying data or relation vocabulary (only the grouping/encoding changes).

## Success Criteria
- Main graph colors edges by the four new groups; no positive/negative coding remains.
- Correlation edges render with the bidirectional center-out chevron; all other groups keep the directional chevron.
- Structural group is gone from the legend and taxonomy; `describes`/`is_defined_as` show as Definition (gray).
- Old edge-style options remain in the codebase as reusable, named components.
- Tests pass.
