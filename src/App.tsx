import { AuthGate } from './auth/AuthGate'
import { CollectionGate } from './components/CollectionGate/CollectionGate'
import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import { GraphView } from './views/GraphView/GraphView'
import { DetailView } from './views/DetailView/DetailView'
import { DiscoverView } from './views/DiscoverView/DiscoverView'

export function App() {
  return (
    <AuthGate>
      <CollectionGate>
        <Shell>
          <CorpusView />
          <DiscoverView />
          <GraphView />
          <DetailView />
        </Shell>
      </CollectionGate>
    </AuthGate>
  )
}
