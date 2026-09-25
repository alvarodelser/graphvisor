import { create } from 'zustand'
import type { User } from './authApi'

interface AuthState {
  user: User | null
  setUser: (u: User | null) => void
}

export const useAuth = create<AuthState>(set => ({
  user: null,
  setUser: user => set({ user }),
}))
