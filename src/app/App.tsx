import { useState } from 'react'
import { AppShell } from './AppShell'
import { HomePage } from '../features/home/HomePage'
import type { NavigationItem } from '../shared/types/navigation'

export function App() {
  const [activeItem, setActiveItem] = useState<NavigationItem>('home')

  return (
    <AppShell activeItem={activeItem} onNavigate={setActiveItem}>
      <HomePage activeItem={activeItem} />
    </AppShell>
  )
}
