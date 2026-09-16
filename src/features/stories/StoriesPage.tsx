import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../../shared/auth/AuthContext'
import { fetchStories, publishStory, registerStoryView, StoryServiceError, type Story } from './storyService'
import { ModerationActions } from '../moderation/ModerationActions'

const VIEW_DURATION_MS = 6000

export function StoriesPage() {
  const { user } = useAuth()
  const [stories, setStories] = useState<Story[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setStatus('loading')
    setError('')
    try {
      const result = await fetchStories()
      if (sequence !== loadSequence.current) return
      setStories(result)
      setStatus('ready')
    } catch (cause) {
      if (sequence !== loadSequence.current) return
      setStories([])
      setError(cause instanceof StoryServiceError ? cause.message : 'Não foi possível carregar os Stories.')
      setStatus('error')
    }
  }, [user?.id])

  useEffect(() => {
    setActiveIndex(null)
    void load()
    return () => { loadSequence.current += 1 }
  }, [load])

  const closeViewer = useCallback(() => {
    setActiveIndex(null)
    window.requestAnimationFrame(() => openerRef.current?.focus())
  }, [])
  const next = useCallback(() => {
    setActiveIndex((current) => current === null || current >= stories.length - 1 ? null : current + 1)
  }, [stories.length])
  const previous = useCallback(() => {
    setActiveIndex((current) => current === null ? null : Math.max(0, current - 1))
  }, [])

  const activeStory = activeIndex === null ? null : stories[activeIndex] ?? null
  const activeStoryId = activeStory?.id ?? null

  useEffect(() => {
    if (!activeStoryId) return
    setProgress(0)
    void registerStoryView(activeStoryId).then(() => {
      setStories((current) => current.map((item) => item.id === activeStoryId ? { ...item, viewed: true } : item))
    }).catch((cause) => {
      if (cause instanceof StoryServiceError && cause.code === 'session_expired') setError(cause.message)
    })
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      const value = Math.min(100, ((performance.now() - startedAt) / VIEW_DURATION_MS) * 100)
      setProgress(value)
      if (value >= 100) next()
    }, 100)
    return () => window.clearInterval(timer)
  }, [activeStoryId, next])

  useEffect(() => {
    if (!activeStory) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewer()
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') previous()
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.story-viewer button:not(:disabled)'))
        if (!controls.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeStory, closeViewer, next, previous])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || isPublishing) return
    setIsPublishing(true)
    setError('')
    try {
      await publishStory(file)
      await load()
    } catch (cause) {
      setError(cause instanceof StoryServiceError ? cause.message : 'Não foi possível publicar o Story.')
    } finally {
      setIsPublishing(false)
    }
  }

  function openViewer(index: number, opener: HTMLButtonElement) {
    openerRef.current = opener
    setActiveIndex(index)
  }

  function markMediaUnavailable(storyId: string) {
    setStories((current) => current.map((story) => story.id === storyId ? { ...story, mediaUrl: null } : story))
  }

  return (
    <section className="stories-page">
      <header className="stories-header">
        <div><p className="eyebrow">MOMENTOS QUE DURAM 24 HORAS</p><h1>Stories</h1><p>Compartilhe uma imagem com pessoas que podem descobrir seu perfil.</p></div>
        <button className="primary-button" onClick={() => inputRef.current?.click()} disabled={isPublishing}>
          {isPublishing ? <LoaderCircle className="spin" size={18} /> : <ImagePlus size={18} />}
          {isPublishing ? 'Publicando…' : 'Criar Story'}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={isPublishing} />
      </header>

      {error && <div className="stories-alert" role="alert">{error}</div>}

      {status === 'loading' && <div className="stories-state" aria-live="polite"><LoaderCircle className="spin" /><strong>Carregando Stories…</strong></div>}
      {status === 'error' && <div className="stories-state"><span>Não foi possível abrir este espaço.</span><button className="secondary-button" onClick={() => void load()}><RefreshCw size={17} /> Tentar novamente</button></div>}
      {status === 'ready' && stories.length === 0 && <div className="stories-state card"><span className="empty-symbol">✦</span><h2>Nenhum Story disponível</h2><p>Publique uma imagem para começar. Ela ficará disponível por 24 horas.</p></div>}
      {status === 'ready' && stories.length > 0 && (
        <div className="stories-gallery">
          {stories.map((story, index) => (
            <button className={`story-card ${story.viewed ? 'is-viewed' : ''}`} key={story.id} onClick={(event) => openViewer(index, event.currentTarget)} aria-label={`Abrir Story de ${story.isOwn ? 'você' : story.displayName}`}>
              {story.mediaUrl ? <img src={story.mediaUrl} alt="" onError={() => markMediaUnavailable(story.id)} /> : <span className="story-unavailable">Mídia indisponível</span>}
              <span className="story-card-shade" />
              <span className="story-author">
                <span className="avatar avatar-small">{story.avatarUrl ? <img className="avatar-image" src={story.avatarUrl} alt="" /> : story.displayName.slice(0, 2).toUpperCase()}</span>
                <span><strong>{story.isOwn ? 'Seu Story' : story.displayName}</strong><small>@{story.username}</small></span>
              </span>
            </button>
          ))}
        </div>
      )}

      {activeStory && (
        <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`Story de ${activeStory.displayName}`}>
          <div className="story-viewer-panel">
            <div className="story-progress" role="progressbar" aria-label="Progresso do Story" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div>
            <header><span className="avatar avatar-small">{activeStory.avatarUrl ? <img className="avatar-image" src={activeStory.avatarUrl} alt="" /> : activeStory.displayName.slice(0, 2).toUpperCase()}</span><strong>{activeStory.isOwn ? 'Seu Story' : activeStory.displayName}</strong><button ref={closeButtonRef} onClick={closeViewer} aria-label="Fechar visualizador"><X /></button></header>
            <div className="story-media">{activeStory.mediaUrl ? <img src={activeStory.mediaUrl} alt={`Story de ${activeStory.displayName}`} onError={() => markMediaUnavailable(activeStory.id)} /> : <div className="story-media-error"><ImagePlus /><strong>Mídia indisponível</strong><span>Este arquivo não pôde ser carregado.</span></div>}</div>
            {!activeStory.isOwn && <div className="story-moderation"><ModerationActions targetType="story" targetId={activeStory.id} userId={activeStory.ownerId} compact onBlocked={() => { closeViewer(); void load() }} /></div>}
            <button className="story-nav story-nav-left" onClick={previous} disabled={activeIndex === 0} aria-label="Story anterior"><ArrowLeft /></button>
            <button className="story-nav story-nav-right" onClick={next} aria-label={activeIndex === stories.length - 1 ? 'Fechar no último Story' : 'Próximo Story'}><ArrowRight /></button>
          </div>
        </div>
      )}
    </section>
  )
}
