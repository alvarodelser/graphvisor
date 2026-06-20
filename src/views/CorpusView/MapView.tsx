import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import { dataService } from '../../data/DataService'
import type { DocNode } from '../../types'
import type { ConceptGrounding } from '../../data/dataset'
import styles from './CorpusView.module.css'

interface Props {
  docs: DocNode[]
  selectedIds: Set<string>
}

export function MapView({ docs, selectedIds }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const [conceptGroundings, setConceptGroundings] = useState<ConceptGrounding[]>([])
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection, sizeBy,
  } = useStore()

  // Load concept grounding data once
  useEffect(() => {
    dataService.getConceptGroundings().then(setConceptGroundings)
  }, [])

  useCorpusD3(svgRef, docs, {
    selectedIds,
    sizeBy,
    conceptGroundings,
    onLassoSelect: (ids, shiftKey) =>
      setSelectedDocuments(
        shiftKey ? [...new Set([...selectedDocumentIds, ...ids])] : ids
      ),
    onClickToggle: (id, shiftKey) => {
      if (shiftKey) toggleDocumentSelection(id)
      else setSelectedDocuments(selectedDocumentIds.includes(id) ? [] : [id])
    },
    setTooltip,
  })

  return (
    <>
      <svg ref={svgRef} className={styles.svg} />
      {tooltip && (
        <FloatingCard style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
            {tooltip.doc.title}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            {tooltip.doc.citations} citations · {tooltip.doc.argument_count} arguments
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
            {tooltip.doc.top_terms.join(' · ')}
          </div>
        </FloatingCard>
      )}
    </>
  )
}
