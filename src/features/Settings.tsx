import React, { useEffect, useState } from 'react'
import type { AppState, Language, UiLanguage, UserSettings } from '../domain'
import { BUILTIN_CATEGORIES, id } from '../domain'
import { copy, UI_LANGUAGES } from '../i18n'
import { listVoices, speak, testOpenRouterTts } from '../ai'
import { testAgentConnection } from './speaking/wordAiService'
import { testDeepLConnection } from './speaking/deeplService'
import { renderPhoneticFormatted } from './vocabulary/phoneticUtils'
import { addCustomTag, addMarking, DEFAULT_MARKINGS, DEFAULT_TEACHER_SHORTCUTS, deleteCustomTag, deleteMarking, knownTags, renameCustomTag, renameMarking, reorderMarkings, setMarkingColor } from '../store'
import {
  User,
  BookOpen,
  Palette,
  Tag,
  KeyRound,
  Database,
  Check,
  ArrowRight,
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  X,
  Sparkles,
  Keyboard,
  RotateCcw,
  Volume2,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react'

type SettingsProps = {
  settings: UserSettings
  state: AppState
  onSave: (settings: UserSettings) => void
  onChangeState: (state: AppState) => void
  onResetData: () => void
}

type Tab = 'profile' | 'reading' | 'markings' | 'shortcuts' | 'tags-categories' | 'connections' | 'data'

const TEACHER_TOOLS_INFO = [
  { id: 'select', label: 'Sélection', desc: 'Sélectionner et déplacer des formes ou des notes' },
  { id: 'pen', label: 'Stylo', desc: 'Dessin libre et écriture manuscrite' },
  { id: 'highlighter', label: 'Surligneur', desc: 'Surlignage de mots et passages' },
  { id: 'text', label: 'Texte', desc: 'Ajout et édition de notes textuelles' },
  { id: 'edit', label: 'Édition', desc: 'Modification directe du texte d\'origine' },
  { id: 'rect', label: 'Rectangle', desc: 'Tracé de cadres et rectangles' },
  { id: 'ellipse', label: 'Ellipse / Cercle', desc: 'Tracé de cercles et ovales' },
  { id: 'line', label: 'Ligne', desc: 'Tracé de lignes droites' },
  { id: 'arrow', label: 'Flèche', desc: 'Flèche directionnelle' },
  { id: 'liaison', label: 'Liaison', desc: 'Courbe de liaison entre lettres' },
  { id: 'gray', label: 'Griser lettre', desc: 'Marquage discret des lettres muettes' },
  { id: 'eraser', label: 'Gomme', desc: 'Suppression continue par contact' },
]

const AGENT_PROVIDERS: {
  id: NonNullable<UserSettings['api']['agentProvider']>
  name: string
  detail: string
  defaultModel: string
  keyField: keyof UserSettings['api']
  keyPlaceholder: string
  keyLabel: string
  keyHint?: string
  examples: string
}[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    detail: 'Accès universel (Nemotron, Claude, GPT, Llama, Gemini…)',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    keyField: 'openRouterKey',
    keyPlaceholder: 'sk-or-v1-…',
    keyLabel: 'Clé API OpenRouter',
    keyHint: 'Permet d’accéder à de nombreux modèles gratuits ou payants avec une seule clé (openrouter.ai).',
    examples: 'nvidia/nemotron-3-ultra-550b-a55b:free, meta-llama/llama-3.3-70b-instruct:free, anthropic/claude-3.5-sonnet',
  },
  {
    id: 'nvidia',
    name: 'Nvidia NIM',
    detail: 'Inférence ultra-rapide sur modèles Nemotron, Llama & Mistral',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    keyField: 'nvidiaKey',
    keyPlaceholder: 'nvapi-…',
    keyLabel: 'Clé API Nvidia NIM',
    keyHint: 'Obtenable gratuitement avec des crédits sur build.nvidia.com.',
    examples: 'nvidia/nemotron-4-340b-instruct, meta/llama-3.3-70b-instruct, mistralai/mistral-large-2-instruct',
  },
  {
    id: 'kimi',
    name: 'Kimi for Coding',
    detail: 'Moonshot AI — précision linguistique et raisonnement',
    defaultModel: 'moonshot-v1-8k',
    keyField: 'kimiKey',
    keyPlaceholder: 'sk-…',
    keyLabel: 'Clé API Kimi (Moonshot)',
    keyHint: 'Clé de plateforme platform.moonshot.cn.',
    examples: 'moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k',
  },
  {
    id: 'google',
    name: 'Google Cloud / Gemini',
    detail: 'Modèles Gemini 2.0 Flash et 1.5 Pro haute vitesse',
    defaultModel: 'gemini-2.0-flash',
    keyField: 'googleKey',
    keyPlaceholder: 'AIzaSy…',
    keyLabel: 'Clé API Google Gemini',
    keyHint: 'Clé API Google AI Studio (aistudio.google.com).',
    examples: 'gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    detail: 'Modèles officiels GPT-4o, GPT-4o-mini',
    defaultModel: 'gpt-4o-mini',
    keyField: 'openAiKey',
    keyPlaceholder: 'sk-proj-…',
    keyLabel: 'Clé API OpenAI',
    keyHint: 'Clé de plateforme platform.openai.com.',
    examples: 'gpt-4o-mini, gpt-4o, o3-mini',
  },
]

const TTS_PROVIDERS: { id: UserSettings['api']['ttsProvider']; name: string; detail: string }[] = [
  { id: 'google', name: 'Voix naturelle (gratuit)', detail: 'Voix Google de bonne qualité, sans clé ni compte. Recommandé pour démarrer.' },
  { id: 'openrouter', name: 'OpenRouter (modèle audio / TTS)', detail: 'Synthèse vocale IA de haute fidélité via OpenRouter (GPT-4o Mini TTS, TTS-1, Deepgram Flux…).' },
  { id: 'elevenlabs', name: 'ElevenLabs', detail: 'Voix IA haut de gamme. Colle ta clé API ElevenLabs ci-dessous.' },
  { id: 'fish', name: 'Fish Audio', detail: 'S2.1 et autres modèles Fish, avec ta clé API Fish Audio directe.' },
  { id: 'browser', name: 'Voix du navigateur', detail: 'Fonctionne hors ligne, qualité variable selon l’appareil.' },
]

const OPENROUTER_TTS_PRESETS = [
  { id: 'openai/gpt-4o-mini-tts-2025-12-15', label: 'GPT-4o Mini TTS (Recommandé)', desc: 'Ultra-rapide, naturel & économique' },
  { id: 'openai/tts-1', label: 'OpenAI TTS-1', desc: 'Modèle standard OpenAI' },
  { id: 'openai/tts-1-hd', label: 'OpenAI TTS-1 HD', desc: 'Haute fidélité sonore' },
  { id: 'deepgram/flux-tts', label: 'Deepgram Flux TTS', desc: 'Voix expressive' },
  { id: 'openai/gpt-4o-audio-preview', label: 'GPT-4o Audio Preview', desc: 'Modèle multimodal audio' },
]

const OPENROUTER_VOICES = [
  { id: 'alloy', label: 'Alloy (Neutre & clair)' },
  { id: 'echo', label: 'Echo (Masculin posé)' },
  { id: 'fable', label: 'Fable (Expressif & dynamique)' },
  { id: 'onyx', label: 'Onyx (Grave & chaleureux)' },
  { id: 'nova', label: 'Nova (Féminin énergique)' },
  { id: 'shimmer', label: 'Shimmer (Clair & doux)' },
]

const DEFAULT_CATEGORIES: { id: string; label: string }[] = [
  { id: 'story', label: 'Histoire' },
  { id: 'article', label: 'Article' },
  { id: 'culture', label: 'Culture' },
  { id: 'script', label: 'Script' },
  { id: 'book', label: 'Livre' },
  { id: 'news', label: 'Actualités' },
  { id: 'scientific', label: 'Scientifique' },
]

export function Settings({ settings, state, onSave, onChangeState, onResetData }: SettingsProps) {
  const [draft, setDraft] = useState<UserSettings>(settings)
  const [tab, setTab] = useState<Tab>('profile')
  const [saved, setSaved] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [newTag, setNewTag] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editingTagValue, setEditingTagValue] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const [newMarkingLabel, setNewMarkingLabel] = useState('')
  const [newMarkingColor, setNewMarkingColor] = useState('#2563eb')
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null)
  const [editingMarkValue, setEditingMarkValue] = useState('')

  const [recordingTool, setRecordingTool] = useState<string | null>(null)

  // Unified Category management
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const currentCategories = state.customCategories && state.customCategories.length > 0
    ? state.customCategories
    : DEFAULT_CATEGORIES

  const handleAddCategory = () => {
    const label = newCategoryName.trim()
    if (!label) return
    const categoryId = `cat-${id('c').slice(2)}`
    onChangeState({ ...state, customCategories: [...currentCategories, { id: categoryId, label }] })
    setNewCategoryName('')
  }

  const handleStartRenameCategory = (categoryId: string, label: string) => {
    setEditingCategoryId(categoryId)
    setEditingCategoryName(label)
  }

  const handleSaveRenameCategory = (categoryId: string) => {
    const label = editingCategoryName.trim()
    if (label) {
      onChangeState({
        ...state,
        customCategories: currentCategories.map((c) => (c.id === categoryId ? { ...c, label } : c)),
      })
    }
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const handleDeleteCategory = (categoryId: string) => {
    const remaining = currentCategories.filter((c) => c.id !== categoryId)
    const fallbackId = remaining[0]?.id || 'article'
    onChangeState({
      ...state,
      customCategories: remaining,
      resources: state.resources.map((res) => (res.type === categoryId ? { ...res, type: fallbackId } : res)),
    })
    if (editingCategoryId === categoryId) {
      setEditingCategoryId(null)
      setEditingCategoryName('')
    }
  }

  // Testing states
  const [testingAgent, setTestingAgent] = useState(false)
  const [agentTestStatus, setAgentTestStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const [testingTts, setTestingTts] = useState(false)
  const [ttsTestStatus, setTtsTestStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const [testingDeepL, setTestingDeepL] = useState(false)
  const [deepLTestStatus, setDeepLTestStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const handleTestAgent = async () => {
    setTestingAgent(true)
    setAgentTestStatus(null)
    try {
      const res = await testAgentConnection(draft.api)
      if (res.ok) {
        setAgentTestStatus({ ok: true, message: `Connexion réussie au modèle "${res.model}" !` })
      } else {
        setAgentTestStatus({ ok: false, message: `Échec : ${res.error || 'Erreur inconnue'}` })
      }
    } catch (e) {
      setAgentTestStatus({ ok: false, message: `Erreur : ${e instanceof Error ? e.message : 'Erreur réseau'}` })
    } finally {
      setTestingAgent(false)
    }
  }

  const handleTestTts = async () => {
    setTestingTts(true)
    setTtsTestStatus(null)
    try {
      if (draft.api.ttsProvider === 'openrouter') {
        const res = await testOpenRouterTts(draft.api, 'Hello! This is a test of OpenRouter voice synthesis.')
        if (res.ok) {
          setTtsTestStatus({
            ok: true,
            message: `Voix OpenRouter opérationnelle (${draft.api.ttsModel || 'openai/gpt-4o-mini-tts-2025-12-15'} - ${draft.api.ttsVoice || 'alloy'}) !`,
          })
        } else {
          setTtsTestStatus({ ok: false, message: `Erreur OpenRouter : ${res.error || 'Échec de synthèse'}` })
        }
      } else {
        const res = await speak('Hello! This is a test of the speech engine.', draft.learningLanguage, draft.api)
        if (res.error) {
          setTtsTestStatus({ ok: false, message: `Moteur ${res.engine} (avec avertissement) : ${res.error}` })
        } else {
          setTtsTestStatus({ ok: true, message: `Synthèse vocale réussie via le moteur : ${res.engine}` })
        }
      }
    } catch (e) {
      setTtsTestStatus({ ok: false, message: `Erreur : ${e instanceof Error ? e.message : 'Échec'}` })
    } finally {
      setTestingTts(false)
    }
  }

  const handleTestDeepL = async () => {
    setTestingDeepL(true)
    setDeepLTestStatus(null)
    try {
      const res = await testDeepLConnection(draft.api.deepLKey || '')
      if (res.ok) {
        setDeepLTestStatus({
          ok: true,
          message: `API DeepL opérationnelle ! Traduction : "Bonjour" → "${res.translation}"`,
        })
      } else {
        setDeepLTestStatus({
          ok: false,
          message: `${res.error || 'Échec de connexion DeepL'}`,
        })
      }
    } catch (e) {
      setDeepLTestStatus({ ok: false, message: `Erreur : ${e instanceof Error ? e.message : 'Échec'}` })
    } finally {
      setTestingDeepL(false)
    }
  }

  const allTags = knownTags(state, draft.learningLanguage)
  const allMarkings = state.markings && state.markings.length > 0 ? state.markings : DEFAULT_MARKINGS
  const currentShortcuts = draft.teacherShortcuts ?? DEFAULT_TEACHER_SHORTCUTS

  useEffect(() => {
    if (!recordingTool) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingTool(null)
        return
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const key = e.key.toLowerCase()
        const updated = { ...currentShortcuts, [recordingTool]: key }
        update('teacherShortcuts', updated)
        setRecordingTool(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [recordingTool, currentShortcuts])

  const handleResetShortcuts = () => {
    update('teacherShortcuts', DEFAULT_TEACHER_SHORTCUTS)
    setRecordingTool(null)
  }

  const handleAddTag = () => {
    const cleaned = newTag.trim()
    if (!cleaned) return
    onChangeState(addCustomTag(state, cleaned))
    setNewTag('')
  }

  const handleStartRename = (tag: string) => {
    setEditingTag(tag)
    setEditingTagValue(tag)
  }

  const handleSaveRename = (oldTag: string) => {
    const cleaned = editingTagValue.trim()
    if (cleaned && cleaned !== oldTag) {
      onChangeState(renameCustomTag(state, oldTag, cleaned))
    }
    setEditingTag(null)
    setEditingTagValue('')
  }

  const handleDeleteTag = (tag: string) => {
    onChangeState(deleteCustomTag(state, tag))
    if (editingTag === tag) {
      setEditingTag(null)
      setEditingTagValue('')
    }
  }

  const handleAddMarking = () => {
    const cleaned = newMarkingLabel.trim()
    if (!cleaned) return
    onChangeState(addMarking(state, cleaned, newMarkingColor))
    setNewMarkingLabel('')
  }

  const handleSaveRenameMarking = (markingId: string) => {
    const cleaned = editingMarkValue.trim()
    if (cleaned) {
      onChangeState(renameMarking(state, markingId, cleaned))
    }
    setEditingMarkId(null)
    setEditingMarkValue('')
  }

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateApi = <K extends keyof UserSettings['api']>(key: K, value: UserSettings['api'][K]) => setDraft((current) => ({ ...current, api: { ...current.api, [key]: value } }))
  const save = () => { onSave(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2200) }

  useEffect(() => {
    const load = () => setVoices(listVoices(draft.learningLanguage))
    load()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = load
    return () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = null }
  }, [draft.learningLanguage])

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'profile', icon: <User size={16} />, label: 'Profil' },
    { id: 'reading', icon: <BookOpen size={16} />, label: 'Lecture' },
    { id: 'markings', icon: <Palette size={16} />, label: 'Marquages' },
    { id: 'shortcuts', icon: <Keyboard size={16} />, label: 'Raccourcis' },
    { id: 'tags-categories', icon: <Tag size={16} />, label: 'Tags & Catégories' },
    { id: 'connections', icon: <KeyRound size={16} />, label: 'Connexions' },
    { id: 'data', icon: <Database size={16} />, label: 'Données' },
  ]

  return <div className="page settings-page">
    <header className="page-header settings-header">
      <div><p className="eyebrow">TON ESPACE</p><h1>Paramètres</h1><p className="subhead">Tout ce qui est privé reste sur cet appareil tant que tu ne connectes pas de service.</p></div>
      <button className="primary" onClick={save}>{saved ? <><Check size={15} /> Enregistré</> : 'Enregistrer'} <ArrowRight size={15} /></button>
    </header>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Sections">
        {tabs.map((item) => <button key={item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}><b>{item.icon}</b> {item.label}</button>)}
      </nav>
      <section className="settings-panel">
        {tab === 'profile' && <>
          <SettingHeading title="Ton espace d’apprentissage" detail="La langue d’interface est un choix libre, indépendant de la langue apprise." />
          <div className="settings-fields">
            <label>Ton prénom<input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label>Langue de l’interface<select value={draft.uiLanguage} onChange={(event) => update('uiLanguage', event.target.value as UiLanguage)}>{UI_LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.flag} {language.name}</option>)}</select></label>
            <label>Langue apprise<select value={draft.learningLanguage} onChange={(event) => update('learningLanguage', event.target.value as Language)}><option value="en">English (américain)</option><option value="fr">Français</option></select></label>
            <label>Apparence<select value={draft.theme} onChange={(event) => update('theme', event.target.value as UserSettings['theme'])}><option value="light">Clair chaleureux</option><option value="dark">Sombre calme</option></select></label>
          </div>
          <aside className="settings-tip"><span><Sparkles size={16} /></span><p>La langue de l’interface traduit les menus, boutons et instructions — jamais le contenu de tes ressources importées.</p></aside>
        </>}

        {tab === 'reading' && <>
          <SettingHeading title="Confort de lecture" detail="Fais du lecteur ton endroit calme." />
          <div className="settings-fields">
            <label>Taille du texte <div className="range-row"><input type="range" min="16" max="26" value={draft.readerFontSize} onChange={(event) => update('readerFontSize', Number(event.target.value))} /><output>{draft.readerFontSize}px</output></div></label>
            <label>Longueur des pages <div className="range-row"><input type="range" min="120" max="500" step="10" value={draft.readerPageSize} onChange={(event) => update('readerPageSize', Number(event.target.value))} /><output>{draft.readerPageSize} mots</output></div></label>
            <label>Largeur du texte<select value={draft.readerWidth} onChange={(event) => update('readerWidth', event.target.value as UserSettings['readerWidth'])}><option value="comfortable">Confortable</option><option value="wide">Large</option></select></label>
            <label>Style de la barre d’outils
              <select value={draft.readerToolbarStyle ?? 'liquid'} onChange={(event) => update('readerToolbarStyle', event.target.value as UserSettings['readerToolbarStyle'])}>
                <option value="liquid">Liquid Glass (iOS 27) — Flou profond et reflets</option>
                <option value="opaque">Haute opacité — Arrière-plan presque opaque</option>
                <option value="solid">Opaque classique — 100% plein</option>
              </select>
            </label>
            <label className="toggle-field"><span><strong>Grammaire visuelle</strong><small>Surligne doucement les verbes dans le lecteur.</small></span><input type="checkbox" checked={draft.showGrammar} onChange={(event) => update('showGrammar', event.target.checked)} /></label>
          </div>
        </>}

        {tab === 'markings' && <>
          <SettingHeading title="Gestion et ordre des marquages" detail="Personnalise tes marquages, modifie leurs couleurs, renomme-les et change leur ordre d’affichage dans le lecteur." />
          <div className="settings-markings-section">
            <div className="markings-add-bar">
              <div className="marking-add-input-wrap">
                <input
                  type="text"
                  placeholder="Nouveau marquage (ex. Proposition, Connecteur, Idiome...)"
                  value={newMarkingLabel}
                  onChange={(event) => setNewMarkingLabel(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') handleAddMarking() }}
                />
                <input
                  type="color"
                  id="new-marking-color-picker"
                  value={newMarkingColor}
                  onChange={(event) => setNewMarkingColor(event.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                />
                <button
                  type="button"
                  className="marking-inline-color-dot"
                  style={{ backgroundColor: newMarkingColor }}
                  onClick={() => document.getElementById('new-marking-color-picker')?.click()}
                  title="Choisir la couleur"
                />
              </div>
              <button className="primary" disabled={!newMarkingLabel.trim()} onClick={handleAddMarking}>
                <Plus size={14} /> Ajouter
              </button>
            </div>

            <div className="tags-grid-list">
              {allMarkings.map((marking, index) => {
                const isEditing = editingMarkId === marking.id
                const color = draft.markColors[marking.id] ?? marking.color
                return (
                  <div key={marking.id} className="marking-mgmt-card">
                    <div className="marking-card-left">
                      <div className="marking-color-picker-wrap">
                        <input
                          type="color"
                          value={color.startsWith('#') && color.length === 7 ? color : '#2563eb'}
                          id={`color-${marking.id}`}
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                          onChange={(e) => {
                            const newColor = e.target.value
                            update('markColors', { ...draft.markColors, [marking.id]: newColor })
                            onChangeState(setMarkingColor(state, marking.id, newColor))
                          }}
                        />
                        <button
                          type="button"
                          className="marking-color-swatch-btn"
                          style={{ background: color }}
                          title="Changer la couleur"
                          onClick={() => document.getElementById(`color-${marking.id}`)?.click()}
                        />
                      </div>

                      {isEditing ? (
                        <div className="tag-rename-box">
                          <input
                            autoFocus
                            value={editingMarkValue}
                            onChange={(e) => setEditingMarkValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRenameMarking(marking.id)
                              if (e.key === 'Escape') setEditingMarkId(null)
                            }}
                          />
                          <button className="tag-save-btn" title="Valider" onClick={() => handleSaveRenameMarking(marking.id)}><Check size={13} /></button>
                          <button className="tag-cancel-btn" title="Annuler" onClick={() => setEditingMarkId(null)}><X size={13} /></button>
                        </div>
                      ) : (
                        <span className="marking-card-label">{marking.label}</span>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="tag-mgmt-actions">
                        <button
                          type="button"
                          className="tag-icon-btn"
                          title="Monter"
                          disabled={index === 0}
                          onClick={() => onChangeState(reorderMarkings(state, index, index - 1))}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="tag-icon-btn"
                          title="Descendre"
                          disabled={index === allMarkings.length - 1}
                          onClick={() => onChangeState(reorderMarkings(state, index, index + 1))}
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          className="tag-icon-btn"
                          title="Renommer le marquage"
                          aria-label="Renommer le marquage"
                          onClick={() => {
                            setEditingMarkId(marking.id)
                            setEditingMarkValue(marking.label)
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="tag-icon-btn delete"
                          title="Supprimer le marquage"
                          aria-label="Supprimer le marquage"
                          onClick={() => onChangeState(deleteMarking(state, marking.id))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>}

        {tab === 'shortcuts' && <>
          <SettingHeading title="Raccourcis clavier" detail="Personnalise les raccourcis des outils du Teacher Mode pour annoter vos textes encore plus rapidement." />
          <div className="shortcuts-mgmt-section">
            <div className="shortcuts-top-bar">
              <p className="shortcuts-hint">Clique sur la touche d’un outil pour lui attribuer une nouvelle lettre de raccourci.</p>
              <button type="button" className="outline" onClick={handleResetShortcuts} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={13} /> Réinitialiser par défaut
              </button>
            </div>

            <div className="shortcuts-grid">
              {TEACHER_TOOLS_INFO.map((toolInfo) => {
                const isRecording = recordingTool === toolInfo.id
                const key = (currentShortcuts[toolInfo.id] ?? DEFAULT_TEACHER_SHORTCUTS[toolInfo.id] ?? '').toUpperCase()
                return (
                  <div key={toolInfo.id} className={`shortcut-card ${isRecording ? 'recording' : ''}`}>
                    <div className="shortcut-card-info">
                      <strong>{toolInfo.label}</strong>
                      <small>{toolInfo.desc}</small>
                    </div>
                    <button
                      type="button"
                      className={`shortcut-key-btn ${isRecording ? 'pulse' : ''}`}
                      onClick={() => setRecordingTool(isRecording ? null : toolInfo.id)}
                      title={isRecording ? 'Appuie sur une touche du clavier (Échap pour annuler)' : 'Modifier le raccourci'}
                    >
                      {isRecording ? <span className="recording-prompt">Touche...</span> : <kbd>{key || '—'}</kbd>}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="shortcuts-docs-card">
              <h3>Raccourcis globaux de lecture</h3>
              <div className="docs-shortcuts-list">
                <div className="docs-shortcut-row"><kbd>W</kbd><span>Activer / Désactiver le dictionnaire Wiktionary & Linguee</span></div>
                <div className="docs-shortcut-row"><kbd>Suppr</kbd> / <kbd>Backspace</kbd><span>Supprimer l’annotation ou la note sélectionnée (Teacher Mode)</span></div>
                <div className="docs-shortcut-row"><kbd>⌘ Z</kbd> / <kbd>Ctrl Z</kbd><span>Annuler la dernière annotation</span></div>
                <div className="docs-shortcut-row"><kbd>Échap</kbd><span>Quitter le Teacher Mode / Fermer la saisie en cours</span></div>
              </div>
            </div>
          </div>
        </>}

        {tab === 'tags-categories' && <>
          <SettingHeading title="Tags & Catégories" detail="Organise ta bibliothèque avec tes catégories et classe ton vocabulaire avec tes tags." />
          
          {/* SECTION 1 : CATÉGORIES DE LECTURE */}
          <div className="settings-tags-section">
            <div className="settings-section-subtitle">
              <span>Catégories de lecture</span>
            </div>

            <div className="tags-add-bar">
              <input
                type="text"
                placeholder="Nouvelle catégorie (ex. Poésie, Philosophie, Biographie...)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
              />
              <button className="primary" disabled={!newCategoryName.trim()} onClick={handleAddCategory}>
                <Plus size={14} /> Ajouter
              </button>
            </div>

            <div className="tags-grid-list">
              {currentCategories.map((item) => {
                const count = state.resources.filter((r) => r.type === item.id).length
                const isEditing = editingCategoryId === item.id

                return (
                  <div key={item.id} className="tag-mgmt-card">
                    {isEditing ? (
                      <div className="tag-rename-box">
                        <input
                          autoFocus
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRenameCategory(item.id)
                            if (e.key === 'Escape') setEditingCategoryId(null)
                          }}
                        />
                        <button className="tag-save-btn" title="Valider" onClick={() => handleSaveRenameCategory(item.id)}>
                          <Check size={13} />
                        </button>
                        <button className="tag-cancel-btn" title="Annuler" onClick={() => setEditingCategoryId(null)}>
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="tag-card-content">
                        <span className="wp-tag-chip active">{item.label}</span>
                        <span className="tag-word-count">{count} {count > 1 ? 'ressources' : 'ressource'}</span>
                      </div>
                    )}
                    {!isEditing && (
                      <div className="tag-mgmt-actions">
                        <button
                          className="tag-icon-btn"
                          title="Renommer la catégorie"
                          aria-label="Renommer la catégorie"
                          onClick={() => handleStartRenameCategory(item.id, item.label)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="tag-icon-btn delete"
                          title="Supprimer la catégorie"
                          aria-label="Supprimer la catégorie"
                          onClick={() => handleDeleteCategory(item.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* SECTION 2 : TAGS DE VOCABULAIRE */}
          <div className="settings-tags-section" style={{ marginTop: 32 }}>
            <div className="settings-section-subtitle">
              <span>Tags de vocabulaire</span>
            </div>

            <div className="tags-add-bar">
              <input
                type="text"
                placeholder="Nouveau tag (ex. nom, verbe, familier, voyage...)"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleAddTag() }}
              />
              <button className="primary" disabled={!newTag.trim()} onClick={handleAddTag}>
                <Plus size={14} /> Ajouter
              </button>
            </div>

            <div className="tags-grid-list">
              {allTags.length === 0 ? (
                <div className="tags-empty-state">
                  <p>Aucun tag enregistré pour le moment. Ajoute ton premier tag ci-dessus ou lors de la lecture.</p>
                </div>
              ) : (
                allTags.map((tag) => {
                  const count = state.words.filter((w) => w.tags?.includes(tag) && w.language === draft.learningLanguage).length
                  const isCustom = state.customTags?.includes(tag)
                  const isEditing = editingTag === tag
                  const isSelected = selectedTag === tag

                  return (
                    <div key={tag} className={`tag-mgmt-card ${isSelected ? 'selected' : ''}`}>
                      {isEditing ? (
                        <div className="tag-rename-box">
                          <input
                            autoFocus
                            value={editingTagValue}
                            onChange={(event) => setEditingTagValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') handleSaveRename(tag)
                              if (event.key === 'Escape') setEditingTag(null)
                            }}
                          />
                          <button className="tag-save-btn" title="Valider" onClick={() => handleSaveRename(tag)}><Check size={13} /></button>
                          <button className="tag-cancel-btn" title="Annuler" onClick={() => setEditingTag(null)}><X size={13} /></button>
                        </div>
                      ) : (
                        <div
                          className="tag-card-content"
                          onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                          title="Cliquer pour afficher les mots liés à ce tag"
                        >
                          <span className="wp-tag-chip active">{tag}</span>
                          <span className="tag-word-count">{count} {count > 1 ? 'mots' : 'mot'}</span>
                        </div>
                      )}
                      {!isEditing && (
                        <div className="tag-mgmt-actions">
                          <button
                            className="tag-icon-btn"
                            title="Renommer le tag"
                            aria-label="Renommer le tag"
                            onClick={() => handleStartRename(tag)}
                          >
                            <Pencil size={13} />
                          </button>
                          {isCustom && (
                            <button
                              className="tag-icon-btn delete"
                              title="Supprimer le tag"
                              aria-label="Supprimer le tag"
                              onClick={() => {
                                if (selectedTag === tag) setSelectedTag(null)
                                handleDeleteTag(tag)
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Display connected words when a tag is clicked */}
            {selectedTag && (
              <div className="tag-connected-words-card">
                <div className="tag-connected-header">
                  <div className="tag-connected-title">
                    <Tag size={15} />
                    <strong>Mots associés au tag #{selectedTag}</strong>
                    <span className="tag-word-count-badge">
                      {state.words.filter((w) => w.tags?.includes(selectedTag) && w.language === draft.learningLanguage).length}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="tag-icon-btn"
                    onClick={() => setSelectedTag(null)}
                    title="Fermer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {(() => {
                  const wordsForTag = state.words.filter(
                    (w) => w.tags?.includes(selectedTag) && w.language === draft.learningLanguage,
                  )
                  if (wordsForTag.length === 0) {
                    return (
                      <p className="tag-connected-empty">
                        Aucun mot n'est associé à ce tag pour le moment dans cette langue.
                      </p>
                    )
                  }
                  return (
                    <div className="tag-connected-words-grid">
                      {wordsForTag.map((word) => (
                        <div key={word.id || word.word} className="tag-connected-word-item">
                          <div className="tag-word-main">
                            <strong className="tag-word-text">{word.word}</strong>
                            {word.phonetic && (
                              <span className="tag-word-ipa">{renderPhoneticFormatted(word.phonetic)}</span>
                            )}
                            <button
                              type="button"
                              className="tag-word-speak-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                void speak(word.word, draft.learningLanguage, draft.api)
                              }}
                              title="Prononcer le mot"
                            >
                              <Volume2 size={13} />
                            </button>
                          </div>
                          {word.translation && (
                            <span className="tag-word-translation">{word.translation}</span>
                          )}
                          {word.contextSentence && (
                            <p className="tag-word-sentence">« {word.contextSentence} »</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </>}

        {tab === 'connections' && <>
          <SettingHeading title="Connexions & Modèles IA" detail="Configure tes clés d’API et personnalise les modèles d’intelligence artificielle par tâche." />
          
          {/* SECTION 1 : CLÉS D'API */}
          <div className="connection-card">
            <div>
              <h3>1. Clés d'API & Fournisseurs</h3>
              <p>Renseigne tes clés d'accès. Elles restent strictement stockées dans ce navigateur.</p>
            </div>

            <div className="preset-grid">
              {AGENT_PROVIDERS.map((provider) => {
                const isSelected = (draft.api.agentProvider || 'openrouter') === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={isSelected ? 'preset-card selected' : 'preset-card'}
                    onClick={() => {
                      updateApi('agentProvider', provider.id)
                      if (!draft.api.agentModel || AGENT_PROVIDERS.some((p) => p.defaultModel === draft.api.agentModel)) {
                        updateApi('agentModel', provider.defaultModel)
                      }
                      setAgentTestStatus(null)
                    }}
                  >
                    <strong>{provider.name}</strong>
                    <p>{provider.detail}</p>
                  </button>
                )
              })}
            </div>

            <div className="conn-keys-list">
              {(() => {
                const activeProvider = AGENT_PROVIDERS.find((p) => p.id === (draft.api.agentProvider || 'openrouter')) || AGENT_PROVIDERS[0]
                return (
                  <div className="conn-key-row">
                    <label>
                      <span>{activeProvider.keyLabel}</span>
                      <div className="conn-input-action-wrap">
                        <input
                          type="password"
                          value={(draft.api[activeProvider.keyField] as string) || ''}
                          onChange={(e) => {
                            updateApi(activeProvider.keyField, e.target.value)
                            setAgentTestStatus(null)
                          }}
                          placeholder={activeProvider.keyPlaceholder}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="connection-test-btn-compact"
                          onClick={handleTestAgent}
                          disabled={testingAgent || !(draft.api[activeProvider.keyField] as string)?.trim()}
                          title="Tester la clé et le modèle"
                        >
                          {testingAgent ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                          <span>{testingAgent ? 'Test…' : 'Tester'}</span>
                        </button>
                      </div>
                    </label>
                    {agentTestStatus && (
                      <div className={`connection-status-badge ${agentTestStatus.ok ? 'success' : 'error'}`}>
                        {agentTestStatus.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        <span>{agentTestStatus.message}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="conn-key-row">
                <label>
                  <span>Clé API DeepL (Traduction & Dictionnaire en direct)</span>
                  <div className="conn-input-action-wrap">
                    <input
                      type="password"
                      value={draft.api.deepLKey || ''}
                      onChange={(e) => {
                        updateApi('deepLKey', e.target.value)
                        setDeepLTestStatus(null)
                      }}
                      placeholder="ex. 00000000-0000-0000-0000-000000000000:fx"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="connection-test-btn-compact"
                      onClick={handleTestDeepL}
                      disabled={testingDeepL || !draft.api.deepLKey?.trim()}
                      title="Tester la clé DeepL"
                    >
                      {testingDeepL ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
                      <span>{testingDeepL ? 'Test…' : 'Tester'}</span>
                    </button>
                  </div>
                </label>
                {deepLTestStatus && (
                  <div className={`connection-status-badge ${deepLTestStatus.ok ? 'success' : 'error'}`}>
                    {deepLTestStatus.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    <span>{deepLTestStatus.message}</span>
                  </div>
                )}
              </div>

              <div className="conn-key-row">
                <label>
                  <span>Clé API ElevenLabs (Optionnel — Voix audio)</span>
                  <input
                    type="password"
                    value={draft.api.elevenLabsKey || ''}
                    onChange={(e) => updateApi('elevenLabsKey', e.target.value)}
                    placeholder="sk_…"
                    autoComplete="off"
                  />
                </label>
              </div>

              <div className="conn-key-row">
                <label>
                  <span>Clé API Fish Audio (Optionnel — Voix S2)</span>
                  <input
                    type="password"
                    value={draft.api.fishKey || ''}
                    onChange={(e) => updateApi('fishKey', e.target.value)}
                    placeholder="Clé api.fish.audio"
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 2 : MODÈLES D'IA PAR TÂCHE */}
          <div className="connection-card">
            <div>
              <h3>2. Modèles d'IA & Moteurs par tâche</h3>
              <p>Le modèle principal est utilisé par défaut. Personnalise chaque tâche sur sa ligne dédiée.</p>
            </div>

            <div className="conn-models-list">
              {/* Option 1 : Modèle Principal */}
              {(() => {
                const activeProvider = AGENT_PROVIDERS.find((p) => p.id === (draft.api.agentProvider || 'openrouter')) || AGENT_PROVIDERS[0]
                return (
                  <div className="conn-task-row is-main">
                    <div className="conn-task-info">
                      <strong>Modèle Agent Principal (Recommandé)</strong>
                      <small>Modèle général utilisé pour toutes les tâches par défaut</small>
                    </div>
                    <div className="conn-task-input-wrap">
                      <input
                        value={draft.api.agentModel || ''}
                        onChange={(e) => updateApi('agentModel', e.target.value)}
                        placeholder={activeProvider.defaultModel}
                      />
                    </div>
                  </div>
                )
              })()}

              {/* Option 2 : Rédaction de ressources */}
              <div className="conn-task-row">
                <div className="conn-task-info">
                  <strong>Rédaction de ressources (« Écrire avec l'IA »)</strong>
                  <small>Génération d'histoires et d'articles adaptés au niveau</small>
                </div>
                <div className="conn-task-input-wrap">
                  <input
                    value={draft.api.taskModelResourceGeneration || ''}
                    onChange={(e) => updateApi('taskModelResourceGeneration', e.target.value)}
                    placeholder="Utilise le modèle principal par défaut"
                  />
                </div>
              </div>

              {/* Option 3 : Analyse des mots enregistrés */}
              <div className="conn-task-row">
                <div className="conn-task-info">
                  <strong>Analyse des mots enregistrés</strong>
                  <small>Génération de phonétique IPA, lemmes, traductions et tags</small>
                </div>
                <div className="conn-task-input-wrap">
                  <input
                    value={draft.api.taskModelWordAnalysis || ''}
                    onChange={(e) => updateApi('taskModelWordAnalysis', e.target.value)}
                    placeholder="Utilise le modèle principal par défaut"
                  />
                </div>
              </div>

              {/* Option 4 : Extraction URL */}
              <div className="conn-task-row">
                <div className="conn-task-info">
                  <strong>Extraction et nettoyage URL (Web Cleaner)</strong>
                  <small>Nettoyage intelligent des pages web (retrait des pubs et menus)</small>
                </div>
                <div className="conn-task-input-wrap">
                  <input
                    value={draft.api.taskModelUrlExtraction || ''}
                    onChange={(e) => updateApi('taskModelUrlExtraction', e.target.value)}
                    placeholder="Utilise le modèle principal par défaut"
                  />
                </div>
              </div>

              {/* Option 5 : Traduction Speaking */}
              <div className="conn-task-row">
                <div className="conn-task-info">
                  <strong>Traduction dans Speaking</strong>
                  <small>Traduction en direct lors des sessions orales</small>
                </div>
                <div className="conn-task-input-wrap dual">
                  <select
                    value={draft.api.speakingTranslationProvider || 'deepl'}
                    onChange={(e) => updateApi('speakingTranslationProvider', e.target.value as 'deepl' | 'ai')}
                  >
                    <option value="deepl">DeepL (par défaut)</option>
                    <option value="ai">Agent IA</option>
                  </select>
                  {draft.api.speakingTranslationProvider === 'ai' && (
                    <input
                      value={draft.api.taskModelSpeakingTranslation || ''}
                      onChange={(e) => updateApi('taskModelSpeakingTranslation', e.target.value)}
                      placeholder="Utilise le modèle principal par défaut"
                    />
                  )}
                </div>
              </div>

              {/* Option 6 : Synthèse Vocale (TTS) */}
              <div className="conn-task-row">
                <div className="conn-task-info">
                  <strong>Synthèse Vocale (TTS)</strong>
                  <small>Lecture audio de la prononciation et des phrases</small>
                </div>
                <div className="conn-task-input-wrap dual">
                  <select
                    value={draft.api.ttsProvider || 'google'}
                    onChange={(e) => {
                      updateApi('ttsProvider', e.target.value as UserSettings['api']['ttsProvider'])
                      setTtsTestStatus(null)
                    }}
                  >
                    {TTS_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {draft.api.ttsProvider === 'openrouter' && (
                    <input
                      value={draft.api.ttsModel || ''}
                      onChange={(e) => updateApi('ttsModel', e.target.value)}
                      placeholder="openai/gpt-4o-mini-tts-2025-12-15"
                    />
                  )}
                  {draft.api.ttsProvider === 'elevenlabs' && (
                    <input
                      value={draft.api.elevenLabsVoice || ''}
                      onChange={(e) => updateApi('elevenLabsVoice', e.target.value)}
                      placeholder="ID de voix (ex. 21m00Tcm4TlvDq8ikWAM)"
                    />
                  )}
                </div>
              </div>

              {/* Test TTS row */}
              <div className="connection-test-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="connection-test-btn"
                  onClick={handleTestTts}
                  disabled={testingTts || (draft.api.ttsProvider === 'openrouter' && !draft.api.openRouterKey?.trim())}
                  title="Génère et joue un court extrait audio en direct"
                >
                  {testingTts ? <Loader2 size={13} className="spin" /> : <Volume2 size={13} />}
                  <span>{testingTts ? 'Génération audio…' : 'Tester la synthèse vocale (TTS)'}</span>
                </button>

                {ttsTestStatus && (
                  <div className={`connection-status-badge ${ttsTestStatus.ok ? 'success' : 'error'}`}>
                    {ttsTestStatus.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    <span>{ttsTestStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>}

        {tab === 'data' && <>
          <SettingHeading title="Tes données" detail="Ressources, deck, écrits et réglages sont stockés localement dans ce navigateur." />
          <div className="data-card"><h3>Local par défaut</h3><p>Pas de compte, pas d’envoi caché. Caméra et micro ne sont demandés qu’au moment où tu démarres une session.</p></div>
          <div className="danger-zone"><div><h3>Repartir de zéro</h3><p>Supprime les ressources, mots, écrits, réglages et l’historique de ce navigateur.</p></div>{confirmingReset ? <div className="confirm-row"><button className="outline" onClick={() => setConfirmingReset(false)}>Annuler</button><button className="danger" onClick={onResetData}>Supprimer les données</button></div> : <button className="outline" onClick={() => setConfirmingReset(true)}>Réinitialiser…</button>}</div>
        </>}
      </section>
    </div>
  </div>
}

function SettingHeading({ title, detail }: { title: string; detail: string }) { return <header className="setting-heading"><h2>{title}</h2><p>{detail}</p></header> }
