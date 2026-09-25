import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthGate } from '../src/auth/AuthGate'
import { useAuth } from '../src/auth/useAuth'

const user = { uid: 'u1', email: 'ada@x.org', name: 'Ada', must_change_password: false, role: 'evaluator', collections: ['c'] }

type Route = (url: string, init?: RequestInit) => [number, unknown]
function serve(route: Route) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const [status, body] = route(url, init)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => { vi.unstubAllGlobals(); useAuth.setState({ user: null }) })

describe('AuthGate', () => {
  it('shows nothing of the app without a session', async () => {
    serve(() => [401, { detail: 'not logged in' }])
    render(<AuthGate><div>the app</div></AuthGate>)
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('renders the app for a logged-in user', async () => {
    serve(() => [200, user])
    render(<AuthGate><div>the app</div></AuthGate>)
    expect(await screen.findByText('the app')).toBeInTheDocument()
  })

  it('signs up with an access code, sending the CSRF header', async () => {
    const fetch = serve((url, init) => url.endsWith('/auth/me') ? [401, {}] : [200, user])
    render(<AuthGate><div>the app</div></AuthGate>)
    fireEvent.click(await screen.findByRole('tab', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@x.org' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long enough' } })
    fireEvent.change(screen.getByLabelText(/Access code/), { target: { value: 'GV-AAAA-BBBB-CCCC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('the app')).toBeInTheDocument()
    const [url, init] = fetch.mock.calls.find(([u]) => String(u).endsWith('/auth/signup'))!
    expect(url).toBe('/graphvisor/api/auth/signup')
    expect((init!.headers as Record<string, string>)['X-GraphVisor']).toBe('1')
    expect(JSON.parse(init!.body as string).code).toBe('GV-AAAA-BBBB-CCCC')
  })

  it('shows why a login failed', async () => {
    serve(url => url.endsWith('/auth/me') ? [401, {}] : [401, { detail: 'wrong email or password' }])
    render(<AuthGate><div>the app</div></AuthGate>)
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'ada@x.org' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('wrong email or password')
  })

  it('asks for a new password after an admin reset, before the app', async () => {
    serve(url => url.endsWith('/auth/me') ? [200, { ...user, must_change_password: true }] : [200, { ok: true }])
    render(<AuthGate><div>the app</div></AuthGate>)
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand new pw' } })
    fireEvent.change(screen.getByLabelText('Repeat it'), { target: { value: 'brand new pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(screen.getByText('the app')).toBeInTheDocument())
  })
})
