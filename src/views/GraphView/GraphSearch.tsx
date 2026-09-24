import { useMemo, useState } from 'react'
import { SearchBar, type SearchSection } from '../../components/SearchBar/SearchBar'
import { lexicalSearch } from '../../utils/lexicalSearch'
import { useArgumentSearch } from '../useArgumentSearch'
import type { ArgumentBlob, GraphNode } from '../../types'
import styles from './GraphView.module.css'

const snippet = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)

interface Props {
  nodes: GraphNode[]
  blobs: ArgumentBlob[]
  onPickEntity: (node: GraphNode) => void
  onPickArgument: (blob: ArgumentBlob) => void
}

// Arguments-graph search: entity names by words and arguments by meaning, both
// limited to what the graph currently shows. Picking a result focuses it.
export function GraphSearch({ nodes, blobs, onPickEntity, onPickArgument }: Props) {
  const [query, setQuery] = useState('')
  const semantic = useArgumentSearch(query, 60)
  const entities = useMemo(() => nodes.filter(n => n.type === 'Entity'), [nodes])
  const blobById = useMemo(() => new Map(blobs.map(b => [b.id, b])), [blobs])

  const entityHits = useMemo(() => lexicalSearch(query, entities, n => n.label, 15), [query, entities])
  const inGraph = semantic.results.filter(r => blobById.has(r.blobId))
  const outside = semantic.results.length - inGraph.length

  const sections: SearchSection[] = [
    {
      title: 'Entities', kind: 'lexical',
      items: entityHits.map(n => ({ key: n.id, primary: n.label, onPick: () => onPickEntity(n) })),
    },
    {
      title: 'Arguments', kind: 'semantic',
      loading: semantic.loading,
      error: semantic.error ? 'Semantic search unavailable' : null,
      note: !semantic.active ? 'Type at least 3 characters to search by meaning'
        : outside > 0 ? `${outside} more in documents not selected` : null,
      items: inGraph.slice(0, 15).map(r => {
        const blob = blobById.get(r.blobId)!
        return {
          key: r.blobId, primary: snippet(r.text), secondary: blob.source_document_title,
          score: r.score, onPick: () => onPickArgument(blob),
        }
      }),
    },
  ]

  return (
    <div className={styles.search}>
      <SearchBar placeholder="Search entities and arguments" query={query} onQueryChange={setQuery} sections={sections} />
    </div>
  )
}
