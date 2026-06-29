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
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 16, paddingTop: 88, background: '#fafbfc' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12,
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
                border: allSelected ? '1.5px solid rgba(239,71,111,0.4)' : '1px solid rgba(7,59,76,0.12)',
                borderRadius: 12, padding: '14px 16px',
                background: allSelected ? 'rgba(239,71,111,0.03)' : '#fff',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: '#073b4c', marginBottom: 3, lineHeight: 1.35 }}>
                {topic.label}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
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
                        width: 14, height: 14, borderRadius: 3, cursor: 'pointer',
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
            {tooltip.doc.citations > 0 ? `${tooltip.doc.citations} citations · ` : ''}{tooltip.doc.argument_count} arguments
          </div>
        </FloatingCard>
      )}
    </div>
  )
}
