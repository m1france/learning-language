import React, { useState, useRef } from 'react'
import type { ApiSettings, Language, LearnedWord } from '../../domain'
import { speak } from '../../ai'
import { Check, Volume2, Info, RefreshCw, X, Sparkles } from 'lucide-react'
import { renderPhoneticFormatted } from '../vocabulary/phoneticUtils'

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

/**
 * Safely parses simple markdown like **bold**, *italic*, <u>underline</u>
 */
function renderPhoneticMarkdown(text?: string): React.ReactNode {
  if (!text) return null
  const regex = /(\*\*(?:[\s\S]+?)\*\*|__(?:[\s\S]+?)__|<u>[\s\S]*?<\/u>|\*(?:[^*]+?)\*|_(?:[^_]+?)_)/i
  const parts = text.split(regex)

  return parts.map((part, index) => {
    const key = `ph-${index}`
    if (!part) return null

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.toLowerCase().startsWith('<u>') && part.toLowerCase().endsWith('</u>') && part.length >= 7) {
      return <u key={key}>{part.slice(3, -4)}</u>
    }
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return part
  })
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
      <div className="word-bricks-header">
        <span className="word-bricks-label">
          <Sparkles size={14} className="sparkle-icon" />
          <span>Mots cibles ({usedWords.length}/{words.length})</span>
        </span>
        <div className="word-bricks-progress-bar">
          <div
            className="word-bricks-progress-fill"
            style={{ width: `${Math.round((usedWords.length / words.length) * 100)}%` }}
          />
        </div>
      </div>

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
                  <span className="word-brick-translation">{detail.translation}</span>
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
                {(detail?.contextSentence || detail?.phonetic || detail?.definitions?.length) && (
                  <button
                    type="button"
                    className="word-brick-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveTooltipIndex(isTooltipOpen ? null : index)
                    }}
                    title="Détails & contexte"
                  >
                    <Info size={13} />
                  </button>
                )}
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
                    <strong>{word}</strong>
                    {detail?.phonetic && (
                      <span className="phonetic">{renderPhoneticFormatted(detail.phonetic)}</span>
                    )}
                    <button
                      className="popover-close"
                      onClick={() => setActiveTooltipIndex(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {detail?.translation && (
                    <p className="popover-trans">
                      <b>Traduction :</b> {detail.translation}
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
