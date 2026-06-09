# Entity Detail View — Arguments Section Design

**Date:** 2026-06-09  
**Status:** Approved

## Overview

When an Entity node is selected in the Graph view, the Detail view currently shows only a flat list of entity-to-entity relations. This design adds two new surfaces:

1. **Argument cards** — a scrollable section at the top showing every argument (paper excerpt) that mentions the entity, with the entity label highlighted in the text.
2. **Grouped relation table** — the existing relation table gains a merged "Argument" column on the left, grouping relations by the argument they came from.

---

## Data Layer Changes

### 1. `RawEdgeRecord` — add `argIdx`

`buildGraphData` already iterates `doc.data.forEach((arg, argIdx) => ...)`. Add `argIdx: number` to `RawEdgeRecord` and populate it in the push. No schema change elsewhere.

### 2. `ArgumentRelation` — add `source_argument_id`

Add `source_argument_id?: string` to the `ArgumentRelation` interface in `types/index.ts`. Format: `doc_${docIdx}_arg_${argIdx}` (matches `ArgumentBlob.id`). Populated by the entity-path branch of `getArgumentDetail` using the extended `rawEdges`.

### 3. Entity→blobs index

In `buildGraphData`, build:

```ts
entityBlobs: Map<string, ArgumentBlob[]>
```

Derived by iterating `blobs` and indexing each blob under every `entityId` in `blob.entityIds`. O(n) at startup, O(1) at query time.

### 4. `ArgumentDetail` — add `argumentBlobs`

Add `argumentBlobs?: ArgumentBlob[]` to the `ArgumentDetail` interface. The entity-path branch of `getArgumentDetail` populates it from the entity→blobs index. The argument-blob path leaves it undefined (no regression).

---

## UI: Argument Cards (new top section)

**Component:** `ArgumentCards.tsx` in `src/views/DetailView/`

Rendered in `DetailView` between the header and the minimap, only when `detail.argumentBlobs` is non-empty.

Layout: vertical stack, max-height ~180px, overflow-y scroll.

Each card:
- **Argument type badge** — small pill using existing color scheme (mapped from `argument_type` string)
- **Source document title** — truncated, `font-size: 10px`
- **Highlighted full text** — split `full_argument` on the entity `label` (case-insensitive regex), render plain text interleaved with `<mark>` spans (amber/yellow background, same amber `#F4A124` used elsewhere in the UI)

No fuzzy matching — exact label match is sufficient given the structured data.

---

## UI: Grouped Relation Table

**Changes to:** `RelationList.tsx`

### New column layout

Grid template: `140px 90px 36px 1fr 1fr` (was `90px 36px 1fr 1fr`).  
New leftmost column header: **"Argument"**.

When `source_argument_id` is absent on all relations (Argument blob selected), the argument column is hidden and the layout reverts to the 4-column grid. No regression for the argument-blob detail path.

### Grouping logic

Before rendering, group `detail.relations` by `source_argument_id`. Each group renders as a block:

- **First row**: renders the argument cell + the first relation's cells.
- **Subsequent rows**: argument cell is empty (visually merged via `grid-row: span` or a shared wrapper element).

The argument cell shows:
- Argument type badge
- Text preview: first ~80 chars of `full_argument`, truncated with ellipsis
- Clicking the cell calls `setSelectedNode(source_argument_id)` — navigating into the argument blob detail (same mechanic as existing row navigation)

Relations within a group remain independently clickable for entity-to-entity navigation.

---

## Scope & Non-Goals

- No changes to the Corpus view or Graph view.
- No fuzzy/semantic entity matching in the highlight — exact string match only.
- No pagination of argument cards — scroll is sufficient given typical entity mention counts.
- The Argument blob detail path (`doc_X_arg_Y` node IDs) is unchanged.
