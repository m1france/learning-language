import React, { useState, useRef } from 'react'
import type { ApiSettings, Language, LearnedWord } from '../../domain'
import { speak } from '../../ai'
import { Check, Volume2, RefreshCw, X } from 'lucide-react'
import { renderPhoneticFormatted, renderStyledMarkdown } from '../vocabulary/phoneticUtils'

type WordBricksTrayProps = {
  words: string[]
  usedWords: string[]
  wordDetailsMap?: Map<string, LearnedWord>
  language: Language
  api: ApiSettings
  onReplaceWord?: (index: number) => void
  onRemoveWord?: (index: number) => void
  compact?: boolean
}

export function WordBricksTray({
  words,
  usedWords,
  wordDetailsMap,
  language,
  api,
  onReplaceWord,
  onRemoveWord,
  compact = false,
}: WordBricksTrayProps) {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = (index: number) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    setActiveTooltipIndex(index)
  }

  const handleMouseLeave = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
    }
    leaveTimerRef.current = setTimeout(() => {
      setActiveTooltipIndex(null)
    }, 280)
  }

  const handleSpeak = async (e: React.MouseEvent, word: string, index: number) => {
    e.stopPropagation()
    setSpeakingIndex(index)
    try {
      await speak(word, language, api)
    } finally {
      setSpeakingIndex(null)
    }
  }

  if (!words.length) return null

  return (
    <div className={`word-bricks-container ${compact ? 'compact' : ''}`}>
      <div className="word-bricks-grid">
        {words.map((word, index) => {
          const isUsed = usedWords.includes(word)
          const detail = wordDetailsMap?.get(word.toLowerCase().trim())
          const isTooltipOpen = activeTooltipIndex === index

          return (
            <div
              key={`${word}-${index}`}
              className={`word-brick-card ${isUsed ? 'used' : 'pending'} ${isTooltipOpen ? 'active' : ''}`}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
              onClick={() => setActiveTooltipIndex(isTooltipOpen ? null : index)}
            >
              <div className="word-brick-left">
                <span className="word-brick-num">{String(index + 1).padStart(2, '0')}</span>
                <span className="word-brick-status">
                  {isUsed ? <Check size={14} className="check-icon" /> : <span className="dot" />}
                </span>
                <strong className="word-brick-text">{word}</strong>
                {detail?.translation && (
                  <span className="word-brick-translation">{renderStyledMarkdown(detail.translation)}</span>
                )}
              </div>

              <div className="word-brick-actions">
                <button
                  type="button"
                  className={`word-brick-btn ${speakingIndex === index ? 'playing' : ''}`}
                  onClick={(e) => void handleSpeak(e, word, index)}
                  title="Écouter la prononciation"
                >
                  <Volume2 size={13} />
                </button>
                {onReplaceWord && (
                  <button
                    type="button"
                    className="word-brick-btn hover-only"
                    onClick={(e) => {
                      e.stopPropagation()
                      onReplaceWord(index)
                    }}
                    title="Changer ce mot"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
                {onRemoveWord && (
                  <button
                    type="button"
                    className="word-brick-btn hover-only"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveWord(index)
                    }}
                    title="Supprimer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Tooltip / Popover for word details */}
              {isTooltipOpen && (
                <div
                  className="word-brick-popover"
                  onMouseEnter={() => handleMouseEnter(index)}
                  onMouseLeave={handleMouseLeave}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="word-brick-popover-head">
                    <div className="popover-title-group">
                      <strong>{word}</strong>
                      {detail?.phonetic && (
                        <span className="phonetic">{renderPhoneticFormatted(detail.phonetic)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="popover-close"
                      onClick={() => setActiveTooltipIndex(null)}
                      title="Fermer"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {detail?.translation && (
                    <p className="popover-trans">
                      <b>Traduction :</b> {renderStyledMarkdown(detail.translation)}
                    </p>
                  )}

                  {detail?.contextSentence && (
                    <div className="popover-context">
                      <span className="context-label">Phrase découverte en lecture :</span>
                      <blockquote>« {detail.contextSentence} »</blockquote>
                    </div>
                  )}

                  {detail?.tags && detail.tags.length > 0 && (
                    <div className="popover-tags">
                      {detail.tags.map((t) => (
                        <span key={t} className="tag-pill">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
