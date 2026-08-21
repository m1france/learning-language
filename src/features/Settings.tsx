import React, { useEffect, useState } from 'react'
import type { AppState, Language, UiLanguage, UserSettings } from '../domain'
import { UI_LANGUAGES } from '../i18n'
import { listVoices } from '../ai'
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
} from 'lucide-react'

type SettingsProps = {
  settings: UserSettings
  state: AppState
  onSave: (settings: UserSettings) => void
  onChangeState: (state: AppState) => void
  onResetData: () => void
}

type Tab = 'profile' | 'reading' | 'markings' | 'shortcuts' | 'tags' | 'connections' | 'data'

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
  { id: 'elevenlabs', name: 'ElevenLabs', detail: 'Voix IA haut de gamme. Colle ta clé API ElevenLabs ci-dessous.' },
  { id: 'fish', name: 'Fish Audio', detail: 'S2.1 et autres modèles Fish, avec ta clé API Fish Audio directe.' },
  { id: 'openrouter', name: 'OpenRouter (modèle audio)', detail: 'Un modèle compatible sortie audio via ta clé OpenRouter (ex. openai/gpt-4o-audio-preview).' },
  { id: 'browser', name: 'Voix du navigateur', detail: 'Fonctionne hors ligne, qualité variable selon l’appareil.' },
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

  const [newMarkingLabel, setNewMarkingLabel] = useState('')
  const [newMarkingColor, setNewMarkingColor] = useState('#2563eb')
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null)
  const [editingMarkValue, setEditingMarkValue] = useState('')

  const [recordingTool, setRecordingTool] = useState<string | null>(null)

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
    { id: 'tags', icon: <Tag size={16} />, label: 'Tags' },
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
              <input
                type="text"
                placeholder="Nouveau marquage (ex. Proposition, Connecteur, Idiome...)"
                value={newMarkingLabel}
                onChange={(event) => setNewMarkingLabel(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleAddMarking() }}
              />
              <input
                type="color"
                value={newMarkingColor}
                onChange={(event) => setNewMarkingColor(event.target.value)}
                style={{ width: 40, height: 38, borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', padding: 2, background: 'var(--white)' }}
                title="Choisir la couleur"
              />
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
                      <div className="marking-reorder-btns">
                        <button
                          type="button"
                          className="marking-reorder-btn"
                          title="Monter"
                          disabled={index === 0}
                          onClick={() => onChangeState(reorderMarkings(state, index, index - 1))}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="marking-reorder-btn"
                          title="Descendre"
                          disabled={index === allMarkings.length - 1}
                          onClick={() => onChangeState(reorderMarkings(state, index, index + 1))}
                        >
                          <ChevronDown size={13} />
                        </button>
                      </div>

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

        {tab === 'tags' && <>
          <SettingHeading title="Gestion des tags" detail="Organise tes mots avec des tags personnalisés. Tu peux ajouter, renommer ou supprimer des tags existants." />
          <div className="settings-tags-section">
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
                  const isEditing = editingTag === tag

                  return (
                    <div key={tag} className="tag-mgmt-card">
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
                        <div className="tag-card-content">
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
                          <button
                            className="tag-icon-btn delete"
                            title="Supprimer le tag"
                            aria-label="Supprimer le tag"
                            onClick={() => handleDeleteTag(tag)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>}

        {tab === 'connections' && <>
          <SettingHeading title="Connexions" detail="Les clés restent dans ce navigateur. Laisse vide pour utiliser les solutions gratuites." />
          
          <div className="connection-card">
            <div>
              <h3>Choix modèle Agent principal</h3>
              <p>Sélectionne le fournisseur d'IA qui pilotera les fonctionnalités intelligentes (analyse de mots, aide à l'apprentissage).</p>
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
                    }}
                  >
                    <strong>{provider.name}</strong>
                    <p>{provider.detail}</p>
                  </button>
                )
              })}
            </div>

            {(() => {
              const activeProvider = AGENT_PROVIDERS.find((p) => p.id === (draft.api.agentProvider || 'openrouter')) || AGENT_PROVIDERS[0]
              return (
                <>
                  <label>
                    {activeProvider.keyLabel}
                    <input
                      type="password"
                      value={(draft.api[activeProvider.keyField] as string) || ''}
                      onChange={(event) => updateApi(activeProvider.keyField, event.target.value)}
                      placeholder={activeProvider.keyPlaceholder}
                      autoComplete="off"
                    />
                  </label>
                  {activeProvider.keyHint && <p className="field-hint">{activeProvider.keyHint}</p>}

                  <label>
                    Modèle souhaité
                    <input
                      value={draft.api.agentModel || ''}
                      onChange={(event) => updateApi('agentModel', event.target.value)}
                      placeholder={activeProvider.defaultModel}
                    />
                  </label>
                  <p className="field-hint">Exemples : <code>{activeProvider.examples}</code></p>
                </>
              )
            })()}
          </div>

          <div className="connection-card">
            <div><h3>Voix (TTS)</h3><p>Choisis le fournisseur qui lit les textes à voix haute, puis colle la clé correspondante si besoin.</p></div>
            <div className="preset-grid">
              {TTS_PROVIDERS.map((provider) => <button key={provider.id} className={draft.api.ttsProvider === provider.id ? 'preset-card selected' : 'preset-card'} onClick={() => updateApi('ttsProvider', provider.id)}>
                <strong>{provider.name}</strong><p>{provider.detail}</p>
              </button>)}
            </div>
            {draft.api.ttsProvider === 'elevenlabs' && <>
              <label>Clé API ElevenLabs<input type="password" value={draft.api.elevenLabsKey} onChange={(event) => updateApi('elevenLabsKey', event.target.value)} placeholder="sk_…" autoComplete="off" /></label>
              <label>ID de voix <small>ex. 21m00Tcm4TlvDq8ikWAM (Rachel)</small><input value={draft.api.elevenLabsVoice} onChange={(event) => updateApi('elevenLabsVoice', event.target.value)} /></label>
            </>}
            {draft.api.ttsProvider === 'fish' && <>
              <label>Clé API Fish Audio<input type="password" value={draft.api.fishKey} onChange={(event) => updateApi('fishKey', event.target.value)} placeholder="Clé api.fish.audio" autoComplete="off" /></label>
              <label>ID de voix / modèle <small>optionnel — reference_id</small><input value={draft.api.fishReferenceId} onChange={(event) => updateApi('fishReferenceId', event.target.value)} placeholder="Laisser vide pour la voix S2 par défaut" /></label>
            </>}
            {draft.api.ttsProvider === 'openrouter' && <>
              <label>Modèle audio OpenRouter<input value={draft.api.ttsModel} onChange={(event) => updateApi('ttsModel', event.target.value)} placeholder="openai/gpt-4o-audio-preview" /></label>
              <p className="field-hint">Nécessite ta clé OpenRouter (renseignée dans la carte Agent principal ci-dessus) et un modèle qui accepte la sortie audio.</p>
            </>}
            {draft.api.ttsProvider === 'browser' && voices.length > 0 && <label>Voix préférée<select value={draft.api.ttsVoice} onChange={(event) => updateApi('ttsVoice', event.target.value)}>
              <option value="">Automatique (la plus naturelle)</option>
              {voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>)}
            </select></label>}
          </div>

          <div className="connection-card">
            <div><h3>DeepL (Traduction & Dictionnaire)</h3><p>Utilisé pour la recherche rapide et la traduction en direct durant tes sessions de parole.</p></div>
            <label>Clé API DeepL <small>Free (termine par :fx) ou Pro</small><input type="password" value={draft.api.deepLKey || ''} onChange={(event) => updateApi('deepLKey', event.target.value)} placeholder="ex. 00000000-0000-0000-0000-000000000000:fx" autoComplete="off" /></label>
            <label>Langue de traduction cible
              <select value={draft.api.deepLTargetLang || 'EN-US'} onChange={(event) => updateApi('deepLTargetLang', event.target.value)}>
                <option value="EN-US">Anglais américain (EN-US)</option>
                <option value="EN-GB">Anglais britannique (EN-GB)</option>
                <option value="ES">Espagnol (ES)</option>
                <option value="DE">Allemand (DE)</option>
                <option value="IT">Italien (IT)</option>
                <option value="PT-PT">Portugais européen (PT-PT)</option>
                <option value="PT-BR">Portugais brésilien (PT-BR)</option>
                <option value="NL">Néerlandais (NL)</option>
                <option value="PL">Polonais (PL)</option>
                <option value="RU">Russe (RU)</option>
                <option value="JA">Japonais (JA)</option>
                <option value="ZH">Chinois simplifié (ZH)</option>
              </select>
            </label>
            <p className="field-hint">Obtiens une clé gratuite sur <code>deepl.com/pro-api</code>. Si vide, un service de secours est utilisé.</p>
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
