import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import { GraphView } from './views/GraphView/GraphView'
import { DetailView } from './views/DetailView/DetailView'
import { DiscoverView } from './views/DiscoverView/DiscoverView'

export function App() {
  return (
    <Shell>
      <CorpusView />
      <GraphView />
      <DetailView />
      <DiscoverView />
    </Shell>
  )
}
