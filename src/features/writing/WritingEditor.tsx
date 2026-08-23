import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, LearnedWord, WritingEntry } from '../../domain'
import { id, todayKey } from '../../domain'
import { WordBricksTray } from './WordBricksTray'
import { WritingSetupModal } from './WritingSetupModal'
import { checkUsedWords } from './wordMatcher'
import { downloadAnkiExport } from '../vocabulary/ankiExporter'
import { DEFAULT_PROMPTS_DATA, type DefaultPromptWord } from '../../data'
import { renderStyledMarkdown } from '../vocabulary/phoneticUtils'
import {
  ArrowLeft,
  Check,
  Save,
  Video,
  Clock,
  Sparkles,
  Download,
  Copy,
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
  const [activeDrawerTab, setActiveDrawerTab] = useState<'connectors' | 'vocab'>('connectors')

  // Setup modal for new writing sessions
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(() => !initialEntry)

  // Sprint Timer
  const [sprintMinutes, setSprintMinutes] = useState<number>(
    config.sprintDurationMinutes || 5,
  )
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() =>
    config.mode === 'sprint' ? (config.sprintDurationMinutes || 5) * 60 : null,
  )
  const [isSprintActive, setIsSprintActive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Map of saved word details for fast lookup (combining default prompts and user's saved words)
  const wordDetailsMap = useMemo(() => {
    const map = new Map<string, LearnedWord | DefaultPromptWord>()
    // 1. Seed with rich default prompt definitions
    DEFAULT_PROMPTS_DATA.forEach((dp) => {
      map.set(dp.word.toLowerCase().trim(), dp)
      map.set(dp.normalized.toLowerCase().trim(), dp)
    })
    // 2. Override with user's saved words
    ;(state.words ?? []).forEach((w) => {
      if (!w.language || w.language === learningLang) {
        map.set(w.word.toLowerCase().trim(), w)
        map.set(w.normalized.toLowerCase().trim(), w)
      }
    })
    return map
  }, [state.words, learningLang])

  // Words available for "Mon Vocabulaire" tab
  const savedUserWords = useMemo(
    () => (state.words ?? []).filter((w) => !w.language || w.language === learningLang),
    [state.words, learningLang],
  )

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
    const pool = savedUserWords.length > 0 ? savedUserWords : DEFAULT_PROMPTS_DATA
    const available = pool.filter((w) => !promptWords.includes(w.word))
    if (!available.length) return
    const randomWord = available[Math.floor(Math.random() * available.length)].word
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

          {/* Quick Target Words Completion */}
          {promptWords.length > 0 && (
            <div className="writing-quick-stats">
              <span
                className={`stat-pill completion ${
                  usedWords.length === promptWords.length ? 'all-done' : ''
                }`}
              >
                {usedWords.length}/{promptWords.length} cibles
              </span>
            </div>
          )}

          <button
            type="button"
            className="outline drawer-toggle-btn"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            title="Boîte à outils de connecteurs et vocabulaire"
          >
            <Sparkles size={15} />
            <span>Aide</span>
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
        <div className={isConfigModalOpen ? 'workspace-blurred' : ''}>
          <WordBricksTray
            words={promptWords}
            usedWords={usedWords}
            wordDetailsMap={wordDetailsMap as unknown as Map<string, LearnedWord>}
            language={learningLang}
            api={state.settings.api}
            onReplaceWord={handleReplaceWord}
            onRemoveWord={handleRemoveWord}
          />
        </div>
      )}

      {/* Main Workspace Layout */}
      <div
        className={`writing-workspace-body ${isDrawerOpen ? 'drawer-open' : ''} ${
          isConfigModalOpen ? 'workspace-blurred' : ''
        }`}
      >
        {/* Editor Main Textarea */}
        <div className="editor-main-area">
          <textarea
            ref={textareaRef}
            className="writing-textarea"
            placeholder="Commence à rédiger ici... Intègre les mots cibles au fur et à mesure."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus={!isConfigModalOpen}
            disabled={isConfigModalOpen}
          />

          <footer className="editor-bottom-bar">
            <div className="bottom-meta">
              <span>{stats.words} mots</span>
              <span>·</span>
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

        {/* Side Drawer (Connectors & Vocabulary) */}
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
                Mon Vocabulaire ({savedUserWords.length || DEFAULT_PROMPTS_DATA.length})
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
                    {savedUserWords.length > 0
                      ? 'Mots enregistrés depuis tes lectures. Clique pour insérer :'
                      : 'Mots recommandés. Enregistre des mots lors de tes lectures pour enrichir ton coffre :'}
                  </p>
                  <div className="saved-vocab-list">
                    {(savedUserWords.length > 0 ? savedUserWords : DEFAULT_PROMPTS_DATA)
                      .slice(0, 50)
                      .map((w) => (
                        <div key={w.id} className="saved-word-row">
                          <button
                            type="button"
                            className="insert-word-btn"
                            onClick={() => handleInsertText(w.word)}
                          >
                            <strong>{w.word}</strong>
                            {w.translation && <small>({renderStyledMarkdown(w.translation)})</small>}
                          </button>
                          {w.contextSentence && (
                            <span className="word-ctx" title={w.contextSentence}>
                              « {w.contextSentence.slice(0, 50)}... »
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Setup Modal Overlay (if configuring new session) */}
      {isConfigModalOpen && (
        <WritingSetupModal
          mode={config.mode}
          state={state}
          promptWords={promptWords}
          onUpdatePromptWords={(words) => {
            setPromptWords(words)
            setTitle(`Défi Vocabulaire (${words.length} mots)`)
          }}
          sprintMinutes={sprintMinutes}
          onUpdateSprintMinutes={(mins) => {
            setSprintMinutes(mins)
            setSecondsRemaining(mins * 60)
            setTitle(`Sprint Écriture · ${mins} min`)
          }}
          title={title}
          onUpdateTitle={setTitle}
          onStart={() => {
            setIsConfigModalOpen(false)
            if (config.mode === 'sprint') {
              setIsSprintActive(true)
            }
            setTimeout(() => {
              textareaRef.current?.focus()
            }, 50)
          }}
          onCancel={onBack}
        />
      )}
    </div>
  )
}
