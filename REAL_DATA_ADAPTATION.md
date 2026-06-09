# Adapting GraphVisor to Real Corpus Data

## What the app currently expects

The app's type system (`src/types/index.ts`) is built around three shapes:

| Type | Key fields |
|---|---|
| `DocNode` | `id`, `title`, `umap_x`, `umap_y`, `pca_x`, `pca_y`, `argument_count`, `page_count`, `top_terms[]` |
| `GraphNode` | `id`, `type` (Argument/Entity/Concept), `label`, `full_text`, `confidence`, `source_document_id`, `source_document_title`, `page_reference` |
| `GraphEdge` | `id`, `source`, `target`, `relation_type`, `confidence`, `group` (positive/negative/causal/structural), `full_predicate` |

Data flows through `DataService` → corpus scatter view, force-graph view, and detail panel.

---

## What the real data has

`corpus_final_dat.json` is a list of 5 documents, each shaped like:

```json
{
  "source": "Paper title — Journal",
  "year": "1991",
  "abstract": "...",
  "data": [
    {
      "arg_id": 0,
      "full_argument": "...",
      "argument_type": "mechanistic | causal | evidence | ...",
      "confidence": 0.9,
      "reasoning": "...",
      "relations": [
        {
          "subject": "sequence homology",
          "relation": "associated_with",
          "object": "recombination frequency tuning",
          "confidence": 0.75,
          "source_argument_id": 0    // always == the parent arg's arg_id
        }
      ],
      "concept_level": {
        "concept_id": 36,
        "parent_concepts": ["recombination", "MutS homologs", ...],
        "parent_concepts_cos": [0.91, 0.91, ...],
        "descriptions": ["...", ...],
        "epistemic_strength": ["high", ...]
      }
    }
  ]
}
```

Stats: **117 arguments**, **187 relations**, **17 unique concept IDs** across 5 docs.

---

## Field mapping (what already maps cleanly)

| App field | Source in real data |
|---|---|
| `DocNode.id` | generate: `doc_0` … `doc_4` |
| `DocNode.title` | `source + " (" + year + ")"` |
| `DocNode.argument_count` | `data.length` |
| `DocNode.top_terms` | most-frequent `parent_concepts` across all args in the doc |
| `GraphNode` (Argument) | one per `data[]` entry — id `doc_0_arg_3`, type `Argument`, label = truncated `full_argument` |
| `GraphNode` (Concept) | one per unique `concept_id` — id `concept_36`, label = first `parent_concepts` string |
| `GraphEdge` source→target | Argument → Concept via `concept_id` (structural / HAS_CONCEPT) |
| `ArgumentDetail.argument` | the `GraphNode` for that arg |
| `ArgumentDetail.sources` | the parent `DocNode` |

---

## What's missing — and what to do about it

### 1. 2D coordinates (`umap_x/y`, `pca_x/y`) — **the main gap**

The real data has no document-level or argument-level embedding coordinates. These are used by the corpus scatter view to position the 5 document bubbles and by the detail mini-map.

**Option A — Generate them (recommended)**
Run a UMAP/PCA reduction on document or argument embeddings (e.g. sentence-transformer vectors for each `full_argument`, averaged per document). Output: 5 rows with `(umap_x, umap_y, pca_x, pca_y)` that get added to the JSON or a small sidecar file.

You offered to generate these — the ideal pipeline is:
1. Embed each `full_argument` → 768-dim vector (or whatever model you use)
2. Run UMAP (n_components=2, min_dist=0.1, n_neighbors=5) on all 117 argument vectors
3. Average per-document → 5 document (umap_x, umap_y) points
4. Repeat with PCA for the `pca_x/y` toggle
5. Append results to each doc entry or a small JSON sidecar

**Option B — Use concept_id centroids**
Map the 17 concept_ids to stable 2D positions (you can hard-code or compute from `parent_concepts_cos` similarity). Each document's position = average centroid of its concept_ids. This is fast and requires no ML, but the layout is arbitrary.

**Option C — Skip the scatter view**
Leave `umap_x/y/pca_x/y = 0` and disable the corpus scatter (or replace it with a simple list). The force-graph and detail views work without coordinates.

### 2. `page_count`

Not present in the data. Can safely set to `argument_count * 2` as a rough estimate (for the size-by-page-count toggle), or hard-code to 0.

### 3. Inter-argument edges in the graph

The `relations[]` within each argument describe SRT triples (subject→relation→object as concept strings), **not pointers to other argument IDs**. So the graph currently has no semantic edges between arguments — only structural Argument→Concept edges.

To add semantic edges you have two options:
- **By shared concept_id**: connect any two arguments that share a `concept_id` (would produce many edges — needs cap or sampling).
- **By embedding similarity**: if embeddings are computed (see §1), connect arguments whose cosine similarity exceeds a threshold. This would give a richer, more meaningful graph.

The `target_argument_id` field in the detail panel currently works by navigating to another node on click. Without inter-argument edges, clicking a relation in the detail panel would navigate to the corresponding concept node.

### 4. The `ArgumentRelation` shape in the detail panel

The detail panel currently expects relations that point to other argument IDs. The SRT triples from the real data contain concept strings, not IDs. For now, the `full_predicate` can be set to `"${subject} ${relation} ${object}"` and `target_argument_id` set to the concept node ID (`concept_36`). Clicking it navigates to the concept in the graph — which is reasonable behaviour.

---

## Recommended action plan

1. **You generate embeddings** → export a JSON like:
   ```json
   [
     { "doc_id": "doc_0", "umap_x": -1.8, "umap_y": 2.1, "pca_x": -0.9, "pca_y": 1.2 },
     ...
   ]
   ```
   Or augment `corpus_final_dat.json` directly with `"umap_x"` / `"umap_y"` on each doc entry.

2. **I implement `RealDataService`** in `DataService.ts` — a new class that:
   - Transforms the raw JSON into `DocNode[]`, `GraphNode[]`, `GraphEdge[]`
   - Merges in the embedding coordinates from step 1
   - Handles `getArgumentDetail` by mapping SRT triples to the `ArgumentRelation` shape

3. Switch `export const dataService` from `MockDataService` to `RealDataService`.

4. Optionally: add semantic inter-argument edges based on shared concept_id or embedding similarity.

---

## Format for the embeddings sidecar (if generated separately)

```json
[
  {
    "doc_id": "doc_0",
    "umap_x": 0.0,
    "umap_y": 0.0,
    "pca_x": 0.0,
    "pca_y": 0.0
  }
]
```

Or inline in `corpus_final_dat.json` as extra fields on each top-level object.
