import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Difficulty, Language, Resource, ResourceType } from './domain'
import { addWordToDeck, createState, deleteResource, loadState, progressFor, resetState, saveState, setWordMark, toggleSilentMark, upsertResource } from './store'
import { importFromFile, importFromUrl, paragraphsToResource } from './importer'
import { Reader, Cover } from './features/Reader'
import { LearningFocus } from './features/LearningFocus'
import { SpeakingPage } from './features/SpeakingPage'
import { LifePage } from './features/LifePage'
import { Settings } from './features/Settings'
import { prompts } from './data'

type Page = 'home' | 'reading' | 'speaking' | 'writing' | 'life' | 'settings'

const copy = {
  fr: {
    learn: 'Je veux apprendre', start: 'Commencer', name: 'Ton prénom', nameHint: 'Comment peut-on t’appeler ?',
    welcome: 'Bienvenue', home: 'Accueil', reading: 'Lire', speaking: 'Parler', writing: 'Écrire', life: 'Vivre', settings: 'Paramètres',
    today: 'Aujourd’hui', continue: 'Continuer à lire', library: 'Bibliothèque', add: 'Ajouter une ressource',
    resources: 'Ressources', all: 'Tout', dayCard: 'Ta carte du jour', startActivity: 'Commencer l’activité',
    dailyPrompt: 'Le Mur des Mots', save: 'Enregistrer', publish: 'Publier sur le Mur', published: 'Publié — bienvenue sur le Mur.',
    wordGoal: 'mots utilisés', noPush: 'Sans notifications. À ton rythme.',
    difficulty: { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé', native: 'Natif' },
  },
  en: {
    learn: 'I want to learn', start: 'Get started', name: 'Your first name', nameHint: 'What should we call you?',
    welcome: 'Welcome', home: 'Home', reading: 'Read', speaking: 'Speak', writing: 'Write', life: 'Live', settings: 'Settings',
    today: 'Today', continue: 'Keep reading', library: 'Library', add: 'Add a resource',
    resources: 'Resources', all: 'All', dayCard: 'Your card for today', startActivity: 'Start activity',
    dailyPrompt: 'The Word Wall', save: 'Save', publish: 'Publish to the Wall', published: 'Published — welcome to the Wall.',
    wordGoal: 'words used', noPush: 'No notifications. At your pace.',
    difficulty: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', native: 'Native' },
  },
} as const

type UI = (typeof copy)[keyof typeof copy]
type NavLabel = 'home' | 'reading' | 'speaking' | 'writing' | 'life' | 'settings'

const navItems: { id: Page; icon: string; label: NavLabel }[] = [
  { id: 'home', icon: '⌂', label: 'home' },
  { id: 'reading', icon: '◫', label: 'reading' },
  { id: 'speaking', icon: '◉', label: 'speaking' },
  { id: 'writing', icon: '✎', label: 'writing' },
  { id: 'life', icon: '✦', label: 'life' },
  { id: 'settings', icon: '⚙', label: 'settings' },
]

export default function App() {
  const [state, setState] = useState<AppState | null>(() => loadState())
  const [page, setPage] = useState<Page>('home')
  const [readerId, setReaderId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => { if (state) saveState(state) }, [state])
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.settings.theme }, [state?.settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <Onboarding onComplete={(name, learningLanguage) => setState(createState({ name, learningLanguage }))} />

  const ui = state.settings.learningLanguage === 'en' ? 'fr' : 'en'
  const t = copy[ui]
  const reader = state.resources.find((resource) => resource.id === readerId) ?? null
  const change = (next: AppState) => setState(next)

  const go = (next: Page) => { setReaderId(null); setPage(next) }

  return <main className="app-shell">
    <Sidebar page={page} setPage={go} t={t} theme={state.settings.theme} toggleTheme={() => change({ ...state, settings: { ...state.settings, theme: state.settings.theme === 'light' ? 'dark' : 'light' } })} name={state.settings.name} />
    <section className="page-canvas">
      <header className="mobile-header"><Brand /><button className="avatar">{state.settings.name.slice(0, 1).toUpperCase()}</button></header>
      {reader ? (
        <Reader state={state} resource={reader} ui={ui}
          onBack={() => setReaderId(null)}
          onUpdate={(updated) => change(upsertResource(state, updated))}
          onDelete={(resourceId) => { change(deleteResource(state, resourceId)); setReaderId(null) }}
          onProgress={(resourceId, chapterIndex, paragraphIndex) => change({
            ...state,
            progress: { ...state.progress, [resourceId]: { resourceId, chapterIndex, paragraphIndex, completed: false, updatedAt: new Date().toISOString() } },
          })}
          onAddWord={(args) => { const next = addWordToDeck(state, args); const added = next !== state; if (added) change(next); return true }}
          onOpenFocus={(resource) => setFocusId(resource.id)}
          onPageSize={(size) => change({ ...state, settings: { ...state.settings, readerPageSize: size } })}
          onWordMark={(key, mark) => change(setWordMark(state, key, mark))}
          onSilentMark={(key, letterIndex) => change(toggleSilentMark(state, key, letterIndex))} />
      ) : (
        <>
          {page === 'home' && <Dashboard name={state.settings.name} state={state} onRead={() => go('reading')} onWrite={() => go('writing')} onContinue={(resourceId) => setReaderId(resourceId)} t={t} />}
          {page === 'reading' && <ReadingLibrary state={state} ui={ui} t={t} onOpen={(resource) => setReaderId(resource.id)} onAdd={(resource) => change(upsertResource(state, resource))} />}
          {page === 'speaking' && <SpeakingPage ui={ui} language={state.settings.learningLanguage} api={state.settings.api} />}
          {page === 'writing' && <Writing t={t} />}
          {page === 'life' && <LifePage ui={ui} state={state} onChange={change} />}
          {page === 'settings' && <Settings settings={state.settings}
            onSave={(settings) => change({ ...state, settings })}
            onResetData={() => { resetState(); setState(null); setPage('home') }} />}
        </>
      )}
    </section>
    <nav className="mobile-nav">{navItems.slice(1).map((item) => <button className={page === item.id ? 'active' : ''} onClick={() => go(item.id)} key={item.id}><b>{item.icon}</b><span>{t[item.label]}</span></button>)}</nav>
    {focusId && <LearningFocus resources={state.resources} initialResourceId={focusId} onClose={() => setFocusId(null)} />}
  </main>
}

function Brand() { return <div className="brand"><span className="brand-mark">V</span><span>vivre<br /><em>la langue</em></span></div> }

function Onboarding({ onComplete }: { onComplete: (name: string, language: Language) => void }) {
  const [name, setName] = useState('')
  const [learningLanguage, setLearningLanguage] = useState<Language>('en')
  const ui = copy[learningLanguage === 'en' ? 'fr' : 'en']
  return <main className="onboarding">
    <div className="onboard-grain" />
    <nav className="onboard-top"><Brand /><span>01 / 01</span></nav>
    <div className="onboard-content">
      <p className="eyebrow">{learningLanguage === 'en' ? 'IMMERSION AU QUOTIDIEN' : 'EVERYDAY IMMERSION'}</p>
      <h1>{learningLanguage === 'en' ? <>Apprendre en<br /><i>vivant la langue.</i></> : <>Learn by<br /><i>living the language.</i></>}</h1>
      <p className="onboard-intro">{learningLanguage === 'en' ? 'Des pratiques naturelles, sans pression ni test de niveau.' : 'Natural practice, without pressure or a placement test.'}</p>
      <div className="onboard-form">
        <label>{ui.name}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={ui.nameHint} /></label>
        <fieldset><legend>{ui.learn}</legend><div className="language-options">
          <button className={learningLanguage === 'en' ? 'selected' : ''} onClick={() => setLearningLanguage('en')}><span>🇺🇸</span><strong>English</strong><small>American English</small></button>
          <button className={learningLanguage === 'fr' ? 'selected' : ''} onClick={() => setLearningLanguage('fr')}><span>🇫🇷</span><strong>Français</strong><small>French</small></button>
        </div></fieldset>
        <button className="primary large" disabled={!name.trim()} onClick={() => onComplete(name.trim(), learningLanguage)}>{ui.start}<span>→</span></button>
      </div>
    </div>
    <p className="onboard-note">{learningLanguage === 'en' ? 'Pas de test. On s’adapte à toi, progressivement.' : 'No test. We adapt to you, gradually.'}</p>
  </main>
}

function Sidebar({ page, setPage, t, theme, toggleTheme, name }: { page: Page; setPage: (p: Page) => void; t: UI; theme: string; toggleTheme: () => void; name: string }) {
  return <aside className="sidebar"><Brand /><nav>{navItems.map((item) => <button className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)} key={item.id}><b>{item.icon}</b>{t[item.label]}</button>)}</nav><div className="side-bottom"><button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '◐' : '◑'} <span>{theme === 'light' ? 'Mode sombre' : 'Light mode'}</span></button><div className="profile-mini"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong><small>Everyday learner</small></div><span>⌄</span></div></div></aside>
}

function Dashboard({ name, state, onRead, onWrite, onContinue, t }: { name: string; state: AppState; onRead: () => void; onWrite: () => void; onContinue: (resourceId: string) => void; t: UI }) {
  const current = state.resources[0]
  const progress = current ? progressFor(state, current) : 0
  return <div className="page dashboard">
    <header className="page-header"><div><p className="eyebrow">{t.today.toUpperCase()}</p><h1>{t.welcome}, {name}.</h1><p className="subhead">{t.reading}, {t.speaking}, {t.writing} — one language, lived every day.</p></div><button className="avatar desktop-avatar">{name.slice(0, 1).toUpperCase()}</button></header>
    <section className="daily-card"><div className="daily-art"><span className="sun" /><span className="horizon" /><span className="city city-one" /><span className="city city-two" /></div><div className="daily-copy"><p className="eyebrow">{t.dayCard.toUpperCase()}</p><h2>8 words are waiting<br />to become <i>your</i> words.</h2><p>Write freely with the words that matter to you today. No review screen, no pressure.</p><button className="primary" onClick={onWrite}>{t.startActivity} <span>→</span></button></div><div className="daily-count"><strong>08</strong><span>living<br />words</span></div></section>
    <section className="dashboard-grid">
      {current && <article className="continue-card"><div><p className="eyebrow">{t.continue.toUpperCase()}</p><h3>{current.title}</h3><p>{progress}% complete</p></div><button className="round-arrow" onClick={() => onContinue(current.id)}>→</button><div className="progress"><span style={{ width: `${progress}%` }} /></div></article>}
      <article className="quiet-card"><span>✦</span><div><h3>Keep it natural.</h3><p>{t.noPush}</p></div></article>
    </section>
  </div>
}

const TYPE_LABELS: Record<string, string> = { story: 'Story', article: 'Article', culture: 'Culture', script: 'Script', book: 'Book', news: 'News', scientific: 'Scientific' }

function ReadingLibrary({ state, ui, t, onOpen, onAdd }: { state: AppState; ui: 'fr' | 'en'; t: UI; onOpen: (r: Resource) => void; onAdd: (r: Resource) => void }) {
  const [type, setType] = useState('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const types = useMemo(() => ['all', ...new Set(state.resources.map((resource) => resource.type))], [state.resources])
  const filtered = useMemo(() => state.resources.filter((resource) => (type === 'all' || resource.type === type) && (difficulty === 'all' || resource.difficulty === difficulty)), [state.resources, type, difficulty])
  return <div className="page library-page">
    <header className="page-header"><div><p className="eyebrow">{t.reading.toUpperCase()} · {t.resources.toUpperCase()}</p><h1>{t.library}</h1><p className="subhead">{ui === 'fr' ? 'Chaque texte est un endroit où rester un peu plus longtemps.' : 'Every text is a place to stay a little longer.'}</p></div><button className="outline" onClick={() => setAdding(true)}>＋ {t.add}</button></header>
    <section className="filter-row">
      <div className="segmented">{types.map((item) => <button className={type === item ? 'selected' : ''} onClick={() => setType(item)} key={item}>{item === 'all' ? t.all : (TYPE_LABELS[item] ?? item)}</button>)}</div>
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}><option value="all">{t.all} levels</option>{(['beginner', 'intermediate', 'advanced', 'native'] as Difficulty[]).map((level) => <option value={level} key={level}>{t.difficulty[level]}</option>)}</select>
    </section>
    <section className="resource-grid">
      {filtered.map((resource) => <button className="resource-card" onClick={() => onOpen(resource)} key={resource.id}>
        <Cover cover={resource.cover} coverImage={resource.coverImage} type={TYPE_LABELS[resource.type] ?? resource.type} />
        <div className="resource-meta"><span>{TYPE_LABELS[resource.type] ?? resource.type} · {t.difficulty[resource.difficulty]}</span><h3>{resource.title}</h3><p>{resource.author}</p><div className="card-bottom"><small>{resource.minutes} min</small>{progressFor(state, resource) > 0 && <div className="tiny-progress"><i style={{ width: `${progressFor(state, resource)}%` }} /></div>}</div></div>
      </button>)}
    </section>
    {adding && <AddResource ui={ui} language={state.settings.learningLanguage} close={() => setAdding(false)} onAdd={(resource) => { onAdd(resource); setAdding(false) }} />}
  </div>
}

function AddResource({ ui, language, close, onAdd }: { ui: 'fr' | 'en'; language: Language; close: () => void; onAdd: (r: Resource) => void }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const doImport = async () => {
    if (!url.trim()) return
    setStatus('loading')
    const result = await importFromUrl(url.trim(), language)
    if (result.ok) onAdd(result.resource)
    else { setStatus('failed'); setShowPaste(true) }
  }

  const doFile = async (file: File | undefined) => {
    if (!file) return
    const result = await importFromFile(file, language)
    if (result.ok) onAdd(result.resource)
    else { setStatus('failed'); setShowPaste(true) }
  }

  const doPaste = () => {
    const paragraphs = pasted.split(/\n{2,}|\r?\n(?=\S)/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 1)
    if (!paragraphs.length) return
    onAdd(paragraphsToResource({ title: url.trim() || (ui === 'fr' ? 'Texte collé' : 'Pasted text'), paragraphs, language, type: 'article' as ResourceType }))
  }

  return <div className="modal-backdrop" onMouseDown={close}>
    <div className="add-modal" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={close}>×</button>
      <p className="eyebrow">{ui === 'fr' ? 'BIBLIOTHÈQUE PERSONNELLE' : 'PERSONAL LIBRARY'}</p>
      <h2>{ui === 'fr' ? 'Ajoute un texte que tu veux garder.' : 'Add a text you want to keep.'}</h2>
      <p>{ui === 'fr' ? 'Importe un fichier ou colle un lien. Les paragraphes restent intacts.' : 'Import a file or paste a link. Paragraphs stay intact.'}</p>
      <input ref={fileRef} type="file" accept=".txt,.md,text/plain" hidden onChange={(event) => void doFile(event.target.files?.[0])} />
      <button className="dropzone" onClick={() => fileRef.current?.click()}>↑<strong>{ui === 'fr' ? 'Choisir un fichier' : 'Pick a file'}</strong><small>.txt, .md</small></button>
      <div className="or"><span />{ui === 'fr' ? 'ou colle une URL' : 'or paste a URL'}<span /></div>
      <div className="url-row">
        <input placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void doImport() }} />
        <button className="primary" disabled={status === 'loading' || !url.trim()} onClick={() => void doImport()}>{status === 'loading' ? '…' : '→'}</button>
      </div>
      {status === 'failed' && <p className="import-error">{ui === 'fr' ? 'Impossible de lire cette URL automatiquement. Copie le texte de la page et colle-le ci-dessous.' : 'Could not read this URL automatically. Copy the page text and paste it below.'}</p>}
      {(showPaste || status === 'failed') && <>
        <textarea className="paste-area" rows={5} placeholder={ui === 'fr' ? 'Colle le texte ici…' : 'Paste the text here…'} value={pasted} onChange={(event) => setPasted(event.target.value)} />
        <button className="primary full" disabled={!pasted.trim()} onClick={doPaste}>{ui === 'fr' ? 'Créer la ressource' : 'Create resource'} <span>→</span></button>
      </>}
      {status !== 'failed' && !showPaste && <button className="text-button paste-link" onClick={() => setShowPaste(true)}>{ui === 'fr' ? '… ou colle directement un texte' : '… or paste a text directly'}</button>}
    </div>
  </div>
}

function Writing({ t }: { t: UI }) {
  const [text, setText] = useState(''); const [published, setPublished] = useState(false)
  const used = prompts.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text))
  return <div className="page writing-page"><header className="page-header"><div><p className="eyebrow">{t.writing.toUpperCase()} · {t.today.toUpperCase()}</p><h1>{t.dailyPrompt}</h1><p className="subhead">Write a small world with at least five of today’s living words.</p></div><span className="quiet-badge">8 words · no pressure</span></header><section className="word-bricks">{prompts.map((word, index) => <span className={used.includes(word) ? 'used' : ''} key={word}><b>{String(index + 1).padStart(2, '0')}</b>{word}</span>)}</section><section className="writing-workspace"><div className="editor"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Start wherever you are…" /><footer><span>{text.trim() ? text.trim().split(/\s+/).length : 0} words</span><strong>{used.length}/5 {t.wordGoal}</strong></footer></div><aside className="writing-aside"><span className="eyebrow">A GENTLE NUDGE</span><h3>There’s no perfect first line.</h3><p>Let the words meet a memory, an opinion, or a little piece of today.</p><button className="outline full">{t.save}</button><button className="primary full" disabled={used.length < 5} onClick={() => setPublished(true)}>{t.publish} <span>→</span></button>{published && <div className="published-note">✓ {t.published}</div>}</aside></section>{published && <section className="wall-preview"><p className="eyebrow">THE WALL · TODAY</p><h2>“A small beginning.”</h2><p>{text || 'Your words have joined today’s wall.'}</p><button>♡ Co-sign <span>12</span></button></section>}</div>
}
