import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AuthProvider } from './shared/auth/AuthProvider'
import { ProfileProvider } from './shared/profile/ProfileProvider'
import './styles/index.css'

const root = document.getElementById('root')

if (!root) throw new Error('Elemento raiz da aplicação não encontrado.')

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <ProfileProvider>
        <App />
      </ProfileProvider>
    </AuthProvider>
  </StrictMode>,
)
