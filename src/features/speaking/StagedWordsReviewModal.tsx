import React, { useState, useEffect } from 'react'
import type { ApiSettings, Language, UiLanguage } from '../../domain'
import type { StagedWord } from './wordAiService'
import { speak } from '../../ai'
import { speakingCopy } from '../../i18n'
import {
  X,
  Volume2,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Tag as TagIcon,
} from 'lucide-react'

type StagedWordsReviewModalProps = {
  isOpen: boolean
  onClose: () => void
  stagedWords: StagedWord[]
  language: Language
  ui?: UiLanguage
  api: ApiSettings
  existingTags: string[]
  onApprove: (word: StagedWord) => void
  onDiscard: (wordId: string) => void
}

export function StagedWordsReviewModal({
  isOpen,
  onClose,
  stagedWords,
  language,
  ui = 'fr',
  api,
  existingTags,
  onApprove,
  onDiscard,
}: StagedWordsReviewModalProps) {
  const t = speakingCopy[ui] || speakingCopy.fr
  const [currentIndex, setCurrentIndex] = useState(0)
  const [draftWord, setDraftWord] = useState<StagedWord | null>(null)
  const [isPlayingTts, setIsPlayingTts] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')

  // Adjust index if out of bounds
  useEffect(() => {
    if (stagedWords.length === 0) {
      setDraftWord(null)
      onClose()
    } else {
      const validIndex = Math.min(currentIndex, stagedWords.length - 1)
      setCurrentIndex(validIndex)
      setDraftWord({ ...stagedWords[validIndex] })
    }
  }, [stagedWords, currentIndex, onClose])

  if (!isOpen || !draftWord) return null

  const currentTotal = stagedWords.length
  const currentNum = currentIndex + 1

  const handlePlayTts = async () => {
    if (!draftWord.word.trim()) return
    setIsPlayingTts(true)
    try {
      await speak(draftWord.word.trim(), language, api)
    } finally {
      setIsPlayingTts(false)
    }
  }

  const handleToggleTag = (tag: string) => {
    if (!draftWord) return
    const exists = draftWord.tags.includes(tag)
    const newTags = exists
      ? draftWord.tags.filter((tagItem) => tagItem !== tag)
      : [...draftWord.tags, tag]
    setDraftWord({ ...draftWord, tags: newTags })
  }

  const handleAddCustomTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = newTagInput.trim().replace(/^#/, '')
    if (!trimmed || !draftWord) return
    if (!draftWord.tags.includes(trimmed)) {
      setDraftWord({ ...draftWord, tags: [...draftWord.tags, trimmed] })
    }
    setNewTagInput('')
  }

  const handleApprove = () => {
    if (!draftWord) return
    onApprove(draftWord)
    if (stagedWords.length <= 1) {
      onClose()
    } else {
      setCurrentIndex((prev) => Math.max(0, prev - 1))
    }
  }

  const handleDiscard = () => {
    if (!draftWord) return
    onDiscard(draftWord.id)
    if (stagedWords.length <= 1) {
      onClose()
    } else {
      setCurrentIndex((prev) => Math.max(0, prev - 1))
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      const nextIdx = currentIndex - 1
      setCurrentIndex(nextIdx)
      setDraftWord({ ...stagedWords[nextIdx] })
    }
  }

  const handleNext = () => {
    if (currentIndex < stagedWords.length - 1) {
      const nextIdx = currentIndex + 1
      setCurrentIndex(nextIdx)
      setDraftWord({ ...stagedWords[nextIdx] })
    }
  }

  return (
    <div className="staged-modal-backdrop" onClick={onClose}>
      <div className="staged-modal-card glass" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="staged-modal-header">
          <div className="staged-modal-title-wrap">
            <div className="staged-modal-badge">
              <Sparkles size={14} />
              <span>{t.stagedModalBadge}</span>
            </div>
            {currentTotal > 1 && (
              <div className="staged-modal-pagination">
                <button
                  type="button"
                  className="staged-page-btn"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  title={t.prevBtn}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="staged-page-counter">
                  {currentNum} / {currentTotal}
                </span>
                <button
                  type="button"
                  className="staged-page-btn"
                  onClick={handleNext}
                  disabled={currentIndex >= currentTotal - 1}
                  title={t.nextBtn}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          <button className="staged-modal-close" onClick={onClose} title={t.closeBtn}>
            <X size={16} />
          </button>
        </div>

        {/* Body Form */}
        <div className="staged-modal-body">
          {/* Word row with Pronounce button */}
          <div className="staged-field-group">
            <label className="staged-label">{t.stagedWordLabel}</label>
            <div className="staged-word-row">
              <input
                type="text"
                className="staged-input staged-word-input"
                value={draftWord.word}
                onChange={(e) => setDraftWord({ ...draftWord, word: e.target.value })}
                placeholder={t.stagedWordPlaceholder}
              />
              <button
                type="button"
                className={`staged-tts-btn ${isPlayingTts ? 'playing' : ''}`}
                onClick={() => void handlePlayTts()}
                title={t.pronounceBtn}
              >
                <Volume2 size={16} />
                <span>{t.pronounceBtn}</span>
              </button>
            </div>
          </div>

          {/* Pronunciation IPA US */}
          <div className="staged-field-group">
            <div className="staged-label-row">
              <label className="staged-label">{t.pronunciationLabel}</label>
              <span className="staged-ai-tag">{t.aiGeneratedBadge}</span>
            </div>
            <input
              type="text"
              className="staged-input staged-ipa-input"
              value={draftWord.pronunciation}
              onChange={(e) => setDraftWord({ ...draftWord, pronunciation: e.target.value })}
              placeholder="/.../"
            />
          </div>

          {/* Translation */}
          <div className="staged-field-group">
            <label className="staged-label">{t.translationLabel}</label>
            <textarea
              className="staged-textarea"
              rows={2}
              value={draftWord.translation}
              onChange={(e) => setDraftWord({ ...draftWord, translation: e.target.value })}
              placeholder={t.translationPlaceholder}
            />
          </div>

          {/* Parent / Lemma */}
          <div className="staged-field-group">
            <label className="staged-label">{t.rootWordLabel}</label>
            <input
              type="text"
              className="staged-input"
              value={draftWord.parent}
              onChange={(e) => setDraftWord({ ...draftWord, parent: e.target.value })}
              placeholder={t.rootWordPlaceholder}
            />
          </div>

          {/* Tags */}
          <div className="staged-field-group">
            <label className="staged-label">{t.associatedTagsLabel}</label>
            <div className="staged-tags-container">
              {existingTags.length > 0 && (
                <div className="staged-tags-list">
                  {existingTags.map((tag) => {
                    const isSelected = draftWord.tags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`staged-tag-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleTag(tag)}
                      >
                        <TagIcon size={11} />
                        <span>#{tag}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Custom tag input if needed */}
              <div className="staged-custom-tag-row">
                <input
                  type="text"
                  className="staged-custom-tag-input"
                  placeholder={t.addTagPlaceholder}
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddCustomTag}
                />
                {newTagInput.trim() && (
                  <button
                    type="button"
                    className="staged-add-tag-btn"
                    onClick={handleAddCustomTag}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="staged-modal-footer">
          <button
            type="button"
            className="staged-discard-btn"
            onClick={handleDiscard}
            title={t.discardBtn}
          >
            <Trash2 size={15} />
            <span>{t.discardBtn}</span>
          </button>
          <button
            type="button"
            className="staged-approve-btn"
            onClick={handleApprove}
            disabled={!draftWord.word.trim()}
          >
            <Check size={16} />
            <span>{t.approveBtn}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

