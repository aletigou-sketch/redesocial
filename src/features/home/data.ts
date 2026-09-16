export interface Story {
  id: string
  name: string
  initials: string
  className: string
  seen?: boolean
  own?: boolean
}

export interface Conversation {
  id: string
  name: string
  initials: string
  className: string
  message: string
  time: string
  online?: boolean
  unread?: number
}

export const stories: Story[] = [
  { id: 'own', name: 'Seu story', initials: 'LM', className: 'avatar-livia', own: true },
  { id: '1', name: 'Rafa', initials: 'RA', className: 'avatar-rafa' },
  { id: '2', name: 'Clara', initials: 'CL', className: 'avatar-clara' },
  { id: '3', name: 'Theo', initials: 'TH', className: 'avatar-theo' },
  { id: '4', name: 'Bia', initials: 'BI', className: 'avatar-bia', seen: true },
  { id: '5', name: 'Lucas', initials: 'LU', className: 'avatar-lucas', seen: true },
]

export const conversations: Conversation[] = [
  { id: '1', name: 'Rafael Alves', initials: 'RA', className: 'avatar-rafa', message: 'Combinado! Até mais tarde 🙌', time: '2 min', online: true, unread: 2 },
  { id: '2', name: 'Clara Nunes', initials: 'CL', className: 'avatar-clara', message: 'Você viu o grupo novo?', time: '18 min', online: true, unread: 1 },
  { id: '3', name: 'Theo Martins', initials: 'TH', className: 'avatar-theo', message: 'Amei as fotos!', time: '1 h' },
  { id: '4', name: 'Grupo · Trilhas SP', initials: 'TS', className: 'avatar-group', message: 'Bia: próximo sábado?', time: '3 h' },
]
