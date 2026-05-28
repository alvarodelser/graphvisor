import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import { GraphView } from './views/GraphView/GraphView'
import styles from './App.module.css'

function StubView({ label }: { label: string }) {
  return <div className={styles.stub}>{label}</div>
}

export function App() {
  return (
    <Shell>
      <CorpusView />
      <GraphView />
      <StubView label="Detail View" />
    </Shell>
  )
}
