import { createContext, useContext } from 'react'

export type AuthUser = {
  id: string
  email: string | null
  phone: string | null
  name: string
  provider: string
  onboardingComplete: boolean
}
export type AuthConfig = { google: boolean; email: boolean; phone: boolean }
export type AuthContextValue = {
  user: AuthUser | null
  guest: boolean
  signOut: () => Promise<void>
  openSignIn: () => Promise<void>
}
export const AuthContext = createContext<AuthContextValue>({ user: null, guest: true, signOut: async () => {}, openSignIn: async () => {} })
export const useAuth = () => useContext(AuthContext)

export async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Impossible de joindre votre compte. Réessayez dans un instant.')
  return body as T
}
