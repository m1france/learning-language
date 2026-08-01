import { useEffect, useMemo, useState } from 'react'
import { prompts, resources, scenarios, silentLetters, tools, type Difficulty, type Language, type Resource } from './data'

type Page = 'home' | 'reading' | 'speaking' | 'writing' | 'life'
type Profile = { name: string; learningLanguage: Language }

const copy = {
  fr: {
    learn: 'Je veux apprendre', start: 'Commencer', name: 'Ton prénom', nameHint: 'Comment peut-on t’appeler ?',
    welcome: 'Bienvenue', home: 'Accueil', reading: 'Lire', speaking: 'Parler', writing: 'Écrire', life: 'Vivre',
    today: 'Aujourd’hui', continue: 'Continuer à lire', library: 'Bibliothèque', add: 'Ajouter une ressource',
    resources: 'Ressources', mine: 'Mes ressources', all: 'Tout', reader: 'Lecteur', back: 'Retour à la bibliothèque',
    deck: 'Ajouter au deck', added: 'Ajouté à ton parcours', definition: 'Dans ce contexte', close: 'Fermer',
    dayCard: 'Ta carte du jour', streak: 'jours de suite', startActivity: 'Commencer l’activité',
    dailyPrompt: 'Le Mur des Mots', save: 'Enregistrer', publish: 'Publier sur le Mur', published: 'Publié — bienvenue sur le Mur.',
    wordGoal: 'mots utilisés', studio: 'Studio vocal', record: 'Activer la caméra', cameraNote: 'La caméra ne s’allume qu’après ton accord.',
    culture: 'Le contexte natif', bestTools: 'Les meilleurs outils', noPush: 'Sans notifications. À ton rythme.',
    difficulty: { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé', native: 'Natif' },
  },
  en: {
    learn: 'I want to learn', start: 'Get started', name: 'Your first name', nameHint: 'What should we call you?',
    welcome: 'Welcome', home: 'Home', reading: 'Read', speaking: 'Speak', writing: 'Write', life: 'Live',
    today: 'Today', continue: 'Keep reading', library: 'Library', add: 'Add a resource', resources: 'Resources', mine: 'My resources', all: 'All', reader: 'Reader', back: 'Back to library',
    deck: 'Add to my deck', added: 'Added to your path', definition: 'In this context', close: 'Close',
    dayCard: 'Your card for today', streak: 'day streak', startActivity: 'Start activity',
    dailyPrompt: 'The Word Wall', save: 'Save', publish: 'Publish to the Wall', published: 'Published — welcome to the Wall.',
    wordGoal: 'words used', studio: 'Voice studio', record: 'Turn on camera', cameraNote: 'Your camera starts only after you agree.',
    culture: 'Native context', bestTools: 'Best tools', noPush: 'No notifications. At your pace.',
    difficulty: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', native: 'Native' },
  },
} as const

type UI = (typeof copy)[keyof typeof copy]
type NavLabel = Exclude<keyof typeof copy.fr, 'difficulty'>

const navItems: { id: Page; icon: string; label: NavLabel }[] = [
  { id: 'home', icon: '⌂', label: 'home' },
  { id: 'reading', icon: '◫', label: 'reading' },
  { id: 'speaking', icon: '◉', label: 'speaking' },
  { id: 'writing', icon: '✎', label: 'writing' },
  { id: 'life', icon: '✦', label: 'life' },
]

function App() {
  const [profile, setProfile] = useState<Profile | null>(() => {
    try { return JSON.parse(localStorage.getItem('vivre-profile') || 'null') } catch { return null }
  })
  const [page, setPage] = useState<Page>('home')
  const [reader, setReader] = useState<Resource | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { if (profile) localStorage.setItem('vivre-profile', JSON.stringify(profile)) }, [profile])

  if (!profile) return <Onboarding onComplete={setProfile} />
  const locale = profile.learningLanguage === 'en' ? 'fr' : 'en'
  const t = copy[locale]

  return (
    <main className="app-shell">
      <Sidebar page={page} setPage={(next) => { setReader(null); setPage(next) }} t={t} theme={theme} toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
      <section className="page-canvas">
        <header className="mobile-header"><Brand /><button className="avatar">{profile.name.slice(0, 1).toUpperCase()}</button></header>
        {reader ? <Reader resource={reader} onBack={() => setReader(null)} t={t} /> : (
          <>
            {page === 'home' && <Dashboard name={profile.name} onRead={() => setPage('reading')} onWrite={() => setPage('writing')} t={t} />}
            {page === 'reading' && <ReadingLibrary onOpen={setReader} t={t} />}
            {page === 'speaking' && <Speaking t={t} />}
            {page === 'writing' && <Writing t={t} />}
            {page === 'life' && <Life t={t} />}
          </>
        )}
      </section>
      <nav className="mobile-nav">{navItems.slice(1).map((item) => <button className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setReader(null) }} key={item.id}><b>{item.icon}</b><span>{t[item.label]}</span></button>)}</nav>
    </main>
  )
}

function Brand() { return <div className="brand"><span className="brand-mark">V</span><span>vivre<br /><em>la langue</em></span></div> }

function Onboarding({ onComplete }: { onComplete: (profile: Profile) => void }) {
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
        <button className="primary large" disabled={!name.trim()} onClick={() => onComplete({ name: name.trim(), learningLanguage })}>{ui.start}<span>→</span></button>
      </div>
    </div>
    <p className="onboard-note">{learningLanguage === 'en' ? 'Pas de test. On s’adapte à toi, progressivement.' : 'No test. We adapt to you, gradually.'}</p>
  </main>
}

function Sidebar({ page, setPage, t, theme, toggleTheme }: { page: Page; setPage: (p: Page) => void; t: UI; theme: string; toggleTheme: () => void }) {
  return <aside className="sidebar"><Brand /><nav>{navItems.map((item) => <button className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)} key={item.id}><b>{item.icon}</b>{t[item.label]}</button>)}</nav><div className="side-bottom"><button className="theme-toggle" onClick={toggleTheme}>{theme === 'light' ? '◐' : '◑'} <span>{theme === 'light' ? 'Mode sombre' : 'Light mode'}</span></button><div className="profile-mini"><span className="avatar">M</span><div><strong>Mathis</strong><small>Everyday learner</small></div><span>⌄</span></div></div></aside>
}

function Dashboard({ name, onRead, onWrite, t }: { name: string; onRead: () => void; onWrite: () => void; t: UI }) {
  return <div className="page dashboard">
    <header className="page-header"><div><p className="eyebrow">{t.today.toUpperCase()} · SATURDAY</p><h1>{t.welcome}, {name}.</h1><p className="subhead">{t.reading}, {t.speaking}, {t.writing} — one language, lived every day.</p></div><button className="avatar desktop-avatar">{name.slice(0, 1).toUpperCase()}</button></header>
    <section className="streaks"><Streak icon="◫" label={t.reading} count={4} color="coral" /><Streak icon="◉" label={t.speaking} count={2} color="blue" /><Streak icon="✎" label={t.writing} count={6} color="gold" /><Streak icon="✦" label={t.life} count={3} color="green" /></section>
    <section className="daily-card"><div className="daily-art"><span className="sun" /><span className="horizon" /><span className="city city-one" /><span className="city city-two" /></div><div className="daily-copy"><p className="eyebrow">{t.dayCard.toUpperCase()}</p><h2>8 words are waiting<br />to become <i>your</i> words.</h2><p>Write freely with the words that matter to you today. No review screen, no pressure.</p><button className="primary" onClick={onWrite}>{t.startActivity} <span>→</span></button></div><div className="daily-count"><strong>08</strong><span>living<br />words</span></div></section>
    <section className="dashboard-grid"><article className="continue-card"><div><p className="eyebrow">{t.continue.toUpperCase()}</p><h3>Saturday on<br />8th Avenue</h3><p>42% complete · 4 min left</p></div><button className="round-arrow" onClick={onRead}>→</button><div className="progress"><span /></div></article><article className="quiet-card"><span>✦</span><div><h3>Keep it natural.</h3><p>{t.noPush}</p></div></article></section>
  </div>
}

function Streak({ icon, label, count, color }: { icon: string; label: string; count: number; color: string }) { return <article className={`streak ${color}`}><span className="skill-icon">{icon}</span><div><strong>{count}</strong><p>{label}</p></div><div className="streak-bars">{[0,1,2,3,4,5,6].map((day) => <i className={day < count + 1 ? 'on' : ''} key={day} />)}</div></article> }

function ReadingLibrary({ onOpen, t }: { onOpen: (r: Resource) => void; t: UI }) {
  const [type, setType] = useState('All')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const filtered = useMemo(() => resources.filter((resource) => (type === 'All' || resource.type === type) && (difficulty === 'all' || resource.difficulty === difficulty)), [type, difficulty])
  return <div className="page library-page"><header className="page-header"><div><p className="eyebrow">{t.reading.toUpperCase()} · {t.resources.toUpperCase()}</p><h1>{t.library}</h1><p className="subhead">Every text is a place to stay a little longer.</p></div><button className="outline" onClick={() => setAdding(true)}>＋ {t.add}</button></header>
    <section className="filter-row"><div className="segmented">{['All','Story','Article','Culture','Script'].map((item) => <button className={type === item ? 'selected' : ''} onClick={() => setType(item)} key={item}>{item === 'All' ? t.all : item}</button>)}</div><select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}><option value="all">{t.all} levels</option>{(['beginner','intermediate','advanced','native'] as Difficulty[]).map((level) => <option value={level} key={level}>{t.difficulty[level]}</option>)}</select></section>
    <section className="resource-grid">{filtered.map((resource) => <button className="resource-card" onClick={() => onOpen(resource)} key={resource.id}><Cover cover={resource.cover} type={resource.type} /><div className="resource-meta"><span>{resource.type} · {t.difficulty[resource.difficulty]}</span><h3>{resource.title}</h3><p>{resource.author}</p><div className="card-bottom"><small>{resource.minutes} min</small>{resource.progress > 0 && <div className="tiny-progress"><i style={{ width: `${resource.progress}%` }} /></div>}</div></div></button>)}</section>
    {adding && <AddResource close={() => setAdding(false)} t={t} />}
  </div>
}

function Cover({ cover, type }: { cover: Resource['cover']; type: string }) { return <div className={`cover ${cover}`}><span className="cover-type">{type}</span><div className="cover-shape one" /><div className="cover-shape two" /><div className="cover-line" /></div> }

function AddResource({ close, t }: { close: () => void; t: UI }) { return <div className="modal-backdrop" onMouseDown={close}><div className="add-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}>×</button><p className="eyebrow">PERSONAL LIBRARY</p><h2>Add a text you want to keep.</h2><p>Import a file or paste a link. Its paragraphs stay intact.</p><div className="dropzone">↑<strong>Drop a file here</strong><small>.txt, .epub, .docx or .pdf</small></div><div className="or"><span />or paste a URL<span /></div><input placeholder="https://" /><button className="primary full" onClick={close}>{t.add} <span>→</span></button></div></div> }

function Reader({ resource, onBack, t }: { resource: Resource; onBack: () => void; t: UI }) {
  const [selected, setSelected] = useState<{ word: string; sentence: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [showGrammar, setShowGrammar] = useState(true)
  const [fontSize, setFontSize] = useState(19)
  const word = selected?.word.toLowerCase().replace(/[^a-zà-ÿ'-]/gi, '') || ''
  return <div className="reader-page" onClick={() => setSelected(null)}><header className="reader-top"><button className="text-button" onClick={(event) => { event.stopPropagation(); onBack() }}>← {t.back}</button><div className="reader-controls"><button className={showGrammar ? 'control active' : 'control'} onClick={(event) => { event.stopPropagation(); setShowGrammar(!showGrammar) }}>Grammar</button><button className="control" onClick={(event) => { event.stopPropagation(); setFontSize(Math.min(24, fontSize + 1)) }}>A+</button><button className="control" onClick={(event) => { event.stopPropagation(); setFontSize(Math.max(16, fontSize - 1)) }}>A−</button></div></header><section className="reader-layout"><aside className="reader-aside"><Cover cover={resource.cover} type={resource.type} /><div><span className="tag">{resource.type}</span><h2>{resource.title}</h2><p>{resource.author}</p></div><div className="reader-progress"><div><span>Reading progress</span><strong>42%</strong></div><i><b /></i></div><button className="save-link">♡ Save for later</button></aside><article className="reading-text"><p className="eyebrow">CHAPTER 01</p><h1>{resource.title}</h1><div className="story-rule" />{resource.content.map((paragraph, index) => <p className="paragraph" style={{ fontSize }} key={paragraph}>{paragraph.split(/(\s+)/).map((part, pIndex) => /\s+/.test(part) ? part : <Word key={`${part}-${pIndex}`} raw={part} sentence={paragraph} grammar={showGrammar} onClick={setSelected} />)}{index === 0 && <button className="rhythm" onClick={(event) => event.stopPropagation()}>⌁ Rhythm</button>}</p>)}</article><aside className="reader-right"><span className="eyebrow">A QUIET TOOL</span><p>Click a word to understand it, then let it come back naturally.</p><div className="legend"><i className="verb" /> action / verb<i className="clause" /> connected thought</div></aside></section>{selected && <WordCard word={word} original={selected.word} sentence={selected.sentence} saved={saved} onSave={() => setSaved(true)} t={t} close={() => setSelected(null)} />}</div>
}

function Word({ raw, sentence, grammar, onClick }: { raw: string; sentence: string; grammar: boolean; onClick: (selection: { word: string; sentence: string }) => void }) {
  const clean = raw.toLowerCase().replace(/[^a-zà-ÿ'-]/gi, '')
  const isGrammar = grammar && ['walked', 'was', 'would', 'made'].includes(clean)
  const silent = silentLetters[clean]
  return <button className={`word ${isGrammar ? 'grammar-mark' : ''}`} onClick={(event) => { event.stopPropagation(); onClick({ word: raw, sentence }) }}>{[...raw].map((letter, index) => <span className={silent?.includes(letter.toLowerCase()) ? 'silent' : ''} key={index}>{letter}</span>)}</button>
}

function WordCard({ word, original, sentence, saved, onSave, t, close }: { word: string; original: string; sentence: string; saved: boolean; onSave: () => void; t: UI; close: () => void }) {
  const definitions: Record<string, string> = { neighborhood: 'the area near where someone lives', glow: 'to shine with a soft, steady light', usual: 'happening in the normal way', corner: 'the place where two streets meet', awake: 'not sleeping', small: 'little in size' }
  return <aside className="word-card" onClick={(event) => event.stopPropagation()}><button className="card-x" onClick={close}>×</button><div className="word-heading"><h2>{original.replace(/[.,!?]/g, '')}</h2><span>/ {word || 'word'} /</span></div><p className="word-type">noun · American English</p><div className="definition"><span>{t.definition}</span><p>{definitions[word] || 'a useful word in this moment of the story'}</p></div><blockquote>“{sentence}”</blockquote><div className="tag-row"><button># city</button><button># everyday</button><button>＋</button></div><button className={saved ? 'saved-deck' : 'primary full'} onClick={onSave}>{saved ? `✓ ${t.added}` : `＋ ${t.deck}`}</button><p className="card-foot">This word will return in a future activity, naturally.</p></aside>
}

function Speaking({ t }: { t: UI }) { const [camera, setCamera] = useState(false); const [recording, setRecording] = useState(false); return <div className="page speaking-page"><header className="page-header"><div><p className="eyebrow">{t.speaking.toUpperCase()}</p><h1>{t.studio}</h1><p className="subhead">Listen. Repeat. Find your own rhythm.</p></div><span className="session-count">12 sessions</span></header><section className={`studio ${camera ? 'camera-on' : ''}`}><div className="studio-copy">{camera ? <><p className="eyebrow">READY WHEN YOU ARE</p><h2>{recording ? '00:12' : 'Saturday on 8th Avenue'}</h2><p>{recording ? 'Recording your voice and rhythm.' : 'Your text will appear here as a calm, clear prompter.'}</p></> : <><span className="camera-icon">◉</span><h2>Your voice has a place here.</h2><p>{t.cameraNote}</p><button className="primary" onClick={() => setCamera(true)}>{t.record} <span>→</span></button></>}</div>{camera && <><div className="camera-window"><span>front camera</span><div className="face-shape" /></div><div className="prompter">On Saturday morning, Maya left her apartment before the city was fully awake.</div><button className={recording ? 'record-btn recording' : 'record-btn'} onClick={() => setRecording(!recording)}>{recording ? '■ Stop' : '● Record'}</button></>}</section><section className="session-strip"><p className="eyebrow">YOUR LIBRARY</p><h2>Small recordings. Visible progress.</h2><div><article><span>01</span><strong>Morning routine</strong><small>2 days ago · 01:42</small></article><article><span>02</span><strong>Corner store dialogue</strong><small>Last week · 02:08</small></article></div></section></div> }

function Writing({ t }: { t: UI }) { const [text, setText] = useState(''); const [published, setPublished] = useState(false); const used = prompts.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text)); return <div className="page writing-page"><header className="page-header"><div><p className="eyebrow">{t.writing.toUpperCase()} · {t.today.toUpperCase()}</p><h1>{t.dailyPrompt}</h1><p className="subhead">Write a small world with at least five of today’s living words.</p></div><span className="quiet-badge">8 words · no pressure</span></header><section className="word-bricks">{prompts.map((word, index) => <span className={used.includes(word) ? 'used' : ''} key={word}><b>{String(index + 1).padStart(2, '0')}</b>{word}</span>)}</section><section className="writing-workspace"><div className="editor"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Start wherever you are…" /><footer><span>{text.trim() ? text.trim().split(/\s+/).length : 0} words</span><strong>{used.length}/5 {t.wordGoal}</strong></footer></div><aside className="writing-aside"><span className="eyebrow">A GENTLE NUDGE</span><h3>There’s no perfect first line.</h3><p>Let the words meet a memory, an opinion, or a little piece of today.</p><button className="outline full">{t.save}</button><button className="primary full" disabled={used.length < 5} onClick={() => setPublished(true)}>{t.publish} <span>→</span></button>{published && <div className="published-note">✓ {t.published}</div>}</aside></section>{published && <section className="wall-preview"><p className="eyebrow">THE WALL · TODAY</p><h2>“A small beginning.”</h2><p>{text || 'Your words have joined today’s wall.'}</p><button>♡ Co-sign <span>12</span></button></section>}</div> }

function Life({ t }: { t: UI }) { return <div className="page life-page"><header className="page-header"><div><p className="eyebrow">{t.life.toUpperCase()}</p><h1>{t.culture}</h1><p className="subhead">Not a separate lesson. The little things that make language feel lived-in.</p></div></header><section className="culture-feature"><div><p className="eyebrow">EVERYDAY AMERICA</p><h2>“How’s it going?”<br />is rarely a big question.</h2><p>In a coffee shop, at work, or in an elevator, a short answer and a question back keeps small talk moving.</p><button className="text-button">See the context →</button></div><aside><span>WHAT'S<br />UP?</span><i>★</i></aside></section><section className="tools-section"><div className="section-title"><div><p className="eyebrow">{t.bestTools.toUpperCase()}</p><h2>Useful, not noisy.</h2></div><button className="text-button">See all →</button></div><div className="tools-grid">{tools.map(([name, description, category], index) => <article key={name}><span className={`tool-icon i${index}`}>{name.slice(0, 1)}</span><div><small>{category}</small><h3>{name}</h3><p>{description}</p></div><b>↗</b></article>)}</div></section><section className="scenarios-preview"><p className="eyebrow">INTERNAL MONOLOGUE</p><h2>Speak from your actual life.</h2>{scenarios.slice(0, 3).map(([title, description]) => <button key={title}><span>○</span><div><strong>{title}</strong><small>{description}</small></div><b>→</b></button>)}</section></div> }

export default App
