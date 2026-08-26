import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, LearnedWord, WritingEntry } from '../../domain'
import { id, todayKey } from '../../domain'
import { WordBricksTray } from './WordBricksTray'
import { checkUsedWords } from './wordMatcher'
import { DEFAULT_PROMPTS_DATA, type DefaultPromptWord } from '../../data'
import { renderStyledMarkdown } from '../vocabulary/phoneticUtils'
import {
  Plus,
  Check,
  Save,
  Video,
  Clock,
  Sparkles,
  Copy,
  Calendar,
  Edit2,
  Trash2,
  Languages,
  Loader2,
  AlertCircle,
  Pencil,
} from 'lucide-react'
import type { WritingConfig } from './WritingPromptSelector'
import {
  analyzeWritingWithAi,
  type WritingCorrectionResult,
  type CorrectionItem,
} from './writingCorrectionAiService'
import { WritingCorrectionOverlay } from './WritingCorrectionOverlay'

type WritingEditorProps = {
  config: WritingConfig
  state: AppState
  initialEntry?: WritingEntry
  onSave: (entry: WritingEntry) => void
  onSelectEntry?: (entry: WritingEntry) => void
  onDeleteEntry?: (id: string) => void
  onNewSession?: () => void
  onNavigateToSpeaking?: (text: string) => void
  onDraftStateChange?: (guardState: { hasDraftMoreThan10Words: boolean; saveDraft: () => void } | null) => void
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
  onSelectEntry,
  onDeleteEntry,
  onNewSession,
  onNavigateToSpeaking,
  onDraftStateChange,
}: WritingEditorProps) {
  const learningLang = state.settings.learningLanguage
  const [title, setTitle] = useState(initialEntry?.title || config.title)
  const [isTitleLocked, setIsTitleLocked] = useState(() => {
    // Lock if editing an existing entry with a real title, or if title is not default
    const t = initialEntry?.title || config.title
    return t !== 'Mon texte' && t.trim().length > 0
  })
  const [content, setContent] = useState(initialEntry?.content || '')
  const [promptWords, setPromptWords] = useState<string[]>(
    initialEntry?.promptWords || config.promptWords,
  )
  const [savedBadge, setSavedBadge] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activeDrawerTab, setActiveDrawerTab] = useState<'connectors' | 'vocab'>('connectors')
  const [showNewConfirmModal, setShowNewConfirmModal] = useState(false)

  // Sprint Timer (for existing sprint entries, if any)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() =>
    config.mode === 'sprint' ? (config.sprintDurationMinutes || 5) * 60 : null,
  )
  const [isSprintActive, setIsSprintActive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // AI Correction State
  const [isCorrecting, setIsCorrecting] = useState(false)
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [correctionResult, setCorrectionResult] = useState<WritingCorrectionResult | null>(null)
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false)
  const [isEditorRawView, setIsEditorRawView] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Map of saved word details for fast lookup
  const wordDetailsMap = useMemo(() => {
    const map = new Map<string, LearnedWord | DefaultPromptWord>()
    DEFAULT_PROMPTS_DATA.forEach((dp) => {
      map.set(dp.word.toLowerCase().trim(), dp)
      map.set(dp.normalized.toLowerCase().trim(), dp)
    })
      ; (state.words ?? []).forEach((w) => {
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

  // Current session stats
  const stats = useMemo(() => {
    const trimmed = content.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    const chars = content.length
    const readingTimeMins = Math.max(1, Math.ceil(words / 180))
    return { words, chars, readingTimeMins }
  }, [content])

  // Total global stats across all saved writings (unique words count)
  const globalStats = useMemo(() => {
    const writings = state.writings ?? []
    const totalWritings = writings.length
    let totalChars = 0
    const uniqueWordsSet = new Set<string>()

    writings.forEach((entry) => {
      const text = entry.content || ''
      totalChars += text.length
      const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu)
      if (words) {
        words.forEach((w) => uniqueWordsSet.add(w))
      }
    })

    return {
      totalWritings,
      totalChars,
      totalUniqueWords: uniqueWordsSet.size,
    }
  }, [state.writings])

  // Save current writing entry and create a new text
  const handleSave = () => {
    const entry: WritingEntry = {
      id: initialEntry?.id || id('writing'),
      title: title.trim() || 'Mon texte',
      date: initialEntry?.date || todayKey(),
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
    handleResetText()
    setTimeout(() => setSavedBadge(false), 2200)
  }

  // Warn on window/tab reload if text > 10 words
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stats.words > 10) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [stats.words])

  // Inform parent of draft state for in-app page navigation warnings
  useEffect(() => {
    if (onDraftStateChange) {
      onDraftStateChange({
        hasDraftMoreThan10Words: stats.words > 10,
        saveDraft: handleSave,
      })
    }
  }, [stats.words, content, title, onDraftStateChange])

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

  // Clear text to start fresh
  const handleResetText = () => {
    setTitle('Mon texte')
    setContent('')
    setPromptWords([])
    onNewSession?.()
  }

  // Handle "Nouveau texte" button click
  const handleNewTextClick = () => {
    if (content.trim().length > 0) {
      setShowNewConfirmModal(true)
    } else {
      handleResetText()
    }
  }

  // Send to speaking teleprompter
  const handleSendToPrompter = () => {
    handleSave()
    if (onNavigateToSpeaking) {
      onNavigateToSpeaking(content)
    }
  }

  // AI Writing Correction Handler
  const handleAiCorrection = async () => {
    if (!content.trim()) {
      setCorrectionError('Écris d’abord quelques phrases avant de lancer la correction IA.')
      setTimeout(() => setCorrectionError(null), 4000)
      return
    }

    // If already open with same text and not in error, toggle view
    if (isCorrectionOpen && correctionResult && !correctionError) {
      setIsEditorRawView(!isEditorRawView)
      return
    }

    setIsCorrecting(true)
    setCorrectionError(null)

    const res = await analyzeWritingWithAi({
      text: content,
      learningLanguage: learningLang,
      uiLanguage: state.settings.uiLanguage,
      api: state.settings.api,
    })

    setIsCorrecting(false)

    if (res.ok) {
      setCorrectionResult(res.result)
      setIsCorrectionOpen(true)
      setIsEditorRawView(false)
    } else {
      setCorrectionError(res.error)
      setTimeout(() => setCorrectionError(null), 6000)
    }
  }

  const handleApplyAllCorrection = (newFullText: string) => {
    setContent(newFullText)
    setSavedBadge(false)
    if (correctionResult) {
      setCorrectionResult({
        ...correctionResult,
        originalText: newFullText,
        corrections: [],
        overallFeedback: 'Toutes les corrections ont été appliquées avec succès ! Ton texte est impeccable.',
      })
    }
  }

  const handleApplySingleCorrection = (corr: CorrectionItem) => {
    if (!corr.original) return
    const idx = content.indexOf(corr.original)
    if (idx !== -1) {
      const next = content.slice(0, idx) + corr.corrected + content.slice(idx + corr.original.length)
      setContent(next)
      setSavedBadge(false)
      if (correctionResult) {
        setCorrectionResult({
          ...correctionResult,
          originalText: next,
          corrections: correctionResult.corrections.filter((c) => c.id !== corr.id),
        })
      }
    }
  }

  const handleDismissSingleCorrection = (idToDismiss: string) => {
    if (correctionResult) {
      setCorrectionResult({
        ...correctionResult,
        corrections: correctionResult.corrections.filter((c) => c.id !== idToDismiss),
      })
    }
  }

  const handleCloseCorrection = () => {
    setIsCorrectionOpen(false)
  }

  // Copy text
  const handleCopy = () => {
    void navigator.clipboard.writeText(content)
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 1500)
  }

  // Format seconds mm:ss
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className={`writing-editor-view ${initialEntry ? 'is-editing-mode' : ''}`}>
      {/* Main Page Header */}
      <header className="page-header writing-page-header">
        <div className="writing-header-title-group">
          <h1>Journaling</h1>
          {initialEntry && (
            <span className="editing-session-badge" title="Cette session est en cours de modification">
              <Edit2 size={11} />
              <span>En édition</span>
            </span>
          )}
        </div>

        <div className="writing-header-actions">
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

          {/* Show "Pratiquer à l'oral" only when text has at least 10 words */}
          {onNavigateToSpeaking && stats.words >= 10 && (
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
        <div>
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
      <div className={`writing-workspace-body ${isDrawerOpen ? 'drawer-open' : ''}`}>
        {/* Editor Main Textarea */}
        <div className="editor-main-area">
          {isCorrectionOpen && correctionResult ? (
            <>
              <WritingCorrectionOverlay
                correctionResult={correctionResult}
                onApplyAll={handleApplyAllCorrection}
                onApplySingle={handleApplySingleCorrection}
                onDismissSingle={handleDismissSingleCorrection}
                onClose={handleCloseCorrection}
                isEditorView={isEditorRawView}
                onToggleEditorView={() => setIsEditorRawView(!isEditorRawView)}
              />
              {isEditorRawView && (
                <textarea
                  ref={textareaRef}
                  className="writing-textarea"
                  placeholder="Commence à rédiger ici... Exprime-toi librement dans ta langue d'apprentissage."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  autoFocus
                />
              )}
            </>
          ) : (
            <textarea
              ref={textareaRef}
              className="writing-textarea"
              placeholder="Commence à rédiger ici... Exprime-toi librement dans ta langue d'apprentissage."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
            />
          )}

          <div className="editor-floating-bottom-row">
            <div className="floating-title-area">
              {isTitleLocked ? (
                <span className="locked-title-display">
                  <span className="locked-title-text">{title || 'Mon texte'}</span>
                  <button
                    type="button"
                    className="title-edit-icon-btn"
                    onClick={() => setIsTitleLocked(false)}
                    title="Modifier le titre"
                  >
                    <Pencil size={11} />
                  </button>
                </span>
              ) : (
                <input
                  type="text"
                  className="inline-title-input"
                  value={title === 'Mon texte' ? '' : title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    if (title.trim().length > 0 && title !== 'Mon texte') {
                      setIsTitleLocked(true)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && title.trim().length > 0) {
                      setIsTitleLocked(true)
                    }
                  }}
                  placeholder="Titre de la note"
                />
              )}
            </div>
            {onNewSession && (
              <button
                type="button"
                className="new-text-corner-btn"
                onClick={handleNewTextClick}
                title={initialEntry ? "Créer un nouveau texte vierge" : "Nouveau texte"}
              >
                <Plus size={13} />
                <span>Nouveau texte</span>
              </button>
            )}
          </div>

          {correctionError && (
            <div className="writing-error-toast">
              <AlertCircle size={14} />
              <span>{correctionError}</span>
            </div>
          )}

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
              {initialEntry && onDeleteEntry && (
                <button
                  type="button"
                  className="text-btn delete-text-btn"
                  onClick={() => {
                    onDeleteEntry(initialEntry.id)
                    handleResetText()
                  }}
                  title="Supprimer cette session d'écriture"
                >
                  <Trash2 size={13} />
                  <span>Supprimer</span>
                </button>
              )}
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
                className={`text-btn ai-correct-btn ${isCorrecting ? 'is-loading' : ''} ${isCorrectionOpen && correctionResult ? 'active' : ''}`}
                onClick={handleAiCorrection}
                disabled={isCorrecting}
                title="Analyser le texte et afficher les corrections et annotations manuscrites"
              >
                {isCorrecting ? (
                  <Loader2 size={13} className="spin text-brand" />
                ) : (
                  <Languages size={13} />
                )}
                <span>{isCorrecting ? 'Analyse…' : 'Correction IA'}</span>
              </button>

              <button
                type="button"
                className="text-btn"
                onClick={handleSave}
                title="Enregistrer et créer un nouveau texte"
              >
                {savedBadge ? <Check size={13} className="text-green" /> : <Save size={13} />}
                <span>{savedBadge ? 'Enregistré !' : 'Sauvegarder'}</span>
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

      {/* Fine Separation Line with Middle Stats */}
      <div className="sessions-divider">
        <span className="sessions-divider-line" />
        <span className="sessions-divider-text">
          {globalStats.totalWritings} {globalStats.totalWritings > 1 ? 'textes rédigés' : 'texte rédigé'} · {globalStats.totalChars.toLocaleString()} caractères · {globalStats.totalUniqueWords.toLocaleString()} mots uniques
        </span>
        <span className="sessions-divider-line" />
      </div>

      {/* Direct Sessions / Writings Cards List (Notebook Style) */}
      <div className="sessions-section">
        {(state.writings ?? []).length > 0 && (
          <div className="writings-cards-grid">
            {(state.writings ?? []).map((entry) => (
              <article key={entry.id} className="writing-history-card">
                {/* Notebook Visual Index Tabs on the Left Edge */}
                <div className="notebook-tabs-edge" aria-hidden="true">
                  <span className="notebook-tab-item tab-1" />
                  <span className="notebook-tab-item tab-2" />
                  <span className="notebook-tab-item tab-3" />
                </div>

                <div className="card-top-row">
                  <div className="card-badge-row">
                    <span className="card-date">
                      <Calendar size={12} /> {entry.date}
                    </span>
                  </div>

                  <div className="card-actions">
                    {onNavigateToSpeaking && entry.content?.trim() && (
                      <button
                        type="button"
                        className="card-action-btn icon-only"
                        onClick={() => onNavigateToSpeaking(entry.content)}
                        title="Pratiquer au prompteur"
                      >
                        <Video size={13} />
                      </button>
                    )}
                    {onSelectEntry && (
                      <button
                        type="button"
                        className="card-action-btn icon-only"
                        onClick={() => onSelectEntry(entry)}
                        title="Modifier cette session"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <h3
                  className="card-title"
                  onClick={() => onSelectEntry?.(entry)}
                  style={{ cursor: onSelectEntry ? 'pointer' : 'default' }}
                >
                  {entry.title}
                </h3>

                <p className="card-excerpt">
                  {entry.content?.slice(0, 180)}
                  {(entry.content?.length ?? 0) > 180 ? '...' : ''}
                </p>

                <div className="card-footer">
                  <span>{entry.wordCount || 0} mots</span>
                  <span>·</span>
                  <span>{entry.content?.length || 0} caractères</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Nouveau texte */}
      {showNewConfirmModal && (
        <div className="writing-setup-overlay" onClick={() => setShowNewConfirmModal(false)}>
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
                onClick={() => setShowNewConfirmModal(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setShowNewConfirmModal(false)
                  handleResetText()
                }}
              >
                Quitter sans sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}



