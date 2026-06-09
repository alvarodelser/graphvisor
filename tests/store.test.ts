import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../src/store/useStore'

beforeEach(() => {
  useStore.setState({
    selectedDocumentIds: [],
    selectedNodeId: null,
    activeView: 'corpus',
    showBlobs: false,
    selectedArgumentId: null,
  })
})

describe('useStore', () => {
  it('toggleDocumentSelection adds a new id', () => {
    useStore.getState().toggleDocumentSelection('doc_001')
    expect(useStore.getState().selectedDocumentIds).toContain('doc_001')
  })
  it('toggleDocumentSelection removes an existing id', () => {
    useStore.setState({ selectedDocumentIds: ['doc_001'] })
    useStore.getState().toggleDocumentSelection('doc_001')
    expect(useStore.getState().selectedDocumentIds).not.toContain('doc_001')
  })
  it('clearSelection empties the array', () => {
    useStore.setState({ selectedDocumentIds: ['doc_001', 'doc_002'] })
    useStore.getState().clearSelection()
    expect(useStore.getState().selectedDocumentIds).toHaveLength(0)
  })
  it('setSelectedNode updates selectedNodeId', () => {
    useStore.getState().setSelectedNode('arg_001')
    expect(useStore.getState().selectedNodeId).toBe('arg_001')
  })
  it('setActiveView changes active view', () => {
    useStore.getState().setActiveView('graph')
    expect(useStore.getState().activeView).toBe('graph')
  })
  it('setShowBlobs toggles blob visibility', () => {
    expect(useStore.getState().showBlobs).toBe(false)
    useStore.getState().setShowBlobs(true)
    expect(useStore.getState().showBlobs).toBe(true)
    useStore.getState().setShowBlobs(false)
    expect(useStore.getState().showBlobs).toBe(false)
  })
  it('setSelectedArgumentId sets and clears argument selection', () => {
    useStore.getState().setSelectedArgumentId('doc_0_arg_3')
    expect(useStore.getState().selectedArgumentId).toBe('doc_0_arg_3')
    useStore.getState().setSelectedArgumentId(null)
    expect(useStore.getState().selectedArgumentId).toBeNull()
  })
})
