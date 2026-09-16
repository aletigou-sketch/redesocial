import { createContext, useContext } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'

export interface AuthResult {
  error: AuthError | null
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  isLoading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  requestPasswordReset: (email: string, redirectTo?: string) => Promise<AuthResult>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  }

  return context
}
