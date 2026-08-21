import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, LearnedWord, WritingEntry } from '../../domain'
import { id, todayKey } from '../../domain'
import { WordBricksTray } from './WordBricksTray'
import { checkUsedWords } from './wordMatcher'
import { downloadAnkiExport, syncWithAnkiConnect } from '../vocabulary/ankiExporter'
import {
  ArrowLeft,
  Check,
  Save,
  Send,
  Video,
  Clock,
  Sparkles,
  Download,
  Copy,
  BookOpen,
  Tag,
  Share2,
  Layers,
  HelpCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { WritingConfig } from './WritingPromptSelector'

type WritingEditorProps = {
  config: WritingConfig
  state: AppState
  initialEntry?: WritingEntry
  onSave: (entry: WritingEntry) => void
  onBack: () => void
  onNavigateToSpeaking?: (text: string) => void
}

// Common logical connectors for English and French
const CONNECTORS: Record<'en' | 'fr', { category: string; words: string[] }[]> = {
  en: [
    { category: 'Addition', words: ['Furthermore', 'Moreover', 'In addition', 'Besides', 'Not to mention'] },
    { category: 'Contrast', words: ['However', 'Nevertheless', 'On the other hand', 'Yet', 'Although'] },
    { category: 'Cause & Effect', words: ['Consequently', 'Therefore', 'As a result', 'Thus', 'Owing to'] },
    { category: 'Conclusion', words: ['In summary', 'Ultimately', 'All things considered', 'In essence'] },
  ],
  fr: [
    { category: 'Addition', words: ['De plus', 'En outre', 'Par ailleurs', 'D’un autre côté', 'Qui plus est'] },
    { category: 'Opposition', words: ['Cependant', 'Néanmoins', 'Toutefois', 'En revanche', 'Bien que'] },
    { category: 'Conséquence', words: ['Par conséquent', 'C’est pourquoi', 'Dès lors', 'Ainsi', 'En somme'] },
    { category: 'Conclusion', words: ['Pour conclure', 'En définitive', 'Tout compte fait', 'Au fond'] },
  ],
}

export function WritingEditor({
  config,
  state,
  initialEntry,
  onSave,
  onBack,
  onNavigateToSpeaking,
}: WritingEditorProps) {
  const learningLang = state.settings.learningLanguage
  const [title, setTitle] = useState(initialEntry?.title || config.title)
  const [content, setContent] = useState(initialEntry?.content || '')
  const [promptWords, setPromptWords] = useState<string[]>(
    initialEntry?.promptWords || config.promptWords,
  )
  const [savedBadge, setSavedBadge] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activeDrawerTab, setActiveDrawerTab] = useState<'connectors' | 'vocab' | 'anki'>('connectors')
  const [ankiStatus, setAnkiStatus] = useState<string | null>(null)

  // Sprint Timer
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() =>
    config.mode === 'sprint' && config.sprintDurationMinutes
      ? config.sprintDurationMinutes * 60
      : null,
  )
  const [isSprintActive, setIsSprintActive] = useState(config.mode === 'sprint')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Map of saved word details for fast lookup
  const wordDetailsMap = useMemo(() => {
    const map = new Map<string, LearnedWord>()
    state.words.forEach((w) => {
      if (w.language === learningLang) {
        map.set(w.word.toLowerCase().trim(), w)
        map.set(w.normalized, w)
      }
    })
    return map
  }, [state.words, learningLang])

  // Live match of used target words
  const { used: usedWords } = useMemo(
    () => checkUsedWords(promptWords, content),
    [promptWords, content],
  )

  // Word & character stats
  const stats = useMemo(() => {
    const trimmed = content.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    const chars = content.length
    const readingTimeMins = Math.max(1, Math.ceil(words / 180))
    return { words, chars, readingTimeMins }
  }, [content])

  // Sprint timer interval
  useEffect(() => {
    if (!isSprintActive || secondsRemaining === null) return
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          setIsSprintActive(false)
          return 0
        }
        return prev - 1
      })
      setElapsedSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [isSprintActive, secondsRemaining])

  // Replace a target word
  const handleReplaceWord = (index: number) => {
    const pool = (state.words ?? []).filter(
      (w) => w.language === learningLang && !promptWords.includes(w.word),
    )
    if (!pool.length) return
    const randomWord = pool[Math.floor(Math.random() * pool.length)].word
    const updated = [...promptWords]
    updated[index] = randomWord
    setPromptWords(updated)
  }

  // Remove a target word
  const handleRemoveWord = (index: number) => {
    setPromptWords(promptWords.filter((_, i) => i !== index))
  }

  // Insert text at cursor
  const handleInsertText = (textToInsert: string) => {
    if (!textareaRef.current) return
    const area = textareaRef.current
    const start = area.selectionStart
    const end = area.selectionEnd
    const nextContent =
      content.substring(0, start) + textToInsert + ' ' + content.substring(end)
    setContent(nextContent)
    setTimeout(() => {
      area.focus()
      area.selectionStart = area.selectionEnd = start + textToInsert.length + 1
    }, 20)
  }

  // Save current writing entry
  const handleSave = () => {
    const entry: WritingEntry = {
      id: initialEntry?.id || id('writing'),
      title: title.trim() || 'Sans titre',
      date: todayKey(),
      mode: config.mode,
      promptWords,
      wordsUsed: usedWords,
      content,
      published: true,
      cosignCount: 0,
      coSigned: false,
      wordCount: stats.words,
      timeSpentSeconds: elapsedSeconds,
      topicId: config.topicId,
      topicTitle: config.topicTitle,
      createdAt: initialEntry?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    onSave(entry)
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 2200)
  }

  // Send to speaking teleprompter
  const handleSendToPrompter = () => {
    handleSave()
    if (onNavigateToSpeaking) {
      onNavigateToSpeaking(content)
    }
  }

  // Copy text
  const handleCopy = () => {
    void navigator.clipboard.writeText(content)
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 1500)
  }

  // Anki Export
  const handleAnkiExport = () => {
    const wordsToExport = promptWords
      .map((pw) => wordDetailsMap.get(pw.toLowerCase().trim()))
      .filter((w): w is LearnedWord => Boolean(w))
    downloadAnkiExport(
      wordsToExport.length ? wordsToExport : state.words,
      state.resources,
      `anki-session-${todayKey()}.tsv`,
    )
  }

  // AnkiConnect direct sync
  const handleAnkiConnectSync = async () => {
    setAnkiStatus('Synchronisation en cours…')
    const wordsToExport = promptWords
      .map((pw) => wordDetailsMap.get(pw.toLowerCase().trim()))
      .filter((w): w is LearnedWord => Boolean(w))
    const result = await syncWithAnkiConnect(
      wordsToExport.length ? wordsToExport : state.words,
    )
    if (result.success) {
      setAnkiStatus(`✓ ${result.count || 0} cartes synchronisées avec Anki !`)
    } else {
      setAnkiStatus(`⚠️ ${result.error}`)
    }
  }

  // Format seconds mm:ss
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="writing-editor-view">
      {/* Top Header */}
      <header className="writing-editor-header">
        <div className="header-left">
          <button type="button" className="outline icon-btn" onClick={onBack} title="Retour">
            <ArrowLeft size={16} />
          </button>
          <div className="title-block">
            <input
              type="text"
              className="editable-session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de la session..."
            />
            <span className="mode-pill-badge">
              {config.mode === 'reactivation'
                ? 'ÉTUDIER LES MOTS'
                : config.mode === 'sprint'
                ? 'CHRONOMÉTRÉ'
                : 'ÉCRITURE LIBRE'}
            </span>
          </div>
        </div>

        <div className="header-right">
          {/* Sprint Timer Badge */}
          {secondsRemaining !== null && (
            <div className={`sprint-countdown-badge ${secondsRemaining < 60 ? 'urgent' : ''}`}>
              <Clock size={14} />
              <span>{formatTimer(secondsRemaining)}</span>
            </div>
          )}

          {/* Quick Word Count & Completion */}
          <div className="writing-quick-stats">
            <span className="stat-pill">{stats.words} mots</span>
            {promptWords.length > 0 && (
              <span className={`stat-pill completion ${usedWords.length === promptWords.length ? 'all-done' : ''}`}>
                {usedWords.length}/{promptWords.length} cibles
              </span>
            )}
          </div>

          <button
            type="button"
            className="outline drawer-toggle-btn"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            title="Boîte à outils de vocabulaire & connecteurs"
          >
            <Sparkles size={15} />
            <span>Aide & Vocabulaire</span>
          </button>

          <button
            type="button"
            className="outline save-btn"
            onClick={handleSave}
            title="Enregistrer"
          >
            {savedBadge ? <Check size={16} className="text-green" /> : <Save size={16} />}
            <span>{savedBadge ? 'Enregistré !' : 'Sauvegarder'}</span>
          </button>

          {onNavigateToSpeaking && content.trim().length > 0 && (
            <button
              type="button"
              className="primary prompter-export-btn"
              onClick={handleSendToPrompter}
              title="Envoyer ce texte au prompteur du studio Parler"
            >
              <Video size={16} />
              <span>Pratiquer à l'oral</span>
            </button>
          )}
        </div>
      </header>

      {/* Target Word Bricks (if any) */}
      {promptWords.length > 0 && (
        <WordBricksTray
          words={promptWords}
          usedWords={usedWords}
          wordDetailsMap={wordDetailsMap}
          language={learningLang}
          api={state.settings.api}
          onReplaceWord={handleReplaceWord}
          onRemoveWord={handleRemoveWord}
        />
      )}

      {/* Main Workspace Layout */}
      <div className={`writing-workspace-body ${isDrawerOpen ? 'drawer-open' : ''}`}>
        {/* Editor Main Textarea */}
        <div className="editor-main-area">
          <textarea
            ref={textareaRef}
            className="writing-textarea"
            placeholder="Commence à rédiger ici... Intègre les mots cibles au fur et à mesure."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
          />

          <footer className="editor-bottom-bar">
            <div className="bottom-meta">
              <span>{stats.chars} caractères</span>
              <span>·</span>
              <span>~{stats.readingTimeMins} min de lecture</span>
              {usedWords.length === promptWords.length && promptWords.length > 0 && (
                <span className="all-words-badge">
                  <Check size={13} /> Tous les mots placés !
                </span>
              )}
            </div>

            <div className="bottom-actions">
              <button
                type="button"
                className="text-btn"
                onClick={handleCopy}
                title="Copier le texte"
              >
                <Copy size={13} />
                <span>Copier</span>
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={handleAnkiExport}
                title="Télécharger l'export Anki TSV"
              >
                <Download size={13} />
                <span>Export Anki</span>
              </button>
            </div>
          </footer>
        </div>

        {/* Side Drawer (Connectors, Vocabulary Vault, Anki) */}
        {isDrawerOpen && (
          <aside className="writing-side-drawer">
            <div className="drawer-tabs">
              <button
                type="button"
                className={`drawer-tab ${activeDrawerTab === 'connectors' ? 'active' : ''}`}
                onClick={() => setActiveDrawerTab('connectors')}
              >
                Connecteurs
              </button>
              <button
                type="button"
                className={`drawer-tab ${activeDrawerTab === 'vocab' ? 'active' : ''}`}
                onClick={() => setActiveDrawerTab('vocab')}
              >
                Mon Vocabulaire
              </button>
              <button
                type="button"
                className={`drawer-tab ${activeDrawerTab === 'anki' ? 'active' : ''}`}
                onClick={() => setActiveDrawerTab('anki')}
              >
                Anki
              </button>
            </div>

            <div className="drawer-content">
              {/* TAB 1: CONNECTEURS */}
              {activeDrawerTab === 'connectors' && (
                <div className="connectors-tab">
                  <p className="tab-hint">Clique sur un connecteur pour l'insérer dans ton texte :</p>
                  {(CONNECTORS[learningLang] || CONNECTORS.fr).map((group) => (
                    <div key={group.category} className="connector-group">
                      <h6>{group.category}</h6>
                      <div className="connector-chips">
                        {group.words.map((cw) => (
                          <button
                            key={cw}
                            type="button"
                            className="connector-chip"
                            onClick={() => handleInsertText(cw)}
                          >
                            + {cw}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 2: MON VOCABULAIRE */}
              {activeDrawerTab === 'vocab' && (
                <div className="vocab-tab">
                  <p className="tab-hint">
                    Mots enregistrés depuis tes lectures. Clique pour insérer :
                  </p>
                  <div className="saved-vocab-list">
                    {(state.words ?? [])
                      .filter((w) => w.language === learningLang)
                      .slice(0, 30)
                      .map((w) => (
                        <div key={w.id} className="saved-word-row">
                          <button
                            type="button"
                            className="insert-word-btn"
                            onClick={() => handleInsertText(w.word)}
                          >
                            <strong>{w.word}</strong>
                            {w.translation && <small>({w.translation})</small>}
                          </button>
                          {w.contextSentence && (
                            <span className="word-ctx" title={w.contextSentence}>
                              « {w.contextSentence.slice(0, 45)}... »
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* TAB 3: ANKI */}
              {activeDrawerTab === 'anki' && (
                <div className="anki-tab">
                  <h6>Exportation & Synchronisation Anki</h6>
                  <p className="tab-hint">
                    Exporte les mots de cette session ou l'intégralité de ton coffre de vocabulaire.
                  </p>

                  <div className="anki-actions">
                    <button
                      type="button"
                      className="primary full"
                      onClick={handleAnkiExport}
                    >
                      <Download size={14} />
                      <span>Télécharger le fichier Anki (.tsv)</span>
                    </button>

                    <button
                      type="button"
                      className="outline full"
                      onClick={() => void handleAnkiConnectSync()}
                    >
                      <Sparkles size={14} />
                      <span>Synchroniser avec AnkiConnect</span>
                    </button>
                  </div>

                  {ankiStatus && <p className="anki-status-msg">{ankiStatus}</p>}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
