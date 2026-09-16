import { ArrowRight, Heart, MessageCircle, ShieldCheck, Sparkles, Users } from 'lucide-react'
import './landing.css'

interface LandingPageProps {
  onNavigate: (path: string) => void
}

const highlights = [
  {
    icon: MessageCircle,
    label: 'Conversas de verdade',
    title: 'Perto de quem importa.',
    text: 'Mensagens, presença e momentos reunidos em um espaço feito para relações mais próximas.',
    tone: 'violet',
  },
  {
    icon: Users,
    label: 'Comunidades com propósito',
    title: 'Encontre a sua turma.',
    text: 'Descubra grupos em torno de interesses reais e compartilhe experiências com pessoas na mesma sintonia.',
    tone: 'coral',
  },
  {
    icon: ShieldCheck,
    label: 'Você no controle',
    title: 'Social sem perder a calma.',
    text: 'Privacidade, moderação e escolhas claras para você aproveitar cada conexão do seu jeito.',
    tone: 'mint',
  },
]

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#inicio" aria-label="Hi You! — início">
          <span className="landing-brand-mark" aria-hidden="true">H</span>
          <span>Hi You!</span>
        </a>

        <nav className="landing-nav" aria-label="Navegação principal">
          <a href="#experiencia">Experiência</a>
          <a href="#conexoes">Conexões</a>
          <a href="#seguranca">Segurança</a>
        </nav>

        <div className="landing-actions">
          <button className="landing-login" onClick={() => onNavigate('/login')}>Entrar</button>
          <button className="landing-button landing-button-small" onClick={() => onNavigate('/cadastro')}>
            Criar conta <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="inicio">
          <div className="landing-glow landing-glow-one" aria-hidden="true" />
          <div className="landing-glow landing-glow-two" aria-hidden="true" />

          <div className="landing-hero-copy">
            <p className="landing-kicker"><Sparkles size={15} aria-hidden="true" /> Um lugar para estar por perto</p>
            <h1>Conexões que<br />fazem você <em>sentir.</em></h1>
            <p className="landing-lead">O Hi You! aproxima pessoas, histórias e comunidades em uma experiência social mais humana, leve e presente.</p>
            <div className="landing-hero-actions">
              <button className="landing-button" onClick={() => onNavigate('/cadastro')}>
                Começar agora <ArrowRight size={18} aria-hidden="true" />
              </button>
              <a className="landing-text-link" href="#experiencia">Conhecer o Hi You!</a>
            </div>
            <p className="landing-note">Seu espaço. Seu ritmo. Suas conexões.</p>
          </div>

          <div className="landing-visual" aria-label="Prévia visual da experiência Hi You!">
            <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
            <div className="landing-orbit landing-orbit-two" aria-hidden="true" />
            <div className="landing-float landing-float-story" aria-hidden="true">
              <span className="landing-mini-avatar avatar-sun">CA</span>
              <span><strong>Novo momento</strong><small>Clara compartilhou</small></span>
            </div>
            <div className="landing-phone">
              <div className="landing-phone-top"><span className="landing-phone-logo">h!</span><span className="landing-phone-pill" /></div>
              <div className="landing-stories" aria-hidden="true">
                <span className="story-peach">L</span><span className="story-blue">R</span><span className="story-lilac">B</span><span className="story-green">T</span>
              </div>
              <div className="landing-post-preview">
                <div className="landing-post-author"><span className="landing-mini-avatar avatar-ocean">RA</span><span><strong>Rafael Alves</strong><small>um momento atrás</small></span></div>
                <div className="landing-post-art"><span className="landing-art-sun" /><span className="landing-art-hill" /></div>
                <div className="landing-post-reaction"><span><Heart size={14} fill="currentColor" /> 24</span><span><MessageCircle size={14} /> 6</span></div>
              </div>
            </div>
            <div className="landing-float landing-float-people" aria-hidden="true">
              <div className="landing-avatar-stack"><span>BI</span><span>TH</span><span>LU</span></div>
              <span><strong>Gente com a sua vibe</strong><small>descubra novas conexões</small></span>
            </div>
          </div>
        </section>

        <section className="landing-manifesto" id="experiencia">
          <p>MAIS HUMANO. MENOS RUÍDO.</p>
          <h2>Uma rede social que começa<br />com o que realmente importa.</h2>
          <p className="landing-manifesto-copy">Criamos um ambiente para compartilhar espontaneamente, conversar com presença e construir laços que continuam além da tela.</p>
        </section>

        <section className="landing-highlights" id="conexoes" aria-label="Destaques do Hi You!">
          {highlights.map(({ icon: Icon, label, title, text, tone }) => (
            <article className={`landing-highlight landing-highlight-${tone}`} key={title} id={tone === 'mint' ? 'seguranca' : undefined}>
              <div className="landing-highlight-icon"><Icon size={22} aria-hidden="true" /></div>
              <p>{label}</p>
              <h3>{title}</h3>
              <span>{text}</span>
            </article>
          ))}
        </section>

        <section className="landing-invitation">
          <div>
            <p className="landing-kicker"><Sparkles size={15} aria-hidden="true" /> O próximo encontro começa aqui</p>
            <h2>Tem sempre alguém<br />esperando um “Hi”.</h2>
          </div>
          <button className="landing-button landing-button-light" onClick={() => onNavigate('/cadastro')}>
            Fazer parte <ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="#inicio"><span className="landing-brand-mark" aria-hidden="true">H</span><span>Hi You!</span></a>
        <p>Conexões que fazem sentido.</p>
        <div><button onClick={() => onNavigate('/login')}>Entrar</button><button onClick={() => onNavigate('/cadastro')}>Criar conta</button></div>
        <small>© 2026 Hi You!</small>
      </footer>
    </div>
  )
}
