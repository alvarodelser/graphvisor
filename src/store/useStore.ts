import { create } from 'zustand'
import type { FilterState, ActiveView, SizeBy, CorpusViewMode, SelectedRelation } from '../types'

const defaultFilters: FilterState = {
  nodeTypes: { Argument: false, Entity: true, Concept: false },
  minConfidence: 0.9,
  relationTypes: {
    SUPPORTS: true, CORRELATES_WITH: true, REVEALS: true,
    CONTRADICTS: true,
    CAUSES: true, ASSOCIATED_WITH: true,
    HAS_SUBJECT: true, HAS_OBJECT: true, HAS_CONCEPT: true,
  },
}

interface AppState {
  selectedDocumentIds: string[]
  selectedNodeId: string | null
  activeView: ActiveView
  corpusViewMode: CorpusViewMode
  filters: FilterState
  sizeBy: SizeBy
  showBlobs: boolean
  selectedArgumentId: string | null
  selectedConceptId: string | null
  selectedRelation: SelectedRelation | null
  selectedHypothesisIds: string[]
  conceptSimilarityThreshold: number
  conceptAggregateThreshold: number
  discoveredHypothesisCount: number
  scopedArgumentCount: number
  pendingEvidenceOnly: boolean   // one-shot: scope Explore to hypothesis evidence args on entry
  toggleDocumentSelection: (id: string) => void
  setSelectedDocuments: (ids: string[]) => void
  clearSelection: () => void
  selectAll: (ids: string[]) => void
  setSelectedNode: (id: string | null) => void
  setActiveView: (view: ActiveView) => void
  setCorpusViewMode: (mode: CorpusViewMode) => void
  setFilters: (partial: Partial<FilterState>) => void
  setSizeBy: (s: SizeBy) => void
  setShowBlobs: (v: boolean) => void
  setSelectedArgumentId: (id: string | null) => void
  setSelectedConceptId: (id: string | null) => void
  setSelectedRelation: (r: SelectedRelation | null) => void
  selectHypothesis: (id: string, multi: boolean) => void
  selectAllHypotheses: (ids: string[]) => void
  clearHypothesisSelection: () => void
  setConceptSimilarityThreshold: (v: number) => void
  setConceptAggregateThreshold: (v: number) => void
  setDiscoveredHypothesisCount: (v: number) => void
  setScopedArgumentCount: (v: number) => void
  setPendingEvidenceOnly: (v: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  selectedDocumentIds: [],
  selectedNodeId: null,
  activeView: 'corpus',
  corpusViewMode: 'map',
  filters: defaultFilters,
  sizeBy: 'argument_count',
  showBlobs: false,
  selectedArgumentId: null,
  selectedConceptId: null,
  selectedRelation: null,
  selectedHypothesisIds: [],
  conceptSimilarityThreshold: 0.9,
  conceptAggregateThreshold: 6,
  discoveredHypothesisCount: 0,
  scopedArgumentCount: 0,
  pendingEvidenceOnly: false,
  toggleDocumentSelection: (id) =>
    set((s) => ({
      selectedDocumentIds: s.selectedDocumentIds.includes(id)
        ? s.selectedDocumentIds.filter((d) => d !== id)
        : [...s.selectedDocumentIds, id],
    })),
  setSelectedDocuments: (ids) => set({ selectedDocumentIds: ids }),
  clearSelection: () => set({ selectedDocumentIds: [] }),
  selectAll: (ids) => set({ selectedDocumentIds: ids }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setActiveView: (view) => set({ activeView: view }),
  setCorpusViewMode: (mode) => set({ corpusViewMode: mode }),
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  setSizeBy: (s) => set({ sizeBy: s }),
  setShowBlobs: (v) => set({ showBlobs: v }),
  setSelectedArgumentId: (id) => set({ selectedArgumentId: id }),
  setSelectedConceptId: (id) => set({ selectedConceptId: id }),
  setSelectedRelation: (r) => set({ selectedRelation: r }),
  selectHypothesis: (id, multi) =>
    set((s) => {
      if (multi) {
        return {
          selectedHypothesisIds: s.selectedHypothesisIds.includes(id)
            ? s.selectedHypothesisIds.filter((h) => h !== id)
            : [...s.selectedHypothesisIds, id],
        }
      }
      return {
        selectedHypothesisIds:
          s.selectedHypothesisIds.length === 1 && s.selectedHypothesisIds[0] === id
            ? []
            : [id],
      }
    }),
  selectAllHypotheses: (ids) => set({ selectedHypothesisIds: ids }),
  clearHypothesisSelection: () => set({ selectedHypothesisIds: [] }),
  setConceptSimilarityThreshold: (v) => set({ conceptSimilarityThreshold: v }),
  setConceptAggregateThreshold: (v) => set({ conceptAggregateThreshold: v }),
  setDiscoveredHypothesisCount: (v) => set({ discoveredHypothesisCount: v }),
  setScopedArgumentCount: (v) => set({ scopedArgumentCount: v }),
  setPendingEvidenceOnly: (v) => set({ pendingEvidenceOnly: v }),
}))
