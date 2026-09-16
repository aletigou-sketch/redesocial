import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AuthProvider } from './shared/auth/AuthProvider'
import { ProfileProvider } from './shared/profile/ProfileProvider'
import { PresenceProvider } from './shared/presence/PresenceProvider'
import { CallProvider } from './shared/calls/CallProvider'
import { NotificationProvider } from './shared/notifications/NotificationProvider'
import './styles/index.css'

const root = document.getElementById('root')

if (!root) throw new Error('Elemento raiz da aplicação não encontrado.')

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <ProfileProvider>
        <PresenceProvider>
          <NotificationProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </NotificationProvider>
        </PresenceProvider>
      </ProfileProvider>
    </AuthProvider>
  </StrictMode>,
)
