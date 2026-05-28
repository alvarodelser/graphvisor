import { Shell } from './components/Shell/Shell'
import styles from './App.module.css'

function StubView({ label }: { label: string }) {
  return <div className={styles.stub}>{label}</div>
}

export function App() {
  return (
    <Shell>
      <StubView label="Corpus View" />
      <StubView label="Graph View" />
      <StubView label="Detail View" />
    </Shell>
  )
}
