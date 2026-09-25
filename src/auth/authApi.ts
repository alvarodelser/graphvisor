import { api } from '../data/api'

export interface User {
  uid: string
  email: string
  name: string
  must_change_password: boolean
  role: 'admin' | 'evaluator'
  collections: string[]   // ['*'] = every collection
}

export const authApi = {
  me: () => api<User>('/auth/me'),
  login: (email: string, password: string) => api<User>('/auth/login', { method: 'POST', body: { email, password } }),
  signUp: (b: { name: string; email: string; password: string; code: string }) =>
    api<User>('/auth/signup', { method: 'POST', body: b }),
  logout: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  redeem: (code: string) => api<User>('/auth/redeem', { method: 'POST', body: { code } }),
  changePassword: (current: string | null, next: string) =>
    api<{ ok: boolean }>('/auth/password', { method: 'POST', body: { current, new: next } }),
}
