import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../supabase/client'
import { AuthContext, type AuthResult } from './AuthContext'

interface AuthProviderProps {
  children: ReactNode
}

function unavailableResult(): AuthResult {
  return {
    error: {
      name: 'AuthConfigurationError',
      message: 'Supabase Auth não está configurado neste ambiente.',
      status: 503,
    } as AuthError,
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false)
      return
    }

    let active = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(error ? null : data.session)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return unavailableResult()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return unavailableResult()
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return unavailableResult()
    const { error } = await supabase.auth.signOut()
    return { error }
  }, [])

  const requestPasswordReset = useCallback(async (email: string, redirectTo?: string): Promise<AuthResult> => {
    if (!supabase) return unavailableResult()
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    )
    return { error }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
    }),
    [isLoading, requestPasswordReset, session, signIn, signOut, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
