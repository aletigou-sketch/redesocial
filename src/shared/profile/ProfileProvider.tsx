import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ProfileContext } from './ProfileContext'
import {
  createOwnAvatarUrl,
  fetchOwnProfile,
  ProfileServiceError,
  removeOwnAvatarObject,
  updateOwnProfile,
  uploadOwnAvatar,
  type Profile,
  type ProfileInput,
} from './profileService'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, isConfigured, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error' | 'unavailable'>('idle')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const activeUserIdRef = useRef(user?.id ?? null)
  const requestIdRef = useRef(0)
  const savingRef = useRef(false)

  useEffect(() => {
    activeUserIdRef.current = user?.id ?? null
    requestIdRef.current += 1
    savingRef.current = false
    setIsSaving(false)
    setProfile(null)
    setAvatarUrl(null)
    setError('')
    setStatus(user ? 'loading' : 'idle')
  }, [user?.id])

  const applyError = useCallback(async (cause: unknown, expectedUserId: string | null) => {
    if (activeUserIdRef.current !== expectedUserId) return
    const serviceError = cause instanceof ProfileServiceError ? cause : null
    if (serviceError?.code === 'session_expired') {
      await signOut()
      return
    }
    setError(serviceError?.message ?? 'Não foi possível carregar seu perfil. Tente novamente.')
    setStatus(serviceError?.code === 'not_found' ? 'missing' : serviceError?.code === 'unavailable' ? 'unavailable' : 'error')
  }, [signOut])

  const reloadProfile = useCallback(async () => {
    const expectedUserId = user?.id ?? null
    const requestId = ++requestIdRef.current
    if (!expectedUserId) {
      setProfile(null)
      setAvatarUrl(null)
      setError('')
      setStatus('idle')
      return
    }
    if (!isConfigured) {
      setStatus('unavailable')
      setError('O backend não está configurado neste ambiente.')
      return
    }

    setStatus('loading')
    setError('')
    try {
      const nextProfile = await fetchOwnProfile()
      if (requestIdRef.current !== requestId || activeUserIdRef.current !== expectedUserId) return
      setProfile(nextProfile)
      setStatus('ready')

      try {
        const nextAvatarUrl = await createOwnAvatarUrl(nextProfile.avatar_path)
        if (requestIdRef.current === requestId && activeUserIdRef.current === expectedUserId) {
          setAvatarUrl(nextAvatarUrl)
        }
      } catch (cause) {
        if (requestIdRef.current !== requestId || activeUserIdRef.current !== expectedUserId) return
        const serviceError = cause instanceof ProfileServiceError ? cause : null
        if (serviceError?.code === 'session_expired') {
          await signOut()
          return
        }
        setAvatarUrl(null)
        setError('O perfil foi carregado, mas o avatar privado não pôde ser exibido.')
      }
    } catch (cause) {
      if (requestIdRef.current !== requestId || activeUserIdRef.current !== expectedUserId) return
      setProfile(null)
      setAvatarUrl(null)
      await applyError(cause, expectedUserId)
    }
  }, [applyError, isConfigured, signOut, user?.id])

  useEffect(() => { void reloadProfile() }, [reloadProfile])

  const saveProfile = useCallback(async (input: ProfileInput, avatar?: File | null, removeAvatar = false) => {
    const expectedUserId = user?.id ?? null
    const currentProfile = profile
    if (savingRef.current || !currentProfile || !expectedUserId || currentProfile.user_id !== expectedUserId) return false

    savingRef.current = true
    setIsSaving(true)
    setError('')
    const previousPath = currentProfile.avatar_path
    let uploadedPath: string | null = null

    try {
      if (avatar) uploadedPath = await uploadOwnAvatar(avatar)
      if (activeUserIdRef.current !== expectedUserId) {
        if (uploadedPath) await removeOwnAvatarObject(uploadedPath).catch(() => undefined)
        return false
      }

      const avatarChange = uploadedPath ?? (removeAvatar ? null : undefined)
      const nextProfile = await updateOwnProfile(input, avatarChange)
      if (activeUserIdRef.current !== expectedUserId) return false

      setProfile(nextProfile)
      setStatus('ready')
      try {
        setAvatarUrl(await createOwnAvatarUrl(nextProfile.avatar_path))
      } catch (cause) {
        const serviceError = cause instanceof ProfileServiceError ? cause : null
        if (serviceError?.code === 'session_expired') {
          await signOut()
          return false
        }
        setAvatarUrl(null)
        setError('O perfil foi salvo, mas o avatar privado não pôde ser exibido.')
      }

      if ((uploadedPath || removeAvatar) && previousPath && previousPath !== uploadedPath) {
        await removeOwnAvatarObject(previousPath).catch(() => undefined)
      }
      return true
    } catch (cause) {
      if (uploadedPath) await removeOwnAvatarObject(uploadedPath).catch(() => undefined)
      await applyError(cause, expectedUserId)
      return false
    } finally {
      savingRef.current = false
      if (activeUserIdRef.current === expectedUserId) setIsSaving(false)
    }
  }, [applyError, profile, signOut, user?.id])

  const value = useMemo(() => ({
    profile,
    avatarUrl,
    isLoading: status === 'loading',
    isSaving,
    error,
    status,
    reloadProfile,
    saveProfile,
  }), [avatarUrl, error, isSaving, profile, reloadProfile, saveProfile, status])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
