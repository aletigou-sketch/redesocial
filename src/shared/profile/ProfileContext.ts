import { createContext, useContext } from 'react'
import type { Profile, ProfileInput } from './profileService'

export interface ProfileContextValue {
  profile: Profile | null
  avatarUrl: string | null
  isLoading: boolean
  isSaving: boolean
  error: string
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error' | 'unavailable'
  reloadProfile: () => Promise<void>
  saveProfile: (input: ProfileInput, avatar?: File | null, removeAvatar?: boolean) => Promise<boolean>
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile deve ser usado dentro de ProfileProvider.')
  return context
}
