import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ProfileContext } from './ProfileContext'
import {
  createOwnAvatarUrl,
  fetchOwnProfile,
  ProfileServiceError,
  removeOwnAvatarObject,
  setOwnAvatarPath,
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

  const handleError = useCallback(async (cause: unknown) => {
    const serviceError = cause instanceof ProfileServiceError ? cause : null
    if (serviceError?.code === 'session_expired') await signOut()
    setError(serviceError?.message ?? 'Não foi possível carregar seu perfil. Tente novamente.')
    setStatus(serviceError?.code === 'not_found' ? 'missing' : serviceError?.code === 'unavailable' ? 'unavailable' : 'error')
  }, [signOut])

  const reloadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setAvatarUrl(null)
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
      setProfile(nextProfile)
      setAvatarUrl(await createOwnAvatarUrl(nextProfile.avatar_path))
      setStatus('ready')
    } catch (cause) {
      setProfile(null)
      setAvatarUrl(null)
      await handleError(cause)
    }
  }, [handleError, isConfigured, user])

  useEffect(() => { void reloadProfile() }, [reloadProfile])

  const saveProfile = useCallback(async (input: ProfileInput, avatar?: File | null, removeAvatar = false) => {
    if (isSaving || !profile) return false
    setIsSaving(true)
    setError('')
    let uploadedPath: string | null = null
    const previousPath = profile.avatar_path
    try {
      let nextProfile = await updateOwnProfile(input)
      if (avatar) {
        uploadedPath = await uploadOwnAvatar(avatar)
        try {
          nextProfile = await setOwnAvatarPath(uploadedPath)
        } catch (cause) {
          await removeOwnAvatarObject(uploadedPath).catch(() => undefined)
          throw cause
        }
      } else if (removeAvatar && previousPath) {
        nextProfile = await setOwnAvatarPath(null)
      }
      setProfile(nextProfile)
      setAvatarUrl(await createOwnAvatarUrl(nextProfile.avatar_path))
      setStatus('ready')
      if ((uploadedPath || removeAvatar) && previousPath && previousPath !== uploadedPath) {
        await removeOwnAvatarObject(previousPath).catch(() => undefined)
      }
      return true
    } catch (cause) {
      await handleError(cause)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [handleError, isSaving, profile])

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
