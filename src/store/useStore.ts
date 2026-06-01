import { create } from 'zustand'
import type { FilterState, ActiveView, Projection, SizeBy } from '../types'

const defaultFilters: FilterState = {
  nodeTypes: { Argument: true, Entity: true, Concept: true },
  minConfidence: 0,
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
  filters: FilterState
  projection: Projection
  sizeBy: SizeBy
  toggleDocumentSelection: (id: string) => void
  setSelectedDocuments: (ids: string[]) => void
  clearSelection: () => void
  selectAll: (ids: string[]) => void
  setSelectedNode: (id: string | null) => void
  setActiveView: (view: ActiveView) => void
  setFilters: (partial: Partial<FilterState>) => void
  setProjection: (p: Projection) => void
  setSizeBy: (s: SizeBy) => void
}

export const useStore = create<AppState>((set) => ({
  selectedDocumentIds: [],
  selectedNodeId: null,
  activeView: 'corpus',
  filters: defaultFilters,
  projection: 'umap',
  sizeBy: 'argument_count',
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
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  setProjection: (p) => set({ projection: p }),
  setSizeBy: (s) => set({ sizeBy: s }),
}))
