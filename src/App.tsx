import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import styles from './App.module.css'

function StubView({ label }: { label: string }) {
  return <div className={styles.stub}>{label}</div>
}

export function App() {
  return (
    <Shell>
      <CorpusView />
      <StubView label="Graph View" />
      <StubView label="Detail View" />
    </Shell>
  )
}
