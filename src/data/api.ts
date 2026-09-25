// Every call to the GraphVisor API goes through here. The session is an
// HttpOnly cookie the browser sends by itself (same origin); writes also carry
// X-GraphVisor, which the worker requires so other sites can't post on a
// researcher's behalf.
export const API_BASE: string = import.meta.env.VITE_GRAPHVISOR_API ?? '/graphvisor/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// Called on any 401, so the app can drop back to the login screen.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn }

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers['X-GraphVisor'] = '1'
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  })
  if (!res.ok) {
    let detail = `${method} ${path} failed: ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch { /* not JSON */ }
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}
