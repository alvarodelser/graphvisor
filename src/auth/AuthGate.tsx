import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, setUnauthorizedHandler } from '../data/api'
import { authApi } from './authApi'
import { useAuth } from './useAuth'
import styles from './AuthGate.module.css'

// Nothing in GraphVisor is visible without an account: people who can browse
// anonymously rarely come back to sign in and rate. Accounts are self-service,
// but signing up needs an access code, which decides the collections.

function message(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e)
}

function Logo() {
  return <div className={styles.brand}>GRAPHVISOR</div>
}

function LoginForm() {
  const setUser = useAuth(s => s.setUser)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      setUser(mode === 'login'
        ? await authApi.login(email, password)
        : await authApi.signUp({ name, email, password, code }))
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      <Logo />
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'}
          className={mode === 'login' ? styles.tabOn : styles.tab} onClick={() => { setMode('login'); setError(null) }}>
          Log in
        </button>
        <button type="button" role="tab" aria-selected={mode === 'signup'}
          className={mode === 'signup' ? styles.tabOn : styles.tab} onClick={() => { setMode('signup'); setError(null) }}>
          Create account
        </button>
      </div>
      {mode === 'signup' && (
        <label className={styles.field}>
          <span>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
        </label>
      )}
      <label className={styles.field}>
        <span>Email</span>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      <label className={styles.field}>
        <span>Password</span>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'signup' ? 8 : undefined}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      </label>
      {mode === 'signup' && (
        <label className={styles.field}>
          <span>Access code</span>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="GV-XXXX-XXXX-XXXX" autoComplete="off" required />
          <small>You got it from the people running GraphVisor. It decides which collections you can see.</small>
        </label>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
      {mode === 'login' && (
        <p className={styles.hint}>Forgot your password? Ask a GraphVisor admin to reset it.</p>
      )}
    </form>
  )
}

// After an admin reset, the temporary password has to be replaced first.
function ChangePasswordForm({ forced, onDone }: { forced: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next !== again) { setError('The two new passwords differ'); return }
    try {
      await authApi.changePassword(forced ? null : current, next)
      onDone()
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      <Logo />
      <h2 className={styles.heading}>{forced ? 'Choose a new password' : 'Change password'}</h2>
      {forced && <p className={styles.hint}>Your password was reset. Pick your own before continuing.</p>}
      {!forced && (
        <label className={styles.field}>
          <span>Current password</span>
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
      )}
      <label className={styles.field}>
        <span>New password</span>
        <input type="password" value={next} onChange={e => setNext(e.target.value)} minLength={8} autoComplete="new-password" required />
      </label>
      <label className={styles.field}>
        <span>Repeat it</span>
        <input type="password" value={again} onChange={e => setAgain(e.target.value)} minLength={8} autoComplete="new-password" required />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary}>Save password</button>
    </form>
  )
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        <ChangePasswordForm forced={false} onDone={onClose} />
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth()
  const [checked, setChecked] = useState(false)
  const [unreachable, setUnreachable] = useState<string | null>(null)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    authApi.me()
      .then(setUser)
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401)) setUnreachable(message(e))
      })
      .finally(() => setChecked(true))
    return () => setUnauthorizedHandler(null)
  }, [setUser])

  if (!checked) return <div className={styles.gate} />
  if (unreachable && !user) {
    return (
      <div className={styles.gate}>
        <div className={styles.panel}>
          <Logo />
          <h2 className={styles.heading}>Can’t reach the GraphVisor API</h2>
          <p className={styles.hint}>{unreachable}</p>
          <button className={styles.primary} onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }
  if (!user) return <div className={styles.gate}><LoginForm /></div>
  if (user.must_change_password) {
    return (
      <div className={styles.gate}>
        <ChangePasswordForm forced onDone={() => setUser({ ...user, must_change_password: false })} />
      </div>
    )
  }
  // Keyed by user: logging in as someone else starts from a clean app.
  return <div key={user.uid} style={{ display: 'contents' }}>{children}</div>
}
