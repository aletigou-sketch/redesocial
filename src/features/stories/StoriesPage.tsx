import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { fetchStories, publishStory, registerStoryView, StoryServiceError, type Story } from './storyService'

const VIEW_DURATION_MS = 6000

export function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      setStories(await fetchStories())
      setStatus('ready')
    } catch (cause) {
      setError(cause instanceof StoryServiceError ? cause.message : 'Não foi possível carregar os Stories.')
      setStatus('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const closeViewer = useCallback(() => setActiveIndex(null), [])
  const next = useCallback(() => {
    setActiveIndex((current) => current === null || current >= stories.length - 1 ? null : current + 1)
  }, [stories.length])
  const previous = useCallback(() => {
    setActiveIndex((current) => current === null ? null : Math.max(0, current - 1))
  }, [])

  useEffect(() => {
    if (activeIndex === null) return
    const story = stories[activeIndex]
    if (!story) return
    setProgress(0)
    void registerStoryView(story.id).then(() => {
      setStories((current) => current.map((item) => item.id === story.id ? { ...item, viewed: true } : item))
    }).catch(() => undefined)
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      const value = Math.min(100, ((performance.now() - startedAt) / VIEW_DURATION_MS) * 100)
      setProgress(value)
      if (value >= 100) next()
    }, 100)
    return () => window.clearInterval(timer)
  }, [activeIndex, next, stories])

  useEffect(() => {
    if (activeIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewer()
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') previous()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, closeViewer, next, previous])

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

  const activeStory = activeIndex === null ? null : stories[activeIndex]

  return (
    <section className="stories-page">
      <header className="stories-header">
        <div><p className="eyebrow">MOMENTOS QUE DURAM 24 HORAS</p><h1>Stories</h1><p>Compartilhe uma imagem com pessoas que podem descobrir seu perfil.</p></div>
        <button className="primary-button" onClick={() => inputRef.current?.click()} disabled={isPublishing}>
          {isPublishing ? <LoaderCircle className="spin" size={18} /> : <ImagePlus size={18} />}
          {isPublishing ? 'Publicando…' : 'Criar Story'}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
      </header>

      {error && <div className="stories-alert" role="alert">{error}</div>}

      {status === 'loading' && <div className="stories-state" aria-live="polite"><LoaderCircle className="spin" /><strong>Carregando Stories…</strong></div>}
      {status === 'error' && <div className="stories-state"><span>Não foi possível abrir este espaço.</span><button className="secondary-button" onClick={() => void load()}><RefreshCw size={17} /> Tentar novamente</button></div>}
      {status === 'ready' && stories.length === 0 && <div className="stories-state card"><span className="empty-symbol">✦</span><h2>Nenhum Story disponível</h2><p>Publique uma imagem para começar. Ela ficará disponível por 24 horas.</p></div>}
      {status === 'ready' && stories.length > 0 && (
        <div className="stories-gallery">
          {stories.map((story, index) => (
            <button className={`story-card ${story.viewed ? 'is-viewed' : ''}`} key={story.id} onClick={() => setActiveIndex(index)}>
              {story.mediaUrl ? <img src={story.mediaUrl} alt="" /> : <span className="story-unavailable">Mídia indisponível</span>}
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
            <div className="story-progress" aria-label="Progresso do Story"><span style={{ width: `${progress}%` }} /></div>
            <header><span className="avatar avatar-small">{activeStory.avatarUrl ? <img className="avatar-image" src={activeStory.avatarUrl} alt="" /> : activeStory.displayName.slice(0, 2).toUpperCase()}</span><strong>{activeStory.isOwn ? 'Seu Story' : activeStory.displayName}</strong><button onClick={closeViewer} aria-label="Fechar visualizador"><X /></button></header>
            <div className="story-media">{activeStory.mediaUrl ? <img src={activeStory.mediaUrl} alt={`Story de ${activeStory.displayName}`} /> : <div className="story-media-error"><ImagePlus /><strong>Mídia indisponível</strong><span>Este arquivo não pôde ser carregado.</span></div>}</div>
            <button className="story-nav story-nav-left" onClick={previous} disabled={activeIndex === 0} aria-label="Story anterior"><ArrowLeft /></button>
            <button className="story-nav story-nav-right" onClick={next} aria-label={activeIndex === stories.length - 1 ? 'Fechar no último Story' : 'Próximo Story'}><ArrowRight /></button>
          </div>
        </div>
      )}
    </section>
  )
}
