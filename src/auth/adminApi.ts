import { api } from '../data/api'

export interface AccessCode {
  uid: string
  label: string
  role: 'admin' | 'evaluator'
  collections: string[]
  code_hint: string
  users: number
  disabled: boolean
  created_at: string
}

export interface Person {
  uid: string
  email: string
  name: string
  role: 'admin' | 'evaluator'
  blocked: boolean
  codes: string[]
  ratings: number
  created_at: string
  last_login_at: string | null
}

const enc = encodeURIComponent

export const adminApi = {
  codes: () => api<AccessCode[]>('/admin/codes'),
  createCode: (b: { label: string; role: string; collections: string[] }) =>
    api<AccessCode & { code: string }>('/admin/codes', { method: 'POST', body: b }),
  updateCode: (uid: string, b: { label?: string; collections?: string[]; disabled?: boolean }) =>
    api<AccessCode>(`/admin/codes/${enc(uid)}`, { method: 'PATCH', body: b }),
  regenerateCode: (uid: string) => api<{ uid: string; code: string }>(`/admin/codes/${enc(uid)}/regenerate`, { method: 'POST' }),
  users: () => api<Person[]>('/admin/users'),
  resetPassword: (uid: string) =>
    api<{ uid: string; temporary_password: string }>(`/admin/users/${enc(uid)}/reset-password`, { method: 'POST' }),
  setBlocked: (uid: string, blocked: boolean) => api(`/admin/users/${enc(uid)}`, { method: 'PATCH', body: { blocked } }),
  settings: (c: string) => api<{ collection: string; blind_fraction: number }>(`/admin/collections/${enc(c)}/settings`),
  saveSettings: (c: string, blind_fraction: number) =>
    api<{ collection: string; blind_fraction: number }>(`/admin/collections/${enc(c)}/settings`, { method: 'PUT', body: { blind_fraction } }),
  evaluations: (c?: string) => api<unknown[]>(`/admin/evaluations${c ? `?collection=${enc(c)}` : ''}`),
}
