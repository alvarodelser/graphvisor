import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { listCollections, type CollectionInfo } from '../data/dataset'
import { adminApi, type AccessCode, type Person } from './adminApi'
import styles from './AdminPanel.module.css'

type Tab = 'codes' | 'people' | 'collections'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—')

// A secret shown exactly once (a new access code, a temporary password).
function OneTime({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.secret} role="status">
      <div>
        <div className={styles.secretLabel}>{label}: shown only now</div>
        <code className={styles.secretValue}>{value}</code>
      </div>
      <button className={styles.btn} onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button className={styles.btnGhost} onClick={onClose}>Done</button>
    </div>
  )
}

function CollectionPicker({ all, value, onChange }: { all: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const every = value.includes('*')
  return (
    <div className={styles.picker}>
      <label><input type="checkbox" checked={every} onChange={e => onChange(e.target.checked ? ['*'] : [])} /> All, including future ones</label>
      {!every && all.map(c => (
        <label key={c}>
          <input type="checkbox" checked={value.includes(c)}
            onChange={e => onChange(e.target.checked ? [...value, c] : value.filter(x => x !== c))} />
          {c}
        </label>
      ))}
    </div>
  )
}

function CodesTab({ collections }: { collections: string[] }) {
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [role, setRole] = useState<'evaluator' | 'admin'>('evaluator')
  const [picked, setPicked] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string[]>([])

  const reload = useCallback(() => adminApi.codes().then(setCodes).catch(e => setError(msg(e))), [])
  useEffect(() => { reload() }, [reload])

  const run = (p: Promise<unknown>) => p.then(reload).catch(e => setError(msg(e)))

  const create = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    adminApi.createCode({ label, role, collections: role === 'admin' ? ['*'] : picked })
      .then(c => { setSecret({ label: `Code “${c.label}”`, value: c.code }); setLabel(''); setPicked([]); reload() })
      .catch(err => setError(msg(err)))
  }

  return (
    <>
      <p className={styles.lead}>
        People sign up with one of these codes. Admin codes give every collection and this panel; evaluator codes give
        the collections you pick. Changing a code’s collections changes them for everyone who used it.
      </p>
      {secret && <OneTime label={secret.label} value={secret.value} onClose={() => setSecret(null)} />}
      {error && <p className={styles.error}>{error}</p>}
      <form className={styles.newCode} onSubmit={create}>
        <input className={styles.input} placeholder="Label, e.g. “Lab X, autumn workshop”" value={label}
          onChange={e => setLabel(e.target.value)} required />
        <select className={styles.input} value={role} onChange={e => setRole(e.target.value as 'evaluator' | 'admin')}>
          <option value="evaluator">Evaluator</option>
          <option value="admin">Admin</option>
        </select>
        {role === 'evaluator' && <CollectionPicker all={collections} value={picked} onChange={setPicked} />}
        <button className={styles.btn} disabled={role === 'evaluator' && picked.length === 0}>Create code</button>
      </form>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Label</th><th>Code</th><th>Role</th><th>Collections</th><th>People</th><th /></tr></thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.uid} className={c.disabled ? styles.off : ''}>
                <td>{c.label}<div className={styles.sub}>{day(c.created_at)}{c.disabled ? ' · disabled' : ''}</div></td>
                <td><code>…{c.code_hint}</code></td>
                <td>{c.role}</td>
                <td>
                  {editing === c.uid ? (
                    <>
                      <CollectionPicker all={collections} value={editValue} onChange={setEditValue} />
                      <button className={styles.btnSmall} onClick={() => { setEditing(null); run(adminApi.updateCode(c.uid, { collections: editValue })) }}>Save</button>
                      <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      {c.collections.includes('*') ? 'all' : c.collections.join(', ')}
                      {c.role === 'evaluator' && (
                        <button className={styles.btnGhost} onClick={() => { setEditing(c.uid); setEditValue(c.collections) }}>edit</button>
                      )}
                    </>
                  )}
                </td>
                <td>{c.users}</td>
                <td className={styles.rowActions}>
                  <button className={styles.btnGhost} title="Issue a new code; the old one stops working for new sign-ups"
                    onClick={() => adminApi.regenerateCode(c.uid)
                      .then(r => { setSecret({ label: `New code for “${c.label}”`, value: r.code }); reload() })
                      .catch(e => setError(msg(e)))}>
                    Regenerate
                  </button>
                  <button className={styles.btnGhost} onClick={() => run(adminApi.updateCode(c.uid, { disabled: !c.disabled }))}>
                    {c.disabled ? 'Enable' : 'Disable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PeopleTab() {
  const [people, setPeople] = useState<Person[]>([])
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => adminApi.users().then(setPeople).catch(e => setError(msg(e))), [])
  useEffect(() => { reload() }, [reload])

  return (
    <>
      <p className={styles.lead}>
        A password reset gives a temporary password to pass on; they choose their own at the next login.
        Blocking logs them out everywhere.
      </p>
      {secret && <OneTime label={secret.label} value={secret.value} onClose={() => setSecret(null)} />}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Role</th><th>Codes</th><th>Ratings</th><th>Last login</th><th /></tr></thead>
          <tbody>
            {people.map(p => (
              <tr key={p.uid} className={p.blocked ? styles.off : ''}>
                <td>{p.name}<div className={styles.sub}>{p.email}{p.blocked ? ' · blocked' : ''}</div></td>
                <td>{p.role}</td>
                <td>{p.codes.join(', ')}</td>
                <td>{p.ratings}</td>
                <td>{day(p.last_login_at)}</td>
                <td className={styles.rowActions}>
                  <button className={styles.btnGhost}
                    onClick={() => adminApi.resetPassword(p.uid)
                      .then(r => setSecret({ label: `Temporary password for ${p.email}`, value: r.temporary_password }))
                      .catch(e => setError(msg(e)))}>
                    Reset password
                  </button>
                  <button className={styles.btnGhost}
                    onClick={() => adminApi.setBlocked(p.uid, !p.blocked).then(reload).catch(e => setError(msg(e)))}>
                    {p.blocked ? 'Unblock' : 'Block'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

function CollectionRow({ c }: { c: CollectionInfo }) {
  const [fraction, setFraction] = useState<number | null>(null)
  const [state, setState] = useState<string | null>(null)
  useEffect(() => { adminApi.settings(c.name).then(s => setFraction(s.blind_fraction)).catch(() => setFraction(null)) }, [c.name])
  return (
    <tr>
      <td>{c.name}<div className={styles.sub}>{c.status}</div></td>
      <td>
        {fraction !== null && (
          <div className={styles.blindRow}>
            <input type="range" className="styled-slider" min={0} max={1} step={0.05} value={fraction}
              onChange={e => { setFraction(Number(e.target.value)); setState(null) }}
              style={{ '--pct': `${fraction * 100}%`, '--slider-fill': '#073b4c' } as React.CSSProperties} />
            <span className={styles.pct}>{Math.round(fraction * 100)}%</span>
            <button className={styles.btnSmall}
              onClick={() => adminApi.saveSettings(c.name, fraction).then(() => setState('Saved')).catch(e => setState(msg(e)))}>
              Save
            </button>
            {state && <span className={styles.sub}>{state}</span>}
          </div>
        )}
      </td>
      <td>
        <button className={styles.btnGhost}
          onClick={() => adminApi.evaluations(c.name).then(d => download(`graphvisor-ratings-${c.name}.json`, d))}>
          Download ratings
        </button>
      </td>
    </tr>
  )
}

function CollectionsTab({ collections }: { collections: CollectionInfo[] }) {
  return (
    <>
      <p className={styles.lead}>
        Blind share: the part of the hypotheses whose model scores each person sees only after rating them, so their
        own scores aren’t anchored. Which ones are blind differs per person and stays fixed.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Collection</th><th>Blind share</th><th /></tr></thead>
          <tbody>{collections.map(c => <CollectionRow key={c.name} c={c} />)}</tbody>
        </table>
      </div>
    </>
  )
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('codes')
  const [collections, setCollections] = useState<CollectionInfo[]>([])
  useEffect(() => { listCollections().then(setCollections).catch(() => setCollections([])) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} role="dialog" aria-label="Admin" onClick={e => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>Admin</span>
          <nav className={styles.tabs}>
            {(['codes', 'people', 'collections'] as const).map(t => (
              <button key={t} className={tab === t ? styles.tabOn : styles.tab} onClick={() => setTab(t)}>
                {t === 'codes' ? 'Access codes' : t === 'people' ? 'People' : 'Collections'}
              </button>
            ))}
          </nav>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.body}>
          {tab === 'codes' && <CodesTab collections={collections.map(c => c.name)} />}
          {tab === 'people' && <PeopleTab />}
          {tab === 'collections' && <CollectionsTab collections={collections} />}
        </div>
      </div>
    </div>
  )
}
