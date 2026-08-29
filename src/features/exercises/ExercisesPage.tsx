import React, { useState, useEffect, useRef } from 'react'
import type { AppState, Difficulty, Language, UiLanguage } from '../../domain'
import { exercisesCopy } from '../../i18n'
import {
  type ExerciseDefinition,
  type ExerciseHistoryRecord,
  type ExerciseMode,
  EXERCISE_MODES_INFO,
  getExerciseModeInfo,
} from './exercisesDomain'
import { generateExerciseWithAi } from './exerciseAiService'
import {
  getAllExerciseRecords,
  saveExerciseRecord,
  deleteExerciseRecord,
} from './exerciseStorage'
import { CrosswordBoard } from './components/CrosswordBoard'
import { MatchPairsBoard } from './components/MatchPairsBoard'
import { SentenceScrambleBoard } from './components/SentenceScrambleBoard'
import { HandwrittenCorrections } from './components/HandwrittenCorrections'
import {
  FillInBlanksBoard,
  ErrorHunterBoard,
  DialogueRoleplayBoard,
  GrammarDeepdiveBoard,
  ImageAssociationBoard,
} from './components/GeneralExerciseBoards'
import {
  RotateCcw,
  Plus,
  Loader2,
  Trash2,
  Calendar,
  Award,
  ArrowUp,
  SlidersHorizontal,
  History as HistoryIcon,
  X,
  ChevronDown,
  Check,
} from 'lucide-react'

type ExercisesPageProps = {
  state: AppState
  onChange: (state: AppState) => void
  ui: UiLanguage
  onAiTaskChange?: (running: boolean) => void
}

export function ExercisesPage({ state, onChange, ui = 'fr', onAiTaskChange }: ExercisesPageProps) {
  const t = exercisesCopy[ui] || exercisesCopy.fr
  const [promptInput, setPromptInput] = useState('')
  const [selectedMode, setSelectedMode] = useState<ExerciseMode>('auto')
  const [isModePickerOpen, setIsModePickerOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Current active exercise
  const [activeExercise, setActiveExercise] = useState<ExerciseDefinition | null>(null)
  const [isExerciseSubmitted, setIsExerciseSubmitted] = useState(false)

  // History modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [history, setHistory] = useState<ExerciseHistoryRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const activeBoardRef = useRef<HTMLDivElement | null>(null)
  const modePickerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-resize textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.max(activeExercise ? 40 : 80, textareaRef.current.scrollHeight)}px`
    }
  }, [promptInput, activeExercise])

  // Close mode picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modePickerRef.current && !modePickerRef.current.contains(e.target as Node)) {
        setIsModePickerOpen(false)
      }
    }
    if (isModePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isModePickerOpen])

  // Load history when opening history modal
  useEffect(() => {
    if (isHistoryOpen) {
      loadHistory()
    }
  }, [isHistoryOpen])

  const loadHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const records = await getAllExerciseRecords()
      setHistory(records)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleGenerate = async () => {
    const p = promptInput.trim()
    if (!p || isGenerating) return

    setIsGenerating(true)
    setGenerationError(null)
    onAiTaskChange?.(true)

    try {
      const res = await generateExerciseWithAi({
        prompt: p,
        requestedMode: selectedMode,
        difficulty: 'intermediate',
        learningLanguage: state.settings.learningLanguage,
        uiLanguage: ui,
        api: state.settings.api,
      })

      if (!res.ok) {
        setGenerationError(res.error)
      } else {
        setActiveExercise(res.exercise)
        setIsExerciseSubmitted(false)

        // Smooth scroll to active board
        setTimeout(() => {
          activeBoardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 80)
      }
    } catch (err) {
      setGenerationError('Une erreur inattendue est survenue.')
    } finally {
      setIsGenerating(false)
      onAiTaskChange?.(false)
    }
  }

  const handleCheckFinished = async (score: number, maxScore: number) => {
    setIsExerciseSubmitted(true)

    if (activeExercise) {
      const record: ExerciseHistoryRecord = {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: activeExercise.title,
        targetProblem: activeExercise.targetProblem,
        mode: activeExercise.mode,
        targetLanguage: activeExercise.targetLanguage,
        score,
        maxScore,
        completedAt: new Date().toISOString(),
        exerciseData: activeExercise,
      }
      await saveExerciseRecord(record)
    }
  }

  const handleReplayCurrent = () => {
    setIsExerciseSubmitted(false)
  }

  const handleReplayFromHistory = (record: ExerciseHistoryRecord) => {
    setActiveExercise(record.exerciseData)
    setIsExerciseSubmitted(false)
    setIsHistoryOpen(false)
    activeBoardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleReviewFromHistory = (record: ExerciseHistoryRecord) => {
    setActiveExercise(record.exerciseData)
    setIsExerciseSubmitted(true)
    setIsHistoryOpen(false)
    activeBoardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteExerciseRecord(id)
    await loadHistory()
  }

  const selectedModeInfo = getExerciseModeInfo(selectedMode, ui)

  return (
    <div className={`exercises-builder-page ${activeExercise ? 'has-active-exercise' : ''}`}>
      {/* Stack organisée : Titre à gauche, icône d'historique à droite et champ de saisie aligné */}
      <div className="builder-header-stack">
        <header className="builder-minimal-header">
          <h1 className="builder-minimal-title">{t.createExerciseTitle}</h1>
          <button
            type="button"
            className="history-icon-toggle-btn"
            onClick={() => setIsHistoryOpen(true)}
            title={t.historyTitle}
            aria-label={t.historyTitle}
          >
            <HistoryIcon size={19} />
          </button>
        </header>

        {/* Centered Modern Parent Input Container */}
        {activeExercise ? (
          <section className="minimal-prompt-parent is-compact-active">
          <div className="compact-prompt-inline-row">
            <textarea
              ref={textareaRef}
              className="minimal-prompt-textarea compact-inline"
              rows={1}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={t.promptPlaceholderCompact}
              disabled={isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
            />
            <button
              type="button"
              className={`minimal-send-btn ${isGenerating ? 'is-loading' : ''}`}
              onClick={handleGenerate}
              disabled={isGenerating || !promptInput.trim()}
              title={t.createBtn}
              aria-label={t.createBtn}
            >
              {isGenerating ? (
                <Loader2 size={18} className="spin-icon" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </section>
      ) : (
        <section className="minimal-prompt-parent">
          <textarea
            ref={textareaRef}
            className="minimal-prompt-textarea"
            rows={2}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder={t.promptPlaceholder}
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleGenerate()
              }
            }}
          />

          <div className="minimal-prompt-bottom-bar">
            {/* Bottom Left: Mode Picker Trigger */}
            <div className="mode-picker-container" ref={modePickerRef}>
              <button
                type="button"
                className={`mode-trigger-btn ${selectedMode !== 'auto' ? 'mode-active' : ''}`}
                onClick={() => setIsModePickerOpen(!isModePickerOpen)}
                disabled={isGenerating}
              >
                {selectedMode === 'auto' ? (
                  <>
                    <SlidersHorizontal size={14} />
                    <span>{t.modePickerLabel}</span>
                    <ChevronDown size={12} className="chevron-icon" />
                  </>
                ) : (
                  <>
                    <span>{selectedModeInfo.icon} {selectedModeInfo.label}</span>
                    <ChevronDown size={12} className="chevron-icon" />
                  </>
                )}
              </button>

              {/* Mode Picker Dropdown Popover (Opens strictly below) */}
              {isModePickerOpen && (
                <div className="mode-picker-popover">
                  <div className="popover-title">{t.modePickerTitle}</div>
                  <div className="popover-modes-list">
                    {EXERCISE_MODES_INFO.map((m) => {
                      const info = getExerciseModeInfo(m.id, ui)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`mode-option-btn ${selectedMode === m.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedMode(m.id)
                            setIsModePickerOpen(false)
                          }}
                        >
                          <span className="mode-opt-icon">{info.icon}</span>
                          <div className="mode-opt-info">
                            <strong className="mode-opt-label">{info.label}</strong>
                            <small className="mode-opt-desc">{info.desc}</small>
                          </div>
                          {selectedMode === m.id && <Check size={14} className="check-icon" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Right: Send Button */}
            <button
              type="button"
              className={`minimal-send-btn ${isGenerating ? 'is-loading' : ''}`}
              onClick={handleGenerate}
              disabled={isGenerating || !promptInput.trim()}
              title={t.createBtn}
              aria-label={t.createBtn}
            >
              {isGenerating ? (
                <Loader2 size={18} className="spin-icon" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </section>
      )}
      </div>

      {/* Error Banner */}
      {generationError && (
        <div className="generation-error-box">
          <span>⚠️ {generationError}</span>
        </div>
      )}

      {/* Active Exercise Board View (Expanded width) */}
      {activeExercise && (
        <section ref={activeBoardRef} className="active-exercise-section expanded-canvas">
          <div className="exercise-clean-header">
            <h2 className="active-clean-title">{activeExercise.title}</h2>
            <button
              type="button"
              className="action-btn secondary small"
              onClick={() => setActiveExercise(null)}
            >
              {t.close}
            </button>
          </div>

          {/* Mode-Specific Board Component */}
          <div className="board-component-canvas">
            {activeExercise.mode === 'handwritten_mastery' && activeExercise.handwrittenMasteryData && (
              <HandwrittenCorrections
                data={activeExercise.handwrittenMasteryData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'crossword' && activeExercise.crosswordData && (
              <CrosswordBoard
                data={activeExercise.crosswordData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'match_pairs' && activeExercise.matchPairsData && (
              <MatchPairsBoard
                data={activeExercise.matchPairsData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'sentence_scramble' && activeExercise.sentenceScrambleData && (
              <SentenceScrambleBoard
                data={activeExercise.sentenceScrambleData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'fill_in_blanks' && activeExercise.fillInBlanksData && (
              <FillInBlanksBoard
                data={activeExercise.fillInBlanksData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'error_hunter' && activeExercise.errorHunterData && (
              <ErrorHunterBoard
                data={activeExercise.errorHunterData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'dialogue_roleplay' && activeExercise.dialogueRoleplayData && (
              <DialogueRoleplayBoard
                data={activeExercise.dialogueRoleplayData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'grammar_deepdive' && activeExercise.grammarDeepdiveData && (
              <GrammarDeepdiveBoard
                data={activeExercise.grammarDeepdiveData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}

            {activeExercise.mode === 'image_association' && activeExercise.imageAssociationData && (
              <ImageAssociationBoard
                data={activeExercise.imageAssociationData}
                onCheckFinished={handleCheckFinished}
                isSubmitted={isExerciseSubmitted}
                ui={ui}
              />
            )}
          </div>

          {/* Post-Exercise Action Toolbar */}
          {isExerciseSubmitted && (
            <div className="post-exercise-toolbar">
              <button
                type="button"
                className="action-btn secondary"
                onClick={handleReplayCurrent}
              >
                <RotateCcw size={14} /> {t.replayBtn}
              </button>
              <button
                type="button"
                className="action-btn primary"
                onClick={() => {
                  setActiveExercise(null)
                  setPromptInput('')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                <Plus size={14} /> {t.newExerciseBtn}
              </button>
            </div>
          )}
        </section>
      )}

      {/* History Modal Drawer */}
      {isHistoryOpen && (
        <div className="history-modal-overlay" onClick={() => setIsHistoryOpen(false)}>
          <div className="history-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="history-modal-header">
              <div className="header-title-wrap">
                <Calendar size={18} />
                <h3>{t.historyTitle}</h3>
              </div>
              <button
                type="button"
                className="history-modal-close"
                onClick={() => setIsHistoryOpen(false)}
                title={t.close}
              >
                <X size={18} />
              </button>
            </div>

            <div className="history-modal-body">
              {isLoadingHistory ? (
                <div className="history-loading-row">
                  <Loader2 size={16} className="spin-icon" />
                  <span>{t.creating}</span>
                </div>
              ) : history.length === 0 ? (
                <div className="history-empty-card">
                  <p>{t.noHistory}</p>
                </div>
              ) : (
                <div className="history-cards-stack">
                  {history.map((record) => {
                    const modeInfo = getExerciseModeInfo(record.mode, ui)
                    const scorePercent =
                      record.score !== undefined && record.maxScore
                        ? Math.round((record.score / record.maxScore) * 100)
                        : null

                    return (
                      <article key={record.id} className="history-item-row">
                        <div className="history-item-left">
                          <div className="history-item-meta">
                            <span
                              className="history-mode-tag"
                              style={{
                                backgroundColor: `${modeInfo?.badgeColor}18`,
                                color: modeInfo?.badgeColor,
                              }}
                            >
                              {modeInfo?.icon} {modeInfo?.label}
                            </span>
                            <span className="history-date">
                              {new Date(record.completedAt).toLocaleDateString(ui === 'fr' ? 'fr-FR' : (ui === 'en' ? 'en-US' : (ui === 'es' ? 'es-ES' : (ui === 'zh' ? 'zh-CN' : (ui === 'ru' ? 'ru-RU' : 'pt-PT')))), {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <h4 className="history-item-title">{record.title}</h4>
                          <p className="history-item-problem">{record.targetProblem}</p>
                        </div>

                        <div className="history-item-right">
                          {scorePercent !== null ? (
                            <span className="history-score-badge">
                              <Award size={13} />
                              <strong>{scorePercent}%</strong>
                            </span>
                          ) : (
                            <span className="history-score-badge empty">{t.finish}</span>
                          )}

                          <div className="history-row-actions">
                            <button
                              type="button"
                              className="history-btn replay"
                              onClick={() => handleReplayFromHistory(record)}
                              title={t.replayBtn}
                            >
                              <RotateCcw size={12} />
                            </button>
                            <button
                              type="button"
                              className="history-btn delete"
                              onClick={(e) => handleDeleteHistory(record.id, e)}
                              title={t.close}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
