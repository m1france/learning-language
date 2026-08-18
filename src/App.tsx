import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Difficulty, Resource, UiLanguage } from './domain'
import { BUILTIN_CATEGORIES, id } from './domain'
import { addMarking, createState, deleteMarking, deleteResource, deleteWord, loadState, progressFor, renameMarking, resetResourceMarks, resetState, saveState, setWordMark, toggleSilentMark, upsertResource, upsertWordDetails } from './store'
import { importFromFile, importFromUrl, paragraphsToResource } from './importer'
import { Reader, Cover } from './features/Reader'
import { LearningFocus } from './features/LearningFocus'
import { SpeakingPage } from './features/SpeakingPage'
import { CameraProvider } from './features/speaking/CameraContext'
import { FloatingMiniCam } from './features/speaking/FloatingMiniCam'
import { LifePage } from './features/LifePage'
import { Settings } from './features/Settings'
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

type Page = 'home' | 'reading' | 'speaking' | 'writing' | 'life' | 'settings'

type UI = (typeof copy)[keyof typeof copy]
type NavLabel = 'home' | 'reading' | 'speaking' | 'writing' | 'life'

const navItems: { id: Page; icon: React.ReactNode; label: NavLabel }[] = [
  { id: 'home', icon: <Home size={18} />, label: 'home' },
  { id: 'reading', icon: <BookOpen size={18} />, label: 'reading' },
  { id: 'speaking', icon: <Mic size={18} />, label: 'speaking' },
  { id: 'writing', icon: <PenLine size={18} />, label: 'writing' },
  { id: 'life', icon: <Sparkles size={18} />, label: 'life' },
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

  const go = (next: Page) => { setReaderId(null); setPage(next) }

  return (
    <CameraProvider language={state.settings.learningLanguage}>
      <main className={`app-shell ${sideCollapsed ? 'side-collapsed' : ''}`}>
        <Sidebar page={page} setPage={go} t={t} theme={state.settings.theme} toggleTheme={() => change({ ...state, settings: { ...state.settings, theme: state.settings.theme === 'light' ? 'dark' : 'light' } })} name={state.settings.name} collapsed={sideCollapsed} onToggleCollapse={toggleSide} />
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
              onResetMarks={(language) => change(resetResourceMarks(state, language))} />
          ) : (
            <>
              {page === 'home' && <Dashboard name={state.settings.name} state={state} ui={ui} onUiLanguage={setUiLanguage} onWrite={() => go('writing')} onContinue={(resourceId) => setReaderId(resourceId)} t={t} />}
              {page === 'reading' && <ReadingLibrary state={state} t={t} onOpen={(resource) => setReaderId(resource.id)} onAdd={(resource) => change(upsertResource(state, resource))} onChange={change} />}
              {page === 'speaking' && <SpeakingPage ui={baseUi(ui)} language={state.settings.learningLanguage} api={state.settings.api} />}
              {page === 'writing' && <Writing t={t} />}
              {page === 'life' && <LifePage ui={baseUi(ui)} state={state} onChange={change} />}
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
      </main>
    </CameraProvider>
  )
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><img src={doveWhite} alt="" /></span><span>vivre<br /><em>la langue</em></span></div>
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

function Sidebar({ page, setPage, t, theme, toggleTheme, name, collapsed, onToggleCollapse }: { page: Page; setPage: (p: Page) => void; t: UI; theme: string; toggleTheme: () => void; name: string; collapsed: boolean; onToggleCollapse: () => void }) {
  return <aside className="sidebar">
    <Brand />
    <nav>{navItems.map((item) => <button className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)} key={item.id} title={collapsed ? t[item.label] : undefined}><b>{item.icon}</b><span className="side-label">{t[item.label]}</span></button>)}</nav>
    <div className="side-bottom">
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
      <div className="profile-mini">
        <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
        <div className="side-label"><strong>{name}</strong><small>{t.roleLabel}</small></div>
        <span className="side-label"><ChevronDown size={14} /></span>
      </div>
    </div>
  </aside>
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

function ReadingLibrary({ state, t, onOpen, onAdd, onChange }: { state: AppState; t: UI; onOpen: (r: Resource) => void; onAdd: (r: Resource) => void; onChange: (state: AppState) => void }) {
  const [type, setType] = useState('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
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

  const handleDropOnResource = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }
    const fromIndex = state.resources.findIndex((r) => r.id === draggedId)
    const toIndex = state.resources.findIndex((r) => r.id === targetId)
    if (fromIndex !== -1 && toIndex !== -1) {
      const next = [...state.resources]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      onChange({ ...state, resources: next })
    }
    setDraggedId(null)
    setDragOverId(null)
  }

  return <div className="page library-page">
    <input ref={coverFileRef} type="file" accept="image/*" hidden onChange={handleCoverPicked} />
    <header className="page-header">
      <div>
        <h1>{t.library}</h1>
      </div>
      {hasResources && <button className="outline" onClick={() => setAdding(true)}><Plus size={15} /> {t.add}</button>}
    </header>
    {hasResources && <section className="filter-row">
      <div className="segmented">{types.map((item) => <button className={type === item ? 'selected' : ''} onClick={() => setType(item)} key={item}>{item === 'all' ? t.all : labelFor(item)}</button>)}</div>
      <div className="filter-right-group">
        <button
          type="button"
          className={`reorder-toggle-btn ${reorderMode ? 'active' : ''}`}
          onClick={() => setReorderMode(!reorderMode)}
          title={reorderMode ? 'Terminer le tri' : 'Trier et réorganiser les ressources'}
          aria-label="Trier les ressources"
        >
          <ArrowUpDown size={16} />
        </button>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}><option value="all">{t.allLevels}</option>{(['beginner', 'intermediate', 'advanced', 'native'] as Difficulty[]).map((level) => <option value={level} key={level}>{t.difficulty[level]}</option>)}</select>
      </div>
    </section>}
    {hasResources
      ? <section className={`resource-grid ${reorderMode ? 'reorder-mode' : ''}`}>
        {filtered.map((resource) => {
          const isBeingDragged = draggedId === resource.id
          const isTargetOver = dragOverId === resource.id
          return (
            <button
              className={`resource-card ${isBeingDragged ? 'dragging' : ''} ${isTargetOver ? 'drag-over' : ''}`}
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
                if (draggedId && draggedId !== resource.id) {
                  setDragOverId(resource.id)
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (dragOverId === resource.id) {
                  setDragOverId(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDropOnResource(resource.id)
                setTimeout(() => { isDraggingRef.current = false }, 50)
              }}
              onDragEnd={() => {
                setDraggedId(null)
                setDragOverId(null)
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
              <Cover cover={resource.cover} coverImage={resource.coverImage} type={labelFor(resource.type)} />
              <div className="resource-meta">
                <span>{labelFor(resource.type)} · {t.difficulty[resource.difficulty]}</span>
                <h3>{resource.title}</h3>
                {resource.author && !isGenericImportedAuthor(resource.author) && <p>{resource.author}</p>}
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
    {adding && <AddResource t={t} state={state} close={() => setAdding(false)} onAdd={(resource) => { onAdd(resource); setAdding(false) }} onChange={onChange} />}
  </div>
}

function AddResource({ t, state, close, onAdd, onChange }: { t: UI; state: AppState; close: () => void; onAdd: (r: Resource) => void; onChange: (state: AppState) => void }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty | 'auto'>('auto')
  const [category, setCategory] = useState<string>('article')
  const [managing, setManaging] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const options = { type: category, difficulty: difficulty === 'auto' ? undefined : difficulty }

  const doImport = async () => {
    if (!url.trim()) return
    setStatus('loading')
    const result = await importFromUrl(url.trim(), state.settings.learningLanguage, options)
    if (result.ok) onAdd(result.resource)
    else { setStatus('failed'); setShowPaste(true) }
  }

  const doFile = async (file: File | undefined) => {
    if (!file) return
    setStatus('loading')
    const result = await importFromFile(file, state.settings.learningLanguage, options)
    if (result.ok) onAdd(result.resource)
    else { setStatus('failed'); setShowPaste(true) }
  }

  const doPaste = () => {
    const paragraphs = pasted.split(/\n{2,}|\r?\n(?=\S)/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 1)
    if (!paragraphs.length) return
    onAdd(paragraphsToResource({ title: url.trim() || t.pastedTitle, paragraphs, language: state.settings.learningLanguage, type: category, difficulty: options.difficulty }))
  }

  const addCategory = () => {
    const label = newCategory.trim()
    if (!label) return
    const categoryId = `custom-${id('cat').slice(4)}`
    onChange({ ...state, customCategories: [...state.customCategories, { id: categoryId, label }] })
    setCategory(categoryId)
    setNewCategory('')
  }

  const renameCategory = (categoryId: string, label: string) => {
    if (!label.trim()) return
    onChange({ ...state, customCategories: state.customCategories.map((item) => (item.id === categoryId ? { ...item, label: label.trim() } : item)) })
  }

  const removeCategory = (categoryId: string) => {
    if (category === categoryId) setCategory('article')
    onChange({
      ...state,
      customCategories: state.customCategories.filter((item) => item.id !== categoryId),
      resources: state.resources.map((resource) => (resource.type === categoryId ? { ...resource, type: 'article' } : resource)),
    })
  }

  return <div className="modal-backdrop" onMouseDown={close}>
    <div className="add-modal" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={close} aria-label="Fermer"><X size={18} /></button>
      <p className="eyebrow">{t.addEyebrow}</p>
      <h2>{t.addTitle}</h2>
      <p>{t.addSub}</p>
      <div className="add-meta">
        <label>{t.difficultyLabel}
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty | 'auto')}>
            <option value="auto">{t.auto}</option>
            {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map((level) => <option value={level} key={level}>{t.difficulty[level]}</option>)}
          </select>
        </label>
        <label>{t.categoryLabel}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {BUILTIN_CATEGORIES.map((categoryId) => <option value={categoryId} key={categoryId}>{t.categories[categoryId]}</option>)}
            {state.customCategories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <button className="text-button manage-link" onClick={() => setManaging(!managing)}><SettingsIcon size={14} /> {t.manageCategories}</button>
      {managing && <div className="category-manager">
        {state.customCategories.map((item) => <div className="category-row" key={item.id}>
          <input defaultValue={item.label} onBlur={(event) => renameCategory(item.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') renameCategory(item.id, (event.target as HTMLInputElement).value) }} />
          <button className="tool-remove" title="Supprimer" onClick={() => removeCategory(item.id)}><Trash2 size={14} /></button>
        </div>)}
        <div className="category-row">
          <input placeholder={t.categoryName} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addCategory() }} />
          <button className="outline" disabled={!newCategory.trim()} onClick={addCategory}><Plus size={15} /></button>
        </div>
      </div>}
      <input ref={fileRef} type="file" accept=".txt,.md,.epub,.pdf,text/plain" hidden onChange={(event) => void doFile(event.target.files?.[0])} />
      <button className="dropzone" onClick={() => fileRef.current?.click()}><Upload size={22} /><strong>{t.pickFile}</strong><small>.txt, .md, .epub, .pdf</small></button>
      <div className="or"><span />{t.orUrl}<span /></div>
      <div className="url-row">
        <input placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void doImport() }} />
        <button className="primary" disabled={status === 'loading' || !url.trim()} onClick={() => void doImport()}>{status === 'loading' ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}</button>
      </div>
      {status === 'failed' && <p className="import-error">{t.importError}</p>}
      {(showPaste || status === 'failed') && <>
        <textarea className="paste-area" rows={5} placeholder={t.pastePlaceholder} value={pasted} onChange={(event) => setPasted(event.target.value)} />
        <button className="primary full" disabled={!pasted.trim()} onClick={doPaste}>{t.createResource} <ArrowRight size={16} /></button>
      </>}
      {status !== 'failed' && !showPaste && <button className="text-button paste-link" onClick={() => setShowPaste(true)}>{t.pasteLink}</button>}
    </div>
  </div>
}

function Writing({ t }: { t: UI }) {
  const [text, setText] = useState(''); const [published, setPublished] = useState(false)
  const used = prompts.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text))
  return <div className="page writing-page"><header className="page-header"><div><p className="eyebrow">{t.writing.toUpperCase()} · {t.today.toUpperCase()}</p><h1>{t.dailyPrompt}</h1><p className="subhead">{t.writingSub}</p></div><span className="quiet-badge">{t.writingBadge}</span></header><section className="word-bricks">{prompts.map((word, index) => <span className={used.includes(word) ? 'used' : ''} key={word}><b>{String(index + 1).padStart(2, '0')}</b>{word}</span>)}</section><section className="writing-workspace"><div className="editor"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={t.editorPlaceholder} /><footer><span>{text.trim() ? text.trim().split(/\s+/).length : 0} {t.wordsCounter}</span><strong>{used.length}/5 {t.wordGoal}</strong></footer></div><aside className="writing-aside"><span className="eyebrow">{t.nudge}</span><h3>{t.nudgeTitle}</h3><p>{t.nudgeBody}</p><button className="outline full">{t.save}</button><button className="primary full" disabled={used.length < 5} onClick={() => setPublished(true)}>{t.publish} <ArrowRight size={16} /></button>{published && <div className="published-note"><Check size={14} /> {t.published}</div>}</aside></section>{published && <section className="wall-preview"><p className="eyebrow">{t.wallToday}</p><h2>{t.wallTitle}</h2><p>{text || t.wallFallback}</p><button>{t.cosign} <span>12</span></button></section>}</div>
}
