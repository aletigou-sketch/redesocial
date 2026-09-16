import { useState } from 'react'
import { ArrowRight, ChevronRight, Image, MapPin, MessageCircle, MoreHorizontal, Plus, Send, Users } from 'lucide-react'
import type { NavigationItem } from '../../shared/types/navigation'
import { ProfilePage } from '../profile/ProfilePage'
import { StoriesPage } from '../stories/StoriesPage'
import { conversations, stories } from './data'

interface HomePageProps { activeItem: NavigationItem }

export function HomePage({ activeItem }: HomePageProps) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [liked, setLiked] = useState(false)

  if (activeItem === 'profile') return <ProfilePage />
  if (activeItem === 'stories') return <StoriesPage />
  if (activeItem !== 'home') return <EmptySection section={activeItem} />

  return (
    <div className="home-layout">
      <section className="feed-column">
        <div className="welcome-row">
          <div><p className="eyebrow">QUARTA-FEIRA, 16 DE SETEMBRO</p><h1>Oi, Lívia <span>👋</span></h1><p>Veja o que está acontecendo por aqui.</p></div>
          <button className="primary-button" onClick={() => setComposerOpen(true)}><Plus size={18} /> Criar publicação</button>
        </div>

        <section className="stories-section" aria-labelledby="stories-title">
          <div className="section-heading"><h2 id="stories-title">Stories</h2><button>Ver todos <ChevronRight size={16} /></button></div>
          <div className="stories-list">
            {stories.map((story) => (
              <button className="story" key={story.id}>
                <span className={`story-ring ${story.seen ? 'seen' : ''}`}>
                  <span className={`avatar story-avatar ${story.className}`}>{story.initials}</span>
                  {story.own && <span className="story-add"><Plus size={12} /></span>}
                </span>
                <span>{story.name}</span>
              </button>
            ))}
          </div>
        </section>

        {composerOpen && (
          <section className="composer card">
            <span className="avatar avatar-small avatar-livia">LM</span>
            <input autoFocus placeholder="Compartilhe algo com sua rede..." aria-label="Texto da publicação" />
            <button className="icon-button" aria-label="Adicionar imagem"><Image size={19} /></button>
            <button className="primary-button compact" onClick={() => setComposerOpen(false)}>Publicar</button>
          </section>
        )}

        <article className="post card">
          <header className="post-header">
            <span className="avatar avatar-medium avatar-rafa">RA</span>
            <div><strong>Rafael Alves</strong><p>@rafa.alves · 24 min</p></div>
            <button className="icon-button post-menu" aria-label="Mais opções"><MoreHorizontal size={20} /></button>
          </header>
          <p className="post-copy">Fim de tarde perfeito para desacelerar e aproveitar a cidade. Às vezes, tudo que a gente precisa é mudar a perspectiva. ✨</p>
          <div className="post-image" role="img" aria-label="Vista ilustrada de um pôr do sol na cidade">
            <div className="sun" /><div className="mountain mountain-back"/><div className="mountain mountain-front"/>
            <span className="location"><MapPin size={14} /> São Paulo, SP</span>
          </div>
          <div className="post-stats"><span>24 pessoas curtiram</span><span>6 comentários</span></div>
          <footer className="post-actions">
            <button className={liked ? 'liked' : ''} onClick={() => setLiked((value) => !value)}><span>{liked ? '♥' : '♡'}</span> Curtir</button>
            <button><MessageCircle size={18} /> Comentar</button>
            <button><Send size={18} /> Compartilhar</button>
          </footer>
        </article>
      </section>

      <aside className="right-column">
        <section className="side-panel">
          <div className="section-heading"><h2>Mensagens</h2><button>Ver todas</button></div>
          <div className="conversation-list">
            {conversations.map((item) => (
              <button className="conversation" key={item.id}>
                <span className="avatar-wrap"><span className={`avatar avatar-small ${item.className}`}>{item.initials}</span>{item.online && <span className="online-dot" />}</span>
                <span className="conversation-copy"><strong>{item.name}</strong><small>{item.message}</small></span>
                <span className="conversation-meta"><time>{item.time}</time>{item.unread && <b>{item.unread}</b>}</span>
              </button>
            ))}
          </div>
          <button className="secondary-button full-width"><MessageCircle size={17} /> Nova mensagem</button>
        </section>

        <section className="side-panel groups-panel">
          <div className="section-heading"><h2>Seus grupos</h2><button>Explorar</button></div>
          <button className="group-row"><span className="group-icon warm">🌄</span><span><strong>Trilhas SP</strong><small>2 novas mensagens</small></span><ArrowRight size={16}/></button>
          <button className="group-row"><span className="group-icon purple">✦</span><span><strong>Design & Café</strong><small>128 membros</small></span><ArrowRight size={16}/></button>
          <button className="group-create"><Users size={18}/><span><strong>Encontre sua turma</strong><small>Descubra grupos com a sua cara</small></span><Plus size={16}/></button>
        </section>
      </aside>
    </div>
  )
}

const labels: Record<NavigationItem, string> = {
  home: 'Início', stories: 'Stories', messages: 'Mensagens', groups: 'Grupos', notifications: 'Notificações', profile: 'Perfil',
}

function EmptySection({ section }: { section: NavigationItem }) {
  return <section className="empty-state"><span className="empty-symbol">✦</span><h1>{labels[section]}</h1><p>Esta área está preparada na arquitetura e será construída nas próximas etapas.</p><button className="primary-button">Voltar em breve</button></section>
}
