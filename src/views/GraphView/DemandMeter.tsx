import { meterFill } from './lod'
import styles from './DemandMeter.module.css'

interface Props {
  count: number
  limit: number
  bars?: number
}

// Rising-bars "demand" gauge (green → amber → red) showing scoped entity load
// against the blocking limit. Lives in the concept sidebar header.
export function DemandMeter({ count, limit, bars = 5 }: Props) {
  const { filled, level } = meterFill(count, limit, bars)
  return (
    <div className={styles.meter} data-level={level} title={`${count} of ${limit} entities`}>
      <span className={styles.bars} aria-hidden>
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={styles.bar}
            data-on={i < filled}
            style={{ height: `${35 + i * (65 / (bars - 1))}%` }}
          />
        ))}
      </span>
      <span className={styles.label}>{count}<span className={styles.slash}>/{limit}</span></span>
    </div>
  )
}
