import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authApi } from './authApi'
import { useAuth } from './useAuth'
import { AdminPanel } from './AdminPanel'
import { ChangePasswordDialog } from './AuthGate'
import { ratedCount, useEvaluations } from '../evaluation/useEvaluations'
import styles from './UserMenu.module.css'

// Status-bar corner: how much you've rated here, and your account.
export function UserMenu() {
  const { user, setUser } = useAuth()
  const rated = useEvaluations(ratedCount)
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'admin' | 'password' | 'code' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!user) return null
  const pick = (d: typeof dialog) => { setOpen(false); setDialog(d) }
  // A full reload: the next person to log in starts from a clean app.
  const logOut = () => authApi.logout().finally(() => { setUser(null); window.location.reload() })

  return (
    <div className={styles.wrap} ref={ref}>
      <span className={styles.rated} title="Hypotheses and arguments you have rated in this collection">
        {rated} rated
      </span>
      <button className={styles.trigger} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {user.name}{user.role === 'admin' ? ' · admin' : ''} ▾
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.who}>{user.email}</div>
          <button role="menuitem" onClick={() => pick('code')}>Add an access code</button>
          <button role="menuitem" onClick={() => pick('password')}>Change password</button>
          {user.role === 'admin' && <button role="menuitem" onClick={() => pick('admin')}>Admin</button>}
          <button role="menuitem" onClick={logOut}>Log out</button>
        </div>
      )}
      {dialog === 'admin' && <AdminPanel onClose={() => setDialog(null)} />}
      {dialog === 'password' && <ChangePasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'code' && <RedeemDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

export function RedeemForm({ onDone }: { onDone?: () => void }) {
  const setUser = useAuth(s => s.setUser)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    authApi.redeem(code)
      .then(u => { setUser(u); onDone?.() })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
  }
  return (
    <form className={styles.redeem} onSubmit={submit}>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="GV-XXXX-XXXX-XXXX" aria-label="Access code" required />
      <button>Add code</button>
      {error && <span className={styles.error}>{error}</span>}
    </form>
  )
}

function RedeemDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogTitle}>Add an access code</div>
        <p className={styles.dialogText}>A new code adds its collections to the ones you already have.</p>
        <RedeemForm onDone={() => { onClose(); window.location.reload() }} />
      </div>
    </div>
  )
}
