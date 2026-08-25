import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Difficulty, Resource, UiLanguage } from './domain'
import { BUILTIN_CATEGORIES, id } from './domain'
import { addMarking, createState, deleteMarking, deleteResource, deleteWord, loadState, progressFor, renameMarking, resetResourceMarks, resetState, saveState, setWordMark, toggleSilentMark, upsertResource, upsertWordDetails } from './store'
import { importFromFile, importFromUrl, paragraphsToResource } from './importer'
import { Reader, Cover } from './features/Reader'
import { LearningFocus } from './features/LearningFocus'
import { SpeakingPage } from './features/SpeakingPage'
import { WritingPage } from './features/writing/WritingPage'
import { CameraProvider } from './features/speaking/CameraContext'
import { FloatingMiniCam } from './features/speaking/FloatingMiniCam'
import { Settings } from './features/Settings'
import { VocabularyVaultModal } from './features/vocabulary/VocabularyVaultModal'
import { AddResourceModal } from './components/AddResourceModal'
import { prompts } from './data'
import { baseUi, copy, detectUiLanguage, UI_LANGUAGES } from './i18n'
import { doveWhite } from './assets/doveWhite'
import {
  Home,
  BookOpen,
  Mic,
  PenLine,
  Sparkles,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  ArrowRight,
  Plus,
  Upload,
  Loader2,
  X,
  Trash2,
  Check,
  ArrowUpDown,
} from 'lucide-react'
import {
  ResourceContextMenu,
  EditContentModal,
  RenameModal,
  DeleteModal,
  type ResourceAction,
  type ResourceContextTarget,
} from './components/ResourceModals'

type Page = 'home' | 'reading' | 'speaking' | 'writing' | 'settings'

type UI = (typeof copy)[keyof typeof copy]
type NavLabel = 'home' | 'reading' | 'speaking' | 'writing'

const navItems: { id: Page; icon: React.ReactNode; label: NavLabel }[] = [
  { id: 'home', icon: <Home size={18} />, label: 'home' },
  { id: 'reading', icon: <BookOpen size={18} />, label: 'reading' },
  { id: 'speaking', icon: <Mic size={18} />, label: 'speaking' },
  { id: 'writing', icon: <PenLine size={18} />, label: 'writing' },
]

export const isGenericImportedAuthor = (author?: string) => {
  if (!author) return true
  const lower = author.trim().toLowerCase()
  return lower === 'importé' || lower === 'importés' || lower === 'imported' || lower === 'texte importé' || lower === 'sans auteur'
}

export default function App() {
  const [state, setState] = useState<AppState | null>(() => loadState())
  const [page, setPage] = useState<Page>('home')
  const [readerId, setReaderId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [sideCollapsed, setSideCollapsed] = useState(() => localStorage.getItem('vivre-side-collapsed') === '1')
  const [speakingPrompterText, setSpeakingPrompterText] = useState<string | null>(null)
  const [isAiTaskRunning, setIsAiTaskRunning] = useState(false)

  const [pendingNavPage, setPendingNavPage] = useState<Page | null>(null)
  const writingDraftGuardRef = useRef<{ hasDraftMoreThan10Words: boolean; saveDraft: () => void } | null>(null)

  const toggleSide = () => {
    const next = !sideCollapsed
    setSideCollapsed(next)
    localStorage.setItem('vivre-side-collapsed', next ? '1' : '0')
  }

  useEffect(() => { if (state) saveState(state) }, [state])
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.settings.theme }, [state?.settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <Onboarding onComplete={(name, uiLanguage) => setState(createState({ name, uiLanguage }))} />

  const ui = state.settings.uiLanguage
  const t = copy[ui]
  const reader = state.resources.find((resource) => resource.id === readerId) ?? null
  const change = (next: AppState) => setState(next)
  const setUiLanguage = (uiLanguage: UiLanguage) => change({ ...state, settings: { ...state.settings, uiLanguage } })

  const go = (next: Page) => {
    if (page === 'writing' && next !== 'writing' && writingDraftGuardRef.current?.hasDraftMoreThan10Words) {
      setPendingNavPage(next)
      return
    }
    performPendingNav(next)
  }

  const performPendingNav = (next: Page) => {
    setReaderId(null)
    if (next !== 'speaking') {
      setSpeakingPrompterText(null)
    }
    setPage(next)
    setPendingNavPage(null)
  }

  return (
    <CameraProvider
      language={state.settings.learningLanguage}
      ui={state.settings.uiLanguage}
      api={state.settings.api}
    >
      <main className={`app-shell ${sideCollapsed ? 'side-collapsed' : ''}`}>
        <Sidebar
          page={page}
          setPage={go}
          t={t}
          theme={state.settings.theme}
          toggleTheme={() => change({ ...state, settings: { ...state.settings, theme: state.settings.theme === 'light' ? 'dark' : 'light' } })}
          name={state.settings.name}
          collapsed={sideCollapsed}
          isAiTaskRunning={isAiTaskRunning}
          onToggleCollapse={toggleSide}
        />
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
              onSaveWord={(args) => change(upsertWordDetails(state, args))}
              onDeleteWord={(raw, language) => change(deleteWord(state, raw, language))}
              onOpenFocus={(resource) => setFocusId(resource.id)}
              onPageSize={(size) => change({ ...state, settings: { ...state.settings, readerPageSize: size } })}
              onWordMark={(key, mark) => change(setWordMark(state, key, mark))}
              onSilentMark={(key, letterIndex) => change(toggleSilentMark(state, key, letterIndex))}
              onMarkColor={(type, color) => change({ ...state, settings: { ...state.settings, markColors: { ...state.settings.markColors, [type]: color } } })}
              onAddMarking={(label, color) => change(addMarking(state, label, color))}
              onRenameMarking={(markingId, newLabel) => change(renameMarking(state, markingId, newLabel))}
              onDeleteMarking={(markingId) => change(deleteMarking(state, markingId))}
              onResetMarks={(language) => change(resetResourceMarks(state, language))}
              onAiTaskChange={setIsAiTaskRunning} />
          ) : (
            <>
              {page === 'home' && <Dashboard name={state.settings.name} state={state} ui={ui} onUiLanguage={setUiLanguage} onWrite={() => go('writing')} onContinue={(resourceId) => setReaderId(resourceId)} t={t} />}
              {page === 'reading' && <ReadingLibrary state={state} t={t} onOpen={(resource) => setReaderId(resource.id)} onAdd={(resource) => change(upsertResource(state, resource))} onChange={change} onAiTaskChange={setIsAiTaskRunning} />}
              {page === 'speaking' && (
                <SpeakingPage
                  ui={baseUi(ui)}
                  language={state.settings.learningLanguage}
                  api={state.settings.api}
                  customPrompterText={speakingPrompterText}
                  onConsumePrompterText={() => setSpeakingPrompterText(null)}
                  existingTags={Array.from(new Set(state.words.flatMap((w) => w.tags || [])))}
                  onAiTaskChange={setIsAiTaskRunning}
                  onSaveWord={(args) => change(upsertWordDetails(state, args))}
                />
              )}
              {page === 'writing' && (
                <WritingPage
                  state={state}
                  onChange={change}
                  ui={ui}
                  onNavigateToSpeaking={(text) => {
                    setSpeakingPrompterText(text)
                    performPendingNav('speaking')
                  }}
                  onDraftStateChange={(guard) => {
                    writingDraftGuardRef.current = guard
                  }}
                />
              )}
              {page === 'settings' && <Settings settings={state.settings} state={state}
                onSave={(settings) => change({ ...state, settings })}
                onChangeState={change}
                onResetData={() => { resetState(); setState(null); setPage('home') }} />}
            </>
          )}
        </section>
        <nav className="mobile-nav">{navItems.slice(1).map((item) => <button className={page === item.id ? 'active' : ''} onClick={() => go(item.id)} key={item.id}><b>{item.icon}</b><span>{t[item.label]}</span></button>)}</nav>
        {focusId && <LearningFocus resources={state.resources} initialResourceId={focusId} shortcuts={state.settings.teacherShortcuts} onUpdateResource={(updated) => change(upsertResource(state, updated))} onClose={() => setFocusId(null)} />}
        
        {/* Floating Mini Cam (shown when camera is active and user is outside speaking page) */}
        {(page !== 'speaking' || reader !== null) && (
          <FloatingMiniCam onNavigateToSpeaking={() => go('speaking')} />
        )}

        {/* Modal for unsaved draft when leaving Writing page */}
        {pendingNavPage && (
          <div className="writing-setup-overlay" onClick={() => setPendingNavPage(null)}>
            <div
              className="writing-setup-modal"
              style={{ maxWidth: 420 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '24px 20px 16px 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
                  Tu as un texte en cours, veux-tu sauvegarder avant de quitter la page ?
                </p>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  padding: '14px 20px',
                  borderTop: '1px solid var(--line)',
                }}
              >
                <button
                  type="button"
                  className="outline"
                  onClick={() => setPendingNavPage(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => performPendingNav(pendingNavPage)}
                >
                  Ne pas sauvegarder
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </CameraProvider>
  )
}


function Brand({ onClick }: { onClick?: () => void }) {
  const content = <><span className="brand-mark"><img src={doveWhite} alt="" /></span><span>vivre<br /><em>la langue</em></span></>
  return onClick
    ? <button className="brand brand-button" type="button" onClick={onClick} aria-label="Accueil">{content}</button>
    : <div className="brand">{content}</div>
}

function Onboarding({ onComplete }: { onComplete: (name: string, uiLanguage: UiLanguage) => void }) {
  const [name, setName] = useState('')
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() => detectUiLanguage())
  const t = copy[uiLanguage]
  return <main className="onboarding">
    <div className="onboard-grain" />
    <nav className="onboard-top"><Brand /><span>01 / 01</span></nav>
    <div className="onboard-content">
      <h1>{t.onboardTitleA}<br /><i>{t.onboardTitleB}</i></h1>
      <p className="onboard-intro">{t.onboardIntro}</p>
      <div className="onboard-form">
        <label>{t.name}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t.nameHint} /></label>
        <label className="onboard-lang">{t.interfaceQuestion}
          <select value={uiLanguage} onChange={(event) => setUiLanguage(event.target.value as UiLanguage)}>
            {UI_LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.flag} {language.name}</option>)}
          </select>
        </label>
        <button className="primary large" disabled={!name.trim()} onClick={() => onComplete(name.trim(), uiLanguage)}>{t.start} <ArrowRight size={16} /></button>
      </div>
    </div>
  </main>
}

function Sidebar({
  page,
  setPage,
  t,
  theme,
  toggleTheme,
  name,
  collapsed,
  isAiTaskRunning,
  onToggleCollapse,
}: {
  page: Page
  setPage: (p: Page) => void
  t: UI
  theme: string
  toggleTheme: () => void
  name: string
  collapsed: boolean
  isAiTaskRunning?: boolean
  onToggleCollapse: () => void
}) {
  return (
    <aside className="sidebar">
      <Brand onClick={() => setPage('home')} />
      <nav>
        {navItems.map((item) => (
          <button
            className={page === item.id ? 'active' : ''}
            onClick={() => setPage(item.id)}
            key={item.id}
            title={collapsed ? t[item.label] : undefined}
          >
            <b>{item.icon}</b>
            <span className="side-label">{t[item.label]}</span>
          </button>
        ))}
      </nav>
      <div className="side-bottom">
        {isAiTaskRunning && (
          <div
            className="sidebar-ai-task-pill"
            title="L'IA analyse le mot en arrière-plan"
          >
            <span className="sidebar-ai-pulse-dot" />
            <span className="side-label">Analyse IA en cours…</span>
          </div>
        )}
        <div className="side-bottom-actions">
          <button
            className={`side-action-btn ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
            title={t.settings}
            aria-label={t.settings}
          >
            <SettingsIcon size={17} />
          </button>
          <button
            className="side-action-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? t.darkMode : t.lightMode}
            aria-label={theme === 'light' ? t.darkMode : t.lightMode}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button
            className="side-action-btn"
            onClick={onToggleCollapse}
            title={collapsed ? t.expandSidebar : t.collapseSidebar}
            aria-label={collapsed ? t.expandSidebar : t.collapseSidebar}
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
      </div>
    </aside>
  )
}

/** Discreet round flag icons — switch the whole interface language. */
function LanguageFlags({ ui, onUiLanguage }: { ui: UiLanguage; onUiLanguage: (language: UiLanguage) => void }) {
  return <div className="lang-flags">
    {UI_LANGUAGES.map((language) => <button key={language.id}
      className={ui === language.id ? 'lang-flag active' : 'lang-flag'}
      title={language.name}
      onClick={() => onUiLanguage(language.id)}>{language.flag}</button>)}
  </div>
}

function Dashboard({ name, state, ui, onUiLanguage, onWrite, onContinue, t }: { name: string; state: AppState; ui: UiLanguage; onUiLanguage: (language: UiLanguage) => void; onWrite: () => void; onContinue: (resourceId: string) => void; t: UI }) {
  const current = state.resources[0]
  const progress = current ? progressFor(state, current) : 0
  return <div className="page dashboard">
    <header className="page-header"><div><p className="eyebrow">{t.today.toUpperCase()}</p><h1>{t.welcome}, {name}.</h1><p className="subhead">{t.reading}, {t.speaking}, {t.writing} — {t.homeSubTail}</p></div><LanguageFlags ui={ui} onUiLanguage={onUiLanguage} /></header>
    <section className="daily-card"><div className="daily-art"><span className="sun" /><span className="horizon" /><span className="city city-one" /><span className="city city-two" /></div><div className="daily-copy"><p className="eyebrow">{t.dayCard.toUpperCase()}</p><h2>{t.cardTitle}</h2><p>{t.cardBody}</p><button className="primary" onClick={onWrite}>{t.startActivity} <ArrowRight size={16} /></button></div><div className="daily-count"><strong>08</strong><span>living<br />words</span></div></section>
    <section className="dashboard-grid">
      {current && <article className="continue-card"><div><p className="eyebrow">{t.continueReading.toUpperCase()}</p><h3>{current.title}</h3><p>{progress}% {t.progressDone}</p></div><button className="round-arrow" onClick={() => onContinue(current.id)} aria-label="Continuer"><ArrowRight size={16} /></button><div className="progress"><span style={{ width: `${progress}%` }} /></div></article>}
      <article className="quiet-card"><span><Sparkles size={20} /></span><div><h3>{t.quietTitle}</h3><p>{t.noPush}</p></div></article>
    </section>
  </div>
}

function ReadingLibrary({ state, t, onOpen, onAdd, onChange, onAiTaskChange }: { state: AppState; t: UI; onOpen: (r: Resource) => void; onAdd: (r: Resource) => void; onChange: (state: AppState) => void; onAiTaskChange?: (running: boolean) => void }) {
  const [type, setType] = useState('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [vocabVaultOpen, setVocabVaultOpen] = useState(false)
  const isDraggingRef = useRef(false)
  const [menuTarget, setMenuTarget] = useState<ResourceContextTarget | null>(null)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [renamingResource, setRenamingResource] = useState<Resource | null>(null)
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null)
  const [coverTargetResource, setCoverTargetResource] = useState<Resource | null>(null)
  const coverFileRef = useRef<HTMLInputElement>(null)

  const hasResources = state.resources.length > 0
  const labelFor = (typeId: string) => t.categories[typeId] ?? state.customCategories.find((category) => category.id === typeId)?.label ?? typeId
  const types = useMemo(() => ['all', ...new Set([...BUILTIN_CATEGORIES.filter((category) => state.resources.some((resource) => resource.type === category)), ...state.customCategories.map((category) => category.id)])], [state.resources, state.customCategories])
  const filtered = useMemo(() => state.resources.filter((resource) => (type === 'all' || resource.type === type) && (difficulty === 'all' || resource.difficulty === difficulty)), [state.resources, type, difficulty])

  const learningWordsCount = useMemo(
    () => (state.words ?? []).filter((w) => w.language === state.settings.learningLanguage).length,
    [state.words, state.settings.learningLanguage],
  )

  const handleAction = (action: ResourceAction, res: Resource) => {
    if (action === 'editContent') setEditingResource(res)
    else if (action === 'rename') setRenamingResource(res)
    else if (action === 'changeCover') {
      setCoverTargetResource(res)
      coverFileRef.current?.click()
    } else if (action === 'delete') setDeletingResource(res)
  }

  const handleCoverPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !coverTargetResource) return
    const reader = new FileReader()
    reader.onload = () => {
      onChange(upsertResource(state, { ...coverTargetResource, coverImage: String(reader.result) }))
      setCoverTargetResource(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleDragOverResource = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return
    const fromIndex = state.resources.findIndex((r) => r.id === draggedId)
    const toIndex = state.resources.findIndex((r) => r.id === targetId)
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      const next = [...state.resources]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      onChange({ ...state, resources: next })
    }
  }

  return <div className="page library-page">
    <input ref={coverFileRef} type="file" accept="image/*" hidden onChange={handleCoverPicked} />
    <header className="page-header">
      <div>
        <h1>{t.library}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          className="outline"
          onClick={() => setVocabVaultOpen(true)}
          title="Consulter tout mon vocabulaire et le graphe Obsidian"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <BookOpen size={15} />
          <span>Vocabulaire ({learningWordsCount})</span>
        </button>
        {hasResources && <button className="outline" onClick={() => setAdding(true)}><Plus size={15} /> {t.add}</button>}
      </div>
    </header>
    {hasResources && <section className="filter-row">
      <div className="segmented">{types.map((item) => <button className={type === item ? 'selected' : ''} onClick={() => setType(item)} key={item}>{item === 'all' ? t.all : labelFor(item)}</button>)}</div>
      <div className="filter-right-group">
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}><option value="all">{t.allLevels}</option>{(['beginner', 'intermediate', 'advanced', 'native'] as Difficulty[]).map((level) => <option value={level} key={level}>{t.difficulty[level]}</option>)}</select>
      </div>
    </section>}
    {hasResources
      ? <section className="resource-grid">
        {filtered.map((resource) => {
          const isBeingDragged = draggedId === resource.id
          return (
            <button
              className={`resource-card ${isBeingDragged ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => {
                isDraggingRef.current = true
                setDraggedId(resource.id)
                e.dataTransfer.setData('text/plain', resource.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                handleDragOverResource(resource.id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDraggedId(null)
                setTimeout(() => { isDraggingRef.current = false }, 50)
              }}
              onDragEnd={() => {
                setDraggedId(null)
                setTimeout(() => { isDraggingRef.current = false }, 50)
              }}
              onClick={() => {
                if (!isDraggingRef.current) {
                  onOpen(resource)
                }
              }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuTarget({ resource, x: e.clientX, y: e.clientY }) }}
              key={resource.id}
            >
              <Cover cover={resource.cover} coverImage={resource.coverImage} type={labelFor(resource.type)} isAiGenerated={resource.isAiGenerated} />
              <div className="resource-meta">
                <span>{labelFor(resource.type)} · {t.difficulty[resource.difficulty]}</span>
                <h3>{resource.title}</h3>
                {resource.author && !isGenericImportedAuthor(resource.author) && !resource.isAiGenerated && <p>{resource.author}</p>}
                <div className="card-bottom"><small>{resource.minutes} min</small>{progressFor(state, resource) > 0 && <div className="tiny-progress"><i style={{ width: `${progressFor(state, resource)}%` }} /></div>}</div>
              </div>
            </button>
          )
        })}
      </section>
      : <section className="empty-library">
        <h2>{t.emptyTitle}</h2>
        <p>{t.emptyHint}</p>
        <button className="primary" onClick={() => setAdding(true)}><Plus size={16} /> {t.add} <ArrowRight size={16} /></button>
      </section>}
    {menuTarget && <ResourceContextMenu target={menuTarget} onSelectAction={handleAction} onClose={() => setMenuTarget(null)} />}
    {editingResource && <EditContentModal resource={editingResource} onSave={(updated) => onChange(upsertResource(state, updated))} onClose={() => setEditingResource(null)} />}
    {renamingResource && <RenameModal resource={renamingResource} onSave={(updated) => onChange(upsertResource(state, updated))} onClose={() => setRenamingResource(null)} />}
    {deletingResource && <DeleteModal resource={deletingResource} onConfirm={(id) => onChange(deleteResource(state, id))} onClose={() => setDeletingResource(null)} />}
    {adding && <AddResourceModal t={t} state={state} close={() => setAdding(false)} onAdd={(resource) => { onAdd(resource); setAdding(false) }} onChange={onChange} onAiTaskChange={onAiTaskChange} />}
    {vocabVaultOpen && (
      <VocabularyVaultModal
        state={state}
        language={state.settings.learningLanguage}
        onSaveWord={(args) => onChange(upsertWordDetails(state, args))}
        onDeleteWord={(raw, lang) => onChange(deleteWord(state, raw, lang))}
        onClose={() => setVocabVaultOpen(false)}
      />
    )}
  </div>
}
