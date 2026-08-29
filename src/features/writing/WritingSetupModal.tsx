import React, { useState, useMemo } from 'react'
import type { AppState, LearnedWord, WritingMode, UiLanguage } from '../../domain'
import { writeCopy } from '../../i18n'
import { DEFAULT_PROMPTS_DATA, prompts as defaultPrompts } from '../../data'
import { renderStyledMarkdown } from '../vocabulary/phoneticUtils'
import {
  Target,
  Zap,
  PenTool,
  Clock,
  Shuffle,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react'

type WritingSetupModalProps = {
  mode: WritingMode
  state: AppState
  promptWords: string[]
  onUpdatePromptWords: (words: string[]) => void
  sprintMinutes: number
  onUpdateSprintMinutes: (mins: number) => void
  title: string
  onUpdateTitle: (title: string) => void
  onStart: () => void
  onCancel: () => void
  ui?: UiLanguage
}

export function WritingSetupModal({
  mode,
  state,
  promptWords,
  onUpdatePromptWords,
  sprintMinutes,
  onUpdateSprintMinutes,
  title,
  onUpdateTitle,
  onStart,
  onCancel,
  ui = 'fr',
}: WritingSetupModalProps) {
  const t = writeCopy[ui] || writeCopy.fr
  const learningLang = state.settings.learningLanguage

  // Saved words pool (or fallback to default prompts)
  const allSavedWords = useMemo(
    () => (state.words ?? []).filter((w) => !w.language || w.language === learningLang),
    [state.words, learningLang],
  )

  const tagsList = useMemo(() => {
    const set = new Set<string>()
    allSavedWords.forEach((w) => w.tags?.forEach((t) => set.add(t)))
    return Array.from(set)
  }, [allSavedWords])

  // Reactivation Mode Filters
  const [wordCount, setWordCount] = useState<number>(promptWords.length || 5)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'due' | 'resource' | 'tag'>('all')
  const [selectedResourceId, setSelectedResourceId] = useState<string>('')
  const [selectedTag, setSelectedTag] = useState<string>('')

  // Filter words according to chosen filter
  const filteredWordsPool = useMemo(() => {
    if (sourceFilter === 'due') {
      const today = new Date().toISOString().slice(0, 10)
      const due = allSavedWords.filter(
        (w) => !w.nextReview || w.nextReview <= today || (w.knowledge ?? 1) <= 3,
      )
      return due.length > 0 ? due : allSavedWords
    }
    if (sourceFilter === 'resource' && selectedResourceId) {
      return allSavedWords.filter((w) => w.sourceResourceId === selectedResourceId)
    }
    if (sourceFilter === 'tag' && selectedTag) {
      return allSavedWords.filter((w) => w.tags?.includes(selectedTag))
    }
    return allSavedWords
  }, [allSavedWords, sourceFilter, selectedResourceId, selectedTag])

  const pickRandomWords = (count: number, pool: LearnedWord[]): string[] => {
    if (!pool.length) {
      return defaultPrompts.slice(0, count)
    }
    const shuffled = [...pool].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((w) => w.word)
  }

  const handleShuffle = () => {
    const nextWords = pickRandomWords(wordCount, filteredWordsPool)
    onUpdatePromptWords(nextWords)
  }

  const handleCountChange = (count: number) => {
    setWordCount(count)
    const nextWords = pickRandomWords(count, filteredWordsPool)
    onUpdatePromptWords(nextWords)
  }

  const handleFilterChange = (filter: 'all' | 'due' | 'resource' | 'tag') => {
    setSourceFilter(filter)
    const newPool =
      filter === 'due'
        ? allSavedWords.filter((w) => (w.knowledge ?? 1) <= 3)
        : allSavedWords
    const nextWords = pickRandomWords(wordCount, newPool.length ? newPool : allSavedWords)
    onUpdatePromptWords(nextWords)
  }

  // Lookup translation helper
  const getWordTranslation = (word: string): string | undefined => {
    const saved = allSavedWords.find((w) => w.word.toLowerCase() === word.toLowerCase())
    if (saved?.translation) return saved.translation
    const def = DEFAULT_PROMPTS_DATA.find((dp) => dp.word.toLowerCase() === word.toLowerCase())
    return def?.translation
  }

  return (
    <div className="writing-setup-overlay" onClick={onCancel}>
      <div
        className="writing-setup-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="writing-setup-modal-head">
          <div className="writing-setup-modal-head-title">
            {mode === 'reactivation' && (
              <>
                <div className="mode-icon-badge coral compact">
                  <Target size={18} />
                </div>
                <span>{t.customizeVocab}</span>
              </>
            )}
            {mode === 'sprint' && (
              <>
                <div className="mode-icon-badge blue compact">
                  <Zap size={18} />
                </div>
                <span>{t.sprintDuration}</span>
              </>
            )}
            {mode === 'free' && (
              <>
                <div className="mode-icon-badge green compact">
                  <PenTool size={18} />
                </div>
                <span>{t.freeWriting}</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="popover-close"
            onClick={onCancel}
            title={t.dismiss}
            aria-label={t.dismiss}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="writing-setup-modal-body">
          {/* MODE 1: RÉACTIVATION */}
          {mode === 'reactivation' && (
            <div className="config-reactivation">
              <div className="config-row-head">
                <div>
                  <p>
                    {allSavedWords.length > 0
                      ? `${allSavedWords.length} ${t.wordsAvailable}`
                      : t.recommendedWords}
                  </p>
                </div>
                <button
                  type="button"
                  className="outline shuffle-btn"
                  onClick={handleShuffle}
                  title={t.shuffleTitle}
                >
                  <Shuffle size={14} />
                  <span>{t.shuffle}</span>
                </button>
              </div>

              {/* Filter Selectors */}
              <div className="filters-bar">
                <div className="filter-group">
                  <span className="filter-label">{t.wordCountLabel}</span>
                  <div className="segmented-sm">
                    {[3, 5, 8, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={wordCount === n ? 'active' : ''}
                        onClick={() => handleCountChange(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="filter-group">
                  <span className="filter-label">{t.sourceLabel}</span>
                  <div className="segmented-sm">
                    <button
                      type="button"
                      className={sourceFilter === 'all' ? 'active' : ''}
                      onClick={() => handleFilterChange('all')}
                    >
                      {t.allWords}
                    </button>
                    <button
                      type="button"
                      className={sourceFilter === 'due' ? 'active' : ''}
                      onClick={() => handleFilterChange('due')}
                      title={t.dueWordsTitle}
                    >
                      {t.dueWords}
                    </button>
                    {state.resources.length > 0 && (
                      <button
                        type="button"
                        className={sourceFilter === 'resource' ? 'active' : ''}
                        onClick={() => handleFilterChange('resource')}
                      >
                        {t.byResource}
                      </button>
                    )}
                    {tagsList.length > 0 && (
                      <button
                        type="button"
                        className={sourceFilter === 'tag' ? 'active' : ''}
                        onClick={() => handleFilterChange('tag')}
                      >
                        {t.byTag}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Sub-filters if resource or tag chosen */}
              {sourceFilter === 'resource' && (
                <div className="subfilter-row">
                  <label>{t.selectSourceText}</label>
                  <select
                    value={selectedResourceId}
                    onChange={(e) => {
                      setSelectedResourceId(e.target.value)
                      const pool = allSavedWords.filter(
                        (w) => w.sourceResourceId === e.target.value,
                      )
                      const next = pickRandomWords(wordCount, pool.length ? pool : allSavedWords)
                      onUpdatePromptWords(next)
                    }}
                  >
                    <option value="">-- Choisir une ressource --</option>
                    {state.resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sourceFilter === 'tag' && (
                <div className="subfilter-row">
                  <label>{t.selectTag}</label>
                  <select
                    value={selectedTag}
                    onChange={(e) => {
                      setSelectedTag(e.target.value)
                      const pool = allSavedWords.filter((w) => w.tags?.includes(e.target.value))
                      const next = pickRandomWords(wordCount, pool.length ? pool : allSavedWords)
                      onUpdatePromptWords(next)
                    }}
                  >
                    <option value="">-- {t.selectTag} --</option>
                    {tagsList.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Words Preview Tray */}
              <div className="words-preview-tray">
                <span className="tray-title">{t.startPromptWords}</span>
                <div className="tray-chips">
                  {promptWords.map((word, i) => {
                    const translation = getWordTranslation(word)
                    return (
                      <div key={`${word}-${i}`} className="tray-chip">
                        <span className="tray-chip-num">{i + 1}</span>
                        <strong>{word}</strong>
                        {translation && (
                          <small>({renderStyledMarkdown(translation)})</small>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: SPRINT */}
          {mode === 'sprint' && (
            <div className="config-sprint">
              <div className="sprint-duration-buttons">
                {[3, 5, 10].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`sprint-time-btn ${sprintMinutes === mins ? 'active' : ''}`}
                    onClick={() => onUpdateSprintMinutes(mins)}
                  >
                    <Clock size={20} />
                    <strong>{mins} min</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MODE 3: LIBRE */}
          {mode === 'free' && (
            <div className="config-free">
              <label style={{ display: 'block', marginTop: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                  {t.myText} :
                </span>
                <input
                  type="text"
                  className="free-title-input"
                  placeholder={t.myText}
                  value={title}
                  onChange={(e) => onUpdateTitle(e.target.value)}
                  autoFocus
                />
              </label>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="writing-setup-modal-foot">
          <button
            type="button"
            className="outline icon-btn modal-back-btn"
            onClick={onCancel}
            title={t.dismiss}
            aria-label={t.dismiss}
          >
            <ArrowLeft size={18} />
          </button>
          <button type="button" className="primary large launch-btn" onClick={onStart}>
            <span>
              {mode === 'reactivation'
                ? t.startChallenge
                : mode === 'sprint'
                ? t.startSprint
                : t.startFree}
            </span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
