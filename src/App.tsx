import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Difficulty, Language, Resource, UiLanguage } from './domain'
import { BUILTIN_CATEGORIES, id } from './domain'
import { addMarking, batchDeleteWords, batchMarkWordsKnown, batchUpdateWordKnowledge, batchUpdateWordTags, batchUpsertWordDetails, createState, deleteMarking, deleteResource, deleteWord, loadState, progressFor, renameMarking, resetResourceMarks, resetState, saveState, setWordMark, toggleSilentMark, upsertResource, upsertWordDetails } from './store'
import { getResourceWordStats } from './features/readingProgressUtils'
import { importFromFile, importFromUrl, paragraphsToResource } from './importer'
import { Reader, Cover } from './features/Reader'
import { LearningFocus } from './features/LearningFocus'
import { SpeakingPage } from './features/SpeakingPage'
import { WritingPage } from './features/writing/WritingPage'
import { ExercisesPage } from './features/exercises/ExercisesPage'
import { CameraProvider, useCamera } from './features/speaking/CameraContext'
import { FloatingMiniCam } from './features/speaking/FloatingMiniCam'
import { Settings } from './features/Settings'
import { VocabularyVaultModal } from './features/vocabulary/VocabularyVaultModal'
import { AddResourceModal } from './components/AddResourceModal'
import { prompts } from './data'
import { baseUi, copy, detectUiLanguage, UI_LANGUAGES, writeCopy } from './i18n'
import { TOP_LEARNING_LANGUAGES } from './languages'
import { doveWhite } from './assets/doveWhite'
import { SharedLessonViewer } from './features/teacherExport/SharedLessonViewer'
import { parseSharedLessonFromUrl, getExportedLesson, fetchSharedLesson, isShareSubdomain } from './features/teacherExport/teacherExportService'
import type { ExportedLesson } from './features/teacherExport/teacherExportDomain'
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
  Plus,
  ArrowRight,
  Search,
  Upload,
  Link2,
  Trash2,
  Lock,
  Compass,
  Loader2,
  X,
  Check,
  ArrowUpDown,
  Play,
  AlertCircle,
  GraduationCap,
} from 'lucide-react'
import {
  ResourceContextMenu,
  EditContentModal,
  RenameModal,
  DeleteModal,
  type ResourceAction,
  type ResourceContextTarget,
} from './components/ResourceModals'

type Page = 'home' | 'reading' | 'speaking' | 'writing' | 'exercises' | 'settings'

type UI = (typeof copy)[keyof typeof copy]
type NavItem = {
  id: Page
  label: 'home' | 'reading' | 'speaking' | 'writing' | 'exercises'
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { id: 'home', label: 'home', icon: <Home size={18} /> },
  { id: 'reading', label: 'reading', icon: <BookOpen size={18} /> },
  { id: 'speaking', label: 'speaking', icon: <Mic size={18} /> },
  { id: 'writing', label: 'writing', icon: <PenLine size={18} /> },
]

const extraNavItems: NavItem[] = [
  { id: 'exercises', label: 'exercises', icon: <Sparkles size={18} /> },
]

export const isGenericImportedAuthor = (author?: string): boolean => {
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
  const [aiTaskLabel, setAiTaskLabel] = useState<string | undefined>(undefined)

  // Consultation d'une leçon partagée (via URL ou prévisualisation professeur)
  const [viewingSharedLesson, setViewingSharedLesson] = useState<ExportedLesson | null>(() => {
    const parsed = parseSharedLessonFromUrl()
    if (parsed?.lessonId) {
      return getExportedLesson(parsed.lessonId)
    }
    return null
  })
  const [loadingSharedLesson, setLoadingSharedLesson] = useState(false)
  const [sharedLessonError, setSharedLessonError] = useState<string | null>(null)

  // Récupération distante si l'URL contient un ID de leçon non présent en local
  useEffect(() => {
    const parsed = parseSharedLessonFromUrl()
    if (parsed?.lessonId && !viewingSharedLesson) {
      setLoadingSharedLesson(true)
      fetchSharedLesson(parsed.lessonId)
        .then((lesson) => {
          if (lesson) {
            setViewingSharedLesson(lesson)
          } else {
            setSharedLessonError("Cette leçon n'est pas disponible ou a été dépubliée.")
          }
        })
        .catch(() => {
          setSharedLessonError("Impossible de joindre le serveur pour charger la leçon.")
        })
        .finally(() => {
          setLoadingSharedLesson(false)
        })
    }
  }, [])

  const handleAiTaskChange = (running: boolean, label?: string) => {
    setIsAiTaskRunning(running)
    setAiTaskLabel(label)
  }

  const [pendingNavPage, setPendingNavPage] = useState<Page | null>(null)
  const writingDraftGuardRef = useRef<{ hasDraftMoreThan10Words: boolean; saveDraft: () => void } | null>(null)

  const toggleSide = () => {
    const next = !sideCollapsed
    setSideCollapsed(next)
    localStorage.setItem('vivre-side-collapsed', next ? '1' : '0')
  }

  useEffect(() => { if (state) saveState(state) }, [state])
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.settings.theme }, [state?.settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  // Écran de chargement d'une leçon partagée distante
  if (loadingSharedLesson) {
    return (
      <div className="shared-viewer-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Loader2 size={36} className="spin" style={{ color: '#2563eb' }} />
          <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>Chargement de la leçon partagée...</p>
        </div>
      </div>
    )
  }

  // Écran d'erreur si la leçon partagée est introuvable
  if (sharedLessonError) {
    const isShare = isShareSubdomain()
    return (
      <div className="shared-viewer-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, minHeight: '100vh' }}>
        <div className="teacher-export-card" style={{ maxWidth: 440, padding: '28px 28px', textAlign: 'center' }}>
          <AlertCircle size={40} style={{ color: '#f59e0b', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>Leçon introuvable</h3>
          <p style={{ margin: isShare ? '0' : '0 0 20px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>{sharedLessonError}</p>
          {!isShare && (
            <button
              className="btn-primary"
              style={{ margin: '0 auto' }}
              onClick={() => {
                setSharedLessonError(null)
                if (window.location.hash.startsWith('#/share/')) window.location.hash = ''
                if (window.location.search.includes('share=')) window.history.replaceState({}, '', window.location.pathname)
              }}
            >
              Retour à l'accueil
            </button>
          )}
        </div>
      </div>
    )
  }

  // Si on est en mode consultation d'une leçon partagée pour un élève (ou preview)
  if (viewingSharedLesson) {
    return (
      <SharedLessonViewer
        lesson={viewingSharedLesson}
        onBack={() => {
          setViewingSharedLesson(null)
          if (window.location.hash.startsWith('#/share/')) {
            window.location.hash = ''
          }
          if (window.location.search.includes('share=')) {
            window.history.replaceState({}, '', window.location.pathname)
          }
        }}
        isTeacherPreview={state !== null && !isShareSubdomain()}
        ui={state?.settings.uiLanguage || 'fr'}
      />
    )
  }

  // Si on est sur le sous-domaine share.mathisbnl.info sans leçon spécifiée (page d'accueil du sous-domaine)
  if (isShareSubdomain()) {
    return (
      <div className="shared-viewer-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
        <div className="teacher-export-card" style={{ maxWidth: 460, padding: '36px 32px', textAlign: 'center' }}>
          <div className="teacher-export-icon-badge primary" style={{ margin: '0 auto 16px', width: 52, height: 52 }}>
            <GraduationCap size={28} />
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
            Espace de partage de cours
          </h2>
          <p style={{ margin: '0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            Pour accéder à vos pages de cours et devoirs, veuillez utiliser le lien direct communiqué par votre professeur.
          </p>
        </div>
      </div>
    )
  }

  if (!state) return <Onboarding onComplete={(name, uiLanguage, learningLanguage) => setState(createState({ name, uiLanguage, learningLanguage }))} />

  const ui = state.settings.uiLanguage
  const t = copy[ui]
  const reader = state.resources.find((resource) => resource.id === readerId) ?? null
  const change = (next: AppState | ((prev: AppState) => AppState)) =>
    setState((prev) => (typeof next === 'function' ? (prev ? next(prev) : prev) : next))
  const setUiLanguage = (uiLanguage: UiLanguage) => change((prev) => ({ ...prev, settings: { ...prev.settings, uiLanguage } }))

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
          toggleTheme={() => change((prev) => ({ ...prev, settings: { ...prev.settings, theme: prev.settings.theme === 'light' ? 'dark' : 'light' } }))}
          name={state.settings.name}
          collapsed={sideCollapsed}
          isAiTaskRunning={isAiTaskRunning}
          aiTaskLabel={aiTaskLabel}
          onToggleCollapse={toggleSide}
        />
        <section className="page-canvas">
          <header className="mobile-header"><Brand /><button className="avatar">{state.settings.name.slice(0, 1).toUpperCase()}</button></header>
          {reader ? (
            <Reader state={state} resource={reader} ui={ui}
              onBack={() => setReaderId(null)}
              onUpdate={(updated) => change((prev) => upsertResource(prev, updated))}
              onDelete={(resourceId) => { change((prev) => deleteResource(prev, resourceId)); setReaderId(null) }}
              onProgress={(resourceId, chapterIndex, paragraphIndex) => change((prev) => ({
                ...prev,
                progress: { ...prev.progress, [resourceId]: { resourceId, chapterIndex, paragraphIndex, completed: false, updatedAt: new Date().toISOString() } },
              }))}
              onSaveWord={(args) => change((prev) => upsertWordDetails(prev, args))}
              onBatchSaveWords={(items) => change((prev) => batchUpsertWordDetails(prev, items))}
              onBatchMarkKnown={(words, language) => change((prev) => batchMarkWordsKnown(prev, words, language))}
              onDeleteWord={(raw, language) => change((prev) => deleteWord(prev, raw, language))}
              onOpenFocus={(resource) => setFocusId(resource.id)}
              onPageSize={(size) => change((prev) => ({ ...prev, settings: { ...prev.settings, readerPageSize: size } }))}
              onWordMark={(key, mark) => change((prev) => setWordMark(prev, key, mark))}
              onSilentMark={(key, letterIndex) => change((prev) => toggleSilentMark(prev, key, letterIndex))}
              onMarkColor={(type, color) => change((prev) => ({ ...prev, settings: { ...prev.settings, markColors: { ...prev.settings.markColors, [type]: color } } }))}
              onAddMarking={(label, color) => change((prev) => addMarking(prev, label, color))}
              onRenameMarking={(markingId, newLabel) => change((prev) => renameMarking(prev, markingId, newLabel))}
              onDeleteMarking={(markingId) => change((prev) => deleteMarking(prev, markingId))}
              onResetMarks={(language) => change((prev) => resetResourceMarks(prev, language))}
              onAiTaskChange={handleAiTaskChange} />
          ) : (
            <>
              {page === 'home' && <Dashboard name={state.settings.name} state={state} ui={ui} onUiLanguage={setUiLanguage} onWrite={() => go('writing')} onNavigate={go} onContinue={(resourceId) => setReaderId(resourceId)} t={t} />}
              {page === 'reading' && <ReadingLibrary state={state} t={t} onOpen={(resource) => setReaderId(resource.id)} onAdd={(resource) => change(upsertResource(state, resource))} onChange={change} onAiTaskChange={setIsAiTaskRunning} />}
              {page === 'speaking' && (
                <SpeakingPage
                  ui={ui}
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
              {page === 'exercises' && (
                <ExercisesPage
                  state={state}
                  onChange={change}
                  ui={ui}
                  onAiTaskChange={setIsAiTaskRunning}
                />
              )}
              {page === 'settings' && (
                <Settings
                  settings={state.settings}
                  state={state}
                  onSave={(settings) => change({ ...state, settings })}
                  onChangeState={change}
                  onOpenLesson={(lesson) => setViewingSharedLesson(lesson)}
                  onResetData={() => {
                    resetState()
                    setState(null)
                    setPage('home')
                  }}
                />
              )}
            </>
          )}
        </section>
        <nav className="mobile-nav">
          {navItems.slice(1).concat(extraNavItems).map((item) => (
            <button className={page === item.id ? 'active' : ''} onClick={() => go(item.id)} key={item.id}>
              <b>{item.icon}</b>
              <span>{t[item.label]}</span>
            </button>
          ))}
        </nav>
        {focusId && (
          <LearningFocus
            resources={state.resources}
            initialResourceId={focusId}
            shortcuts={state.settings.teacherShortcuts}
            teacherUsername={state.settings.teacherUsername}
            teacherName={state.settings.name}
            onSaveTeacherUsername={(teacherUsername) =>
              change((prev) => ({ ...prev, settings: { ...prev.settings, teacherUsername } }))
            }
            onOpenSharedLesson={(lesson) => setViewingSharedLesson(lesson)}
            onUpdateResource={(updated) => change(upsertResource(state, updated))}
            onClose={() => setFocusId(null)}
            ui={state.settings.uiLanguage}
            api={state.settings.api}
          />
        )}
        
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
                  {writeCopy[ui]?.draftWarning || 'Tu as un texte en cours, veux-tu sauvegarder avant de quitter la page ?'}
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
                  {writeCopy[ui]?.stayOnPage || 'Annuler'}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => performPendingNav(pendingNavPage)}
                >
                  {writeCopy[ui]?.leaveWithoutSaving || 'Ne pas sauvegarder'}
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

function Onboarding({ onComplete }: { onComplete: (name: string, uiLanguage: UiLanguage, learningLanguage: Language) => void }) {
  const [name, setName] = useState('')
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() => detectUiLanguage())
  const [learningLanguage, setLearningLanguage] = useState<Language>('en')
  const t = copy[uiLanguage]
  return <main className="onboarding">
    <div className="onboard-grain" />
    <nav className="onboard-top"><Brand /><span>01 / 01</span></nav>
    <div className="onboard-content">
      <h1>{t.onboardTitleA}<br /><i>{t.onboardTitleB}</i></h1>
      <div className="onboard-form">
        <label>{t.name}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t.nameHint} /></label>
        <label className="onboard-lang">{t.interfaceQuestion}
          <select value={uiLanguage} onChange={(event) => setUiLanguage(event.target.value as UiLanguage)}>
            {UI_LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.flag} {language.name}</option>)}
          </select>
        </label>
        <label className="onboard-lang">{t.learningLanguageQuestion}
          <select value={learningLanguage} onChange={(event) => setLearningLanguage(event.target.value as Language)}>
            {TOP_LEARNING_LANGUAGES.map((language) => (
              <option value={language.id} key={language.id}>
                {language.flag} {language.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary large" disabled={!name.trim()} onClick={() => onComplete(name.trim(), uiLanguage, learningLanguage)}>{t.start} <ArrowRight size={16} /></button>
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
  aiTaskLabel,
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
  aiTaskLabel?: string
  onToggleCollapse: () => void
}) {
  const [isSeeMoreOpen, setIsSeeMoreOpen] = useState(page === 'exercises')

  useEffect(() => {
    if (page === 'exercises') {
      setIsSeeMoreOpen(true)
    }
  }, [page])

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

        {/* Separator Line with "Voir plus" accordion */}
        <div className="sidebar-accordion-section">
          <button
            type="button"
            className="sidebar-see-more-toggle"
            onClick={() => setIsSeeMoreOpen(!isSeeMoreOpen)}
            title={isSeeMoreOpen ? t.seeLess : t.seeMore}
          >
            <span className="see-more-line" />
            <span className="see-more-label-wrap">
              <span className="side-label">{isSeeMoreOpen ? t.seeLess : t.seeMore}</span>
              <ChevronDown
                size={12}
                className={`see-more-chevron ${isSeeMoreOpen ? 'open' : ''}`}
              />
            </span>
            <span className="see-more-line" />
          </button>

          <div className={`sidebar-accordion-body ${isSeeMoreOpen ? 'open' : ''}`}>
            {extraNavItems.map((item) => (
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
          </div>
        </div>
      </nav>
      <div className="side-bottom">
        {isAiTaskRunning && (
          <div
            className="sidebar-ai-task-pill"
            title="L'IA analyse en arrière-plan"
          >
            <span className="sidebar-ai-pulse-dot" />
            <span className="side-label">{aiTaskLabel || 'Analyse IA en cours…'}</span>
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

function Dashboard({
  name,
  state,
  ui,
  onUiLanguage,
  onWrite,
  onNavigate,
  onContinue,
  t,
}: {
  name: string
  state: AppState
  ui: UiLanguage
  onUiLanguage: (language: UiLanguage) => void
  onWrite: () => void
  onNavigate: (page: Page) => void
  onContinue: (resourceId: string) => void
  t: UI
}) {
  const { sessions, setActiveReviewSession } = useCamera()
  const carouselRef = useRef<HTMLDivElement>(null)

  const handleScrollRight = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: 300, behavior: 'smooth' })
    }
  }

  const labelFor = (typeId: string) =>
    t.categories[typeId] ??
    state.customCategories.find((category) => category.id === typeId)?.label ??
    typeId

  const activeResources = useMemo(() => state.resources.filter((r) => !r.archived), [state.resources])
  const hasResources = activeResources.length > 0
  const hasSpeakingSessions = sessions.length > 0

  return (
    <div className="page dashboard">
      {/* Header */}
      <header className="page-header dashboard-header">
        <div>
          <h1>{t.welcome}, {name || 'Salut'}.</h1>
        </div>
        <LanguageFlags ui={ui} onUiLanguage={onUiLanguage} />
      </header>

      {/* Top Section: Reprendre là où tu t'es arrêté */}
      <section className="dashboard-section resume-section-card">
        <div className="resume-section-head">
          <h2>{t.resumeWhereYouLeftOff}</h2>
          <button className="resume-view-all-link" onClick={() => onNavigate('reading')}>
            {t.viewAll} <ArrowRight size={14} />
          </button>
        </div>

        {hasResources ? (
          <div className="resume-carousel-wrapper">
            <div className="resume-carousel" ref={carouselRef}>
              {activeResources.map((resource) => {
                const progress = progressFor(state, resource)
                const typeLabel = labelFor(resource.type)
                return (
                  <div
                    className="resume-item-card"
                    key={resource.id}
                    onClick={() => onContinue(resource.id)}
                    role="button"
                    tabIndex={0}
                    title={`Continuer : ${resource.title}`}
                  >
                    {resource.coverImage ? (
                      <div
                        className="card-bg-img"
                        style={{ backgroundImage: `url(${resource.coverImage})` }}
                      />
                    ) : (
                      <div className={`card-bg-tone cover ${resource.cover || 'coral'}`}>
                        <span className="cover-type">{typeLabel}</span>
                        <div className="cover-shape one" />
                        <div className="cover-shape two" />
                        <div className="cover-line" />
                      </div>
                    )}
                    <div className="card-gradient-overlay" />
                    <div className="card-content">
                      <span className="card-tag">{typeLabel}</span>
                      <h3 className="card-title">{resource.title}</h3>
                      <span className="card-detail">
                        {resource.minutes} min
                        {resource.author && !isGenericImportedAuthor(resource.author) ? ` · ${resource.author}` : ''}
                      </span>
                      <div className="card-progress-track">
                        <div className="card-progress-bar" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {state.resources.length > 2 && (
              <button
                className="carousel-next-btn"
                onClick={handleScrollRight}
                aria-label="Faire défiler vers la droite"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        ) : (
          <div className="resume-empty-banner">
            <div className="resume-empty-icon">
              <BookOpen size={24} />
            </div>
            <div className="resume-empty-text">
              <h4>{t.emptyTitle}</h4>
              <p>{t.emptyHint}</p>
            </div>
            <button className="primary" onClick={() => onNavigate('reading')}>
              <Plus size={16} /> {t.add}
            </button>
          </div>
        )}
      </section>

      {/* Bottom Row: 2 Smart Layouts (Parler & Ton carnet) */}
      <div className="dashboard-smart-grid">
        {/* Parler Section */}
        <section className="smart-card speaking-smart-card">
          <div className="smart-card-head">
            <h3>{t.speaking}</h3>
            <button className="smart-view-all-link" onClick={() => onNavigate('speaking')}>
              {t.viewAll} <ArrowRight size={14} />
            </button>
          </div>
          {hasSpeakingSessions ? (
            <div className="speaking-sessions-list">
              {sessions.slice(0, 4).map((session) => (
                <div
                  className="speaking-session-row"
                  key={session.id}
                  onClick={() => {
                    setActiveReviewSession(session)
                    onNavigate('speaking')
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="play-icon-box"><Play size={13} fill="currentColor" /></div>
                  <span className="session-title">{session.title || 'Session de conversation'}</span>
                  <span className="session-time">
                    {new Date(session.createdAt).toLocaleDateString(ui === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="speaking-empty-state">
              <div className="speaking-empty-icon">
                <Mic size={22} />
              </div>
              <p className="speaking-empty-text">{t.noSpeakingSessions}</p>
              <button className="primary small" onClick={() => onNavigate('speaking')}>
                <Plus size={14} /> {t.startSpeakingSession}
              </button>
            </div>
          )}
        </section>

        {/* Ton carnet Section */}
        <section className="smart-card notebook-smart-card">
          <div className="smart-card-head">
            <h3>{t.yourJournal}</h3>
            <button className="smart-view-all-link" onClick={onWrite}>
              {t.openAction} <ArrowRight size={14} />
            </button>
          </div>
          <div
            className="spiral-notebook-container"
            onClick={onWrite}
            role="button"
            tabIndex={0}
            title="Ouvrir mon carnet d'écriture"
          >
            <div className="spiral-notebook">
              {/* Central Spiral Rings */}
              <div className="spiral-rings">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div className="spiral-ring" key={i}>
                    <span className="ring-coil" />
                    <span className="ring-hole left" />
                    <span className="ring-hole right" />
                  </div>
                ))}
              </div>

              {/* Left Page with handwritten quote */}
              <div className="notebook-page page-left">
                <div className="quote-wrapper">
                  <p className="cursive-quote">
                    Chaque mot appris<br />
                    est une porte<br />
                    qui s’ouvre.
                  </p>
                  <p className="cursive-sig">— Toi, aujourd’hui</p>
                </div>
              </div>

              {/* Right Page with lined paper and bookmark */}
              <div className="notebook-page page-right">
                <div className="notebook-bookmark-ribbon" />
                <div className="notebook-lines">
                  <span className="lines-placeholder">Écris librement…</span>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div className="ruled-line" key={i} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ReadingLibrary({ state, t, onOpen, onAdd, onChange, onAiTaskChange }: { state: AppState; t: UI; onOpen: (r: Resource) => void; onAdd: (r: Resource) => void; onChange: (state: AppState) => void; onAiTaskChange?: (running: boolean) => void }) {
  const ui = state.settings.uiLanguage
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
  const hasArchived = useMemo(() => state.resources.some((r) => r.archived), [state.resources])
  const activeResources = useMemo(() => state.resources.filter((r) => !r.archived), [state.resources])

  useEffect(() => {
    if (type === 'archive' && !hasArchived) {
      setType('all')
    }
  }, [type, hasArchived])

  const labelFor = (typeId: string) => {
    if (typeId === 'archive') return t.archive || 'Archive'
    return t.categories[typeId] ?? state.customCategories.find((category) => category.id === typeId)?.label ?? typeId
  }

  const types = useMemo(() => {
    const list = [
      'all',
      ...new Set([
        ...BUILTIN_CATEGORIES.filter((category) => activeResources.some((resource) => resource.type === category)),
        ...state.customCategories.map((category) => category.id),
      ]),
    ]
    if (hasArchived) {
      list.push('archive')
    }
    return list
  }, [activeResources, state.customCategories, hasArchived])

  const filtered = useMemo(() => {
    if (type === 'archive') {
      return state.resources.filter(
        (resource) => resource.archived && (difficulty === 'all' || resource.difficulty === difficulty),
      )
    }
    return state.resources.filter(
      (resource) => !resource.archived && (type === 'all' || resource.type === type) && (difficulty === 'all' || resource.difficulty === difficulty),
    )
  }, [state.resources, type, difficulty])

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
    } else if (action === 'archive') {
      onChange(upsertResource(state, { ...res, archived: true }))
    } else if (action === 'unarchive') {
      onChange(upsertResource(state, { ...res, archived: false }))
    } else if (action === 'delete') {
      setDeletingResource(res)
    }
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
                {(() => {
                  const stats = getResourceWordStats(state, resource)
                  return (
                    <div className="card-bottom">
                      <small>
                        {stats.totalUnique > 0
                          ? `${stats.knownCount} / ${stats.totalUnique} mots connus (${stats.percentage}%)`
                          : `${resource.minutes} min`}
                      </small>
                      {stats.percentage > 0 && (
                        <div className="tiny-progress">
                          <i style={{ width: `${stats.percentage}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })()}
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
    {menuTarget && <ResourceContextMenu target={menuTarget} ui={ui} onSelectAction={handleAction} onClose={() => setMenuTarget(null)} />}
    {editingResource && <EditContentModal resource={editingResource} ui={ui} onSave={(updated) => onChange(upsertResource(state, updated))} onClose={() => setEditingResource(null)} />}
    {renamingResource && <RenameModal resource={renamingResource} ui={ui} onSave={(updated) => onChange(upsertResource(state, updated))} onClose={() => setRenamingResource(null)} />}
    {deletingResource && <DeleteModal resource={deletingResource} ui={ui} onConfirm={(id) => onChange(deleteResource(state, id))} onClose={() => setDeletingResource(null)} />}
    {adding && <AddResourceModal t={t} state={state} ui={ui} close={() => setAdding(false)} onAdd={(resource) => { onAdd(resource); setAdding(false) }} onChange={onChange} onAiTaskChange={onAiTaskChange} />}
    {vocabVaultOpen && (
      <VocabularyVaultModal
        state={state}
        language={state.settings.learningLanguage}
        ui={ui}
        onSaveWord={(args) => onChange(upsertWordDetails(state, args))}
        onDeleteWord={(raw, lang) => onChange(deleteWord(state, raw, lang))}
        onBatchDeleteWords={(raws, lang) => onChange(batchDeleteWords(state, raws, lang))}
        onBatchUpdateTags={(raws, lang, tags, mode) => onChange(batchUpdateWordTags(state, raws, lang, tags, mode))}
        onBatchUpdateKnowledge={(raws, lang, knowledge) => onChange(batchUpdateWordKnowledge(state, raws, lang, knowledge))}
        onClose={() => setVocabVaultOpen(false)}
      />
    )}
  </div>
}
