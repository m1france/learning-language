import { useMemo, useState } from 'react'
import type { AppState, Difficulty, Language } from '../../domain'
import {
  Bookmark,
  Check,
  ExternalLink,
  FlaskConical,
  Heart,
  Lightbulb,
  Music2,
  Play,
  Search,
  Video,
} from 'lucide-react'
import { listeningItems, type ListeningItem, type ListeningPlatform, type ListeningTopic } from './libraryData'

type Ui = 'fr' | 'en'
type LibraryView = 'all' | 'saved' | 'completed'

const copy = {
  fr: {
    eyebrow: 'ÉCOUTER · BIBLIOTHÈQUE VIVANTE',
    title: 'Fais entrer la langue dans tes oreilles.',
    subtitleStart: 'Des vidéos et des voix choisies pour faire entrer ', subtitleEnd: ' dans ton quotidien, à ton rythme.',
    target: 'Langue cible',
    sources: 'sources choisies',
    minutes: 'formats courts à longs',
    all: 'Tout explorer', saved: 'Mes favoris', completed: 'Terminés',
    search: 'Rechercher un thème, une source…', allTopics: 'Tous les thèmes', allLevels: 'Tous niveaux',
    items: 'contenus à écouter', recommended: 'À lancer maintenant',
    youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
    science: 'Ressources scientifiques', advice: 'Conseils pour apprendre',
    secondaryTitle: 'Pour aller plus loin', secondarySub: 'Des voix plus lentes, plus précises, ou des méthodes pour faire durer l’écoute.',
    save: 'Ajouter aux favoris', unsave: 'Retirer des favoris', markDone: 'Marquer comme terminé', undoDone: 'À revoir', open: 'Ouvrir la source',
    empty: 'Aucun contenu ne correspond à ces filtres.', reset: 'Réinitialiser les filtres',
    result: 'contenu disponible', results: 'contenus disponibles',
    beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé', native: 'Natif',
    daily: 'Quotidien', culture: 'Culture', news: 'Actualité', scienceTopic: 'Science', stories: 'Récits', methods: 'Méthode',
    completedLabel: 'Terminé',
  },
  en: {
    eyebrow: 'LISTEN · LIVING LIBRARY',
    title: 'Let the language reach your ears.',
    subtitleStart: 'Videos and voices chosen to bring ', subtitleEnd: ' into your day, at your own pace.',
    target: 'Target language',
    sources: 'selected sources',
    minutes: 'short-to-long formats',
    all: 'Explore all', saved: 'My saved items', completed: 'Completed',
    search: 'Search a topic or source…', allTopics: 'All topics', allLevels: 'All levels',
    items: 'items to listen to', recommended: 'Start here',
    youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
    science: 'Scientific resources', advice: 'Learning advice',
    secondaryTitle: 'Go a little further', secondarySub: 'Slower, more precise voices and methods that help listening become a habit.',
    save: 'Save item', unsave: 'Remove from saved', markDone: 'Mark as complete', undoDone: 'Listen again', open: 'Open source',
    empty: 'No content matches these filters.', reset: 'Reset filters',
    result: 'item available', results: 'items available',
    beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', native: 'Native',
    daily: 'Everyday life', culture: 'Culture', news: 'News', scienceTopic: 'Science', stories: 'Stories', methods: 'Method',
    completedLabel: 'Completed',
  },
} as const

const platformLabels: Record<ListeningPlatform, keyof typeof copy.fr> = {
  youtube: 'youtube',
  tiktok: 'tiktok',
  instagram: 'instagram',
  science: 'science',
  advice: 'advice',
}

const topicLabels: Record<ListeningTopic, keyof Pick<typeof copy.fr, 'daily' | 'culture' | 'news' | 'scienceTopic' | 'stories' | 'methods'>> = {
  daily: 'daily',
  culture: 'culture',
  news: 'news',
  science: 'scienceTopic',
  stories: 'stories',
  methods: 'methods',
}

function languageName(language: Language, ui: Ui) {
  if (language === 'fr') return ui === 'fr' ? 'Français' : 'French'
  return 'English'
}

function PlatformMark({ platform }: { platform: ListeningPlatform }) {
  if (platform === 'youtube') return <Video size={18} aria-hidden="true" />
  if (platform === 'tiktok') return <Music2 size={18} aria-hidden="true" />
  if (platform === 'instagram') return <span className="listen-instagram-mark" aria-hidden="true">◎</span>
  if (platform === 'science') return <FlaskConical size={18} aria-hidden="true" />
  return <Lightbulb size={18} aria-hidden="true" />
}

function ItemCard({
  item,
  ui,
  saved,
  completed,
  onSave,
  onComplete,
}: {
  item: ListeningItem
  ui: Ui
  saved: boolean
  completed: boolean
  onSave: (id: string) => void
  onComplete: (id: string) => void
}) {
  const t = copy[ui]
  const label = t[platformLabels[item.platform]]
  const level = t[item.level]
  const topic = t[topicLabels[item.topic]]

  return <article className={`listen-card listen-card--${item.platform} ${completed ? 'is-completed' : ''}`}>
    <div className="listen-card-top">
      <span className={`listen-platform-mark listen-platform-mark--${item.platform}`}><PlatformMark platform={item.platform} /></span>
      <div className="listen-card-badges">
        <span>{label}</span>
        {completed && <span className="listen-completed-badge"><Check size={10} /> {t.completedLabel}</span>}
      </div>
      <button
        className={`listen-save ${saved ? 'is-saved' : ''}`}
        type="button"
        onClick={() => onSave(item.id)}
        aria-label={saved ? t.unsave : t.save}
        title={saved ? t.unsave : t.save}
      >
        {saved ? <Heart size={16} fill="currentColor" /> : <Heart size={16} />}
      </button>
    </div>
    <div className="listen-card-body">
      <p className="listen-card-creator">{item.creator}</p>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </div>
    <div className="listen-card-meta">
      <span>{level}</span><i /> <span>{topic}</span><i /> <span>{item.duration}</span>
    </div>
    {item.accent && <span className="listen-accent">{item.accent}</span>}
    <div className="listen-card-actions">
      <button className={`listen-complete ${completed ? 'is-completed' : ''}`} type="button" onClick={() => onComplete(item.id)}>
        <Check size={14} /> {completed ? t.undoDone : t.markDone}
      </button>
      <a href={item.url} target="_blank" rel="noreferrer" onClick={() => !completed && onComplete(item.id)}>
        <Play size={13} fill="currentColor" /> {t.open} <ExternalLink size={12} />
      </a>
    </div>
  </article>
}

function ContentSection({
  platform,
  title,
  items,
  ui,
  savedIds,
  completedIds,
  onSave,
  onComplete,
}: {
  platform: ListeningPlatform
  title: string
  items: ListeningItem[]
  ui: Ui
  savedIds: string[]
  completedIds: string[]
  onSave: (id: string) => void
  onComplete: (id: string) => void
}) {
  if (!items.length) return null
  return <section className={`listen-section listen-section--${platform}`}>
    <div className="listen-section-heading">
      <div><span className={`listen-platform-mark listen-platform-mark--${platform}`}><PlatformMark platform={platform} /></span><h2>{title}</h2></div>
      <span>{items.length} {items.length > 1 ? copy[ui].results : copy[ui].result}</span>
    </div>
    <div className="listen-grid">
      {items.map((item) => <ItemCard key={item.id} item={item} ui={ui} saved={savedIds.includes(item.id)} completed={completedIds.includes(item.id)} onSave={onSave} onComplete={onComplete} />)}
    </div>
  </section>
}

export function ListeningPage({ ui, state, onChange }: { ui: Ui; state: AppState; onChange: (state: AppState) => void }) {
  const t = copy[ui]
  const [view, setView] = useState<LibraryView>('all')
  const [topic, setTopic] = useState<ListeningTopic | 'all'>('all')
  const [level, setLevel] = useState<Difficulty | 'all'>('all')
  const [query, setQuery] = useState('')
  const savedIds = state.listening?.savedIds ?? []
  const completedIds = state.listening?.completedIds ?? []

  const targetItems = useMemo(
    () => listeningItems.filter((item) => item.language === state.settings.learningLanguage),
    [state.settings.learningLanguage],
  )
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return targetItems.filter((item) => {
      const fitsView = view === 'all' || (view === 'saved' ? savedIds.includes(item.id) : completedIds.includes(item.id))
      const fitsTopic = topic === 'all' || item.topic === topic
      const fitsLevel = level === 'all' || item.level === level
      const haystack = `${item.title} ${item.creator} ${item.description} ${item.accent ?? ''}`.toLocaleLowerCase()
      return fitsView && fitsTopic && fitsLevel && (!normalizedQuery || haystack.includes(normalizedQuery))
    })
  }, [completedIds, level, query, savedIds, targetItems, topic, view])

  const toggleSaved = (id: string) => {
    const next = savedIds.includes(id) ? savedIds.filter((itemId) => itemId !== id) : [...savedIds, id]
    onChange({ ...state, listening: { ...state.listening, savedIds: next } })
  }

  const toggleCompleted = (id: string) => {
    const next = completedIds.includes(id) ? completedIds.filter((itemId) => itemId !== id) : [...completedIds, id]
    onChange({ ...state, listening: { ...state.listening, completedIds: next } })
  }

  const resetFilters = () => {
    setView('all')
    setTopic('all')
    setLevel('all')
    setQuery('')
  }

  const sourceCount = new Set(targetItems.map((item) => item.creator)).size
  const videoItems = (platform: ListeningPlatform) => filteredItems.filter((item) => item.platform === platform)
  const secondaryItems = filteredItems.filter((item) => item.platform === 'science' || item.platform === 'advice')

  return <div className="page listening-page">
    <header className="listen-hero">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.subtitleStart}{languageName(state.settings.learningLanguage, ui)}{t.subtitleEnd}</p>
      </div>
      <div className="listen-target-card">
        <span><Music2 size={17} /></span>
        <div><small>{t.target}</small><strong>{languageName(state.settings.learningLanguage, ui)}</strong></div>
      </div>
    </header>

    <section className="listen-overview" aria-label="Aperçu de la bibliothèque">
      <div><strong>{targetItems.length}</strong><span>{t.items}</span></div>
      <div><strong>{sourceCount}</strong><span>{t.sources}</span></div>
      <div><strong>{completedIds.filter((id) => targetItems.some((item) => item.id === id)).length}</strong><span>{t.completed}</span></div>
      <div><strong>1–60</strong><span>{t.minutes}</span></div>
    </section>

    <section className="listen-toolbar" aria-label="Filtres de la bibliothèque">
      <div className="listen-view-tabs">
        {(['all', 'saved', 'completed'] as LibraryView[]).map((item) => <button key={item} type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)}>
          {item === 'saved' && <Bookmark size={13} />} {t[item]}
        </button>)}
      </div>
      <div className="listen-filters">
        <label className="listen-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>
        <select value={topic} onChange={(event) => setTopic(event.target.value as ListeningTopic | 'all')} aria-label={t.allTopics}>
          <option value="all">{t.allTopics}</option>
          {(Object.keys(topicLabels) as ListeningTopic[]).map((item) => <option key={item} value={item}>{t[topicLabels[item]]}</option>)}
        </select>
        <select value={level} onChange={(event) => setLevel(event.target.value as Difficulty | 'all')} aria-label={t.allLevels}>
          <option value="all">{t.allLevels}</option>
          {(['beginner', 'intermediate', 'advanced', 'native'] as Difficulty[]).map((item) => <option key={item} value={item}>{t[item]}</option>)}
        </select>
      </div>
    </section>

    {filteredItems.length === 0 ? <section className="listen-empty"><Search size={22} /><h2>{t.empty}</h2><button type="button" className="outline" onClick={resetFilters}>{t.reset}</button></section> : <>
      <ContentSection platform="youtube" title={t.youtube} items={videoItems('youtube')} ui={ui} savedIds={savedIds} completedIds={completedIds} onSave={toggleSaved} onComplete={toggleCompleted} />
      <ContentSection platform="tiktok" title={t.tiktok} items={videoItems('tiktok')} ui={ui} savedIds={savedIds} completedIds={completedIds} onSave={toggleSaved} onComplete={toggleCompleted} />
      <ContentSection platform="instagram" title={t.instagram} items={videoItems('instagram')} ui={ui} savedIds={savedIds} completedIds={completedIds} onSave={toggleSaved} onComplete={toggleCompleted} />
      {secondaryItems.length > 0 && <section className="listen-secondary">
        <div className="listen-secondary-heading"><p className="eyebrow">{t.recommended.toUpperCase()}</p><h2>{t.secondaryTitle}</h2><p>{t.secondarySub}</p></div>
        <ContentSection platform="science" title={t.science} items={secondaryItems.filter((item) => item.platform === 'science')} ui={ui} savedIds={savedIds} completedIds={completedIds} onSave={toggleSaved} onComplete={toggleCompleted} />
        <ContentSection platform="advice" title={t.advice} items={secondaryItems.filter((item) => item.platform === 'advice')} ui={ui} savedIds={savedIds} completedIds={completedIds} onSave={toggleSaved} onComplete={toggleCompleted} />
      </section>}
    </>}
  </div>
}
