import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'

interface AuthGuardProps {
  children: ReactNode
  loadingFallback?: ReactNode
  unauthenticatedFallback?: ReactNode
  configurationFallback?: ReactNode
}

export function RequireAuth({
  children,
  loadingFallback = null,
  unauthenticatedFallback = null,
  configurationFallback = null,
}: AuthGuardProps) {
  const { user, isLoading, isConfigured } = useAuth()

  if (!isConfigured) return configurationFallback
  if (isLoading) return loadingFallback
  return user ? children : unauthenticatedFallback
}

interface PublicOnlyProps {
  children: ReactNode
  loadingFallback?: ReactNode
  authenticatedFallback?: ReactNode
}

export function PublicOnly({
  children,
  loadingFallback = null,
  authenticatedFallback = null,
}: PublicOnlyProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) return loadingFallback
  return user ? authenticatedFallback : children
}
