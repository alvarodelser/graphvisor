import { useEffect, useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import type { DocNode, Topic } from '../../types'

interface Props {
  docs: DocNode[]
  selectedIds: Set<string>
}

const SELECTED = '#ef476f'
const UNSELECTED = '#74b9d6'

export function TopicsView({ docs, selectedIds }: Props) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection, selectAll,
  } = useStore()

  useEffect(() => { dataService.getTopics().then(setTopics) }, [])

  const docById = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])

  // Only topics that still have visible docs after filtering
  const visibleTopics = useMemo(
    () => topics
      .map(t => ({ ...t, docIds: t.docIds.filter(id => docById.has(id)) }))
      .filter(t => t.docIds.length > 0),
    [topics, docById],
  )

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 24, paddingTop: 64, background: '#fafbfc' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14,
      }}>
        {visibleTopics.map(topic => {
          const allSelected = topic.docIds.every(id => selectedIds.has(id))
          return (
            <div
              key={topic.id}
              onClick={() => {
                if (allSelected) setSelectedDocuments(selectedDocumentIds.filter(id => !topic.docIds.includes(id)))
                else selectAll([...new Set([...selectedDocumentIds, ...topic.docIds])])
              }}
              style={{
                border: '1px solid rgba(7,59,76,0.15)', borderRadius: 12, padding: 12,
                background: '#fff', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#073b4c', marginBottom: 2 }}>
                {topic.label}
              </div>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 8 }}>
                {topic.docIds.length} docs · {topic.argCount} args
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {topic.docIds.map(id => {
                  const doc = docById.get(id)!
                  return (
                    <span
                      key={id}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (e.shiftKey) toggleDocumentSelection(id)
                        else setSelectedDocuments(selectedDocumentIds.includes(id) ? selectedDocumentIds.filter(x => x !== id) : [...selectedDocumentIds, id])
                      }}
                      onMouseEnter={(e) => setTooltip({ doc, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: 16, height: 16, borderRadius: 5, cursor: 'pointer',
                        background: selectedIds.has(id) ? SELECTED : UNSELECTED,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {tooltip && (
        <FloatingCard style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
            {tooltip.doc.title}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            {tooltip.doc.citations} citations · {tooltip.doc.argument_count} arguments
          </div>
        </FloatingCard>
      )}
    </div>
  )
}
