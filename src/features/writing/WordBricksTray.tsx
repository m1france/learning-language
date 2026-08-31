import React, { useState, useRef, useLayoutEffect } from 'react'
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

type WordBrickItemProps = {
  word: string
  index: number
  isUsed: boolean
  detail?: LearnedWord
  isTooltipOpen: boolean
  speakingIndex: number | null
  onMouseEnter: (index: number) => void
  onMouseLeave: () => void
  onClick: (index: number) => void
  onCloseTooltip: () => void
  onSpeak: (e: React.MouseEvent, word: string, index: number) => void
  onReplaceWord?: (index: number) => void
  onRemoveWord?: (index: number) => void
}

function WordBrickItem({
  word,
  index,
  isUsed,
  detail,
  isTooltipOpen,
  speakingIndex,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onCloseTooltip,
  onSpeak,
  onReplaceWord,
  onRemoveWord,
}: WordBrickItemProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{
    leftOffset: number
    isAbove: boolean
    isMeasured: boolean
  }>({
    leftOffset: 0,
    isAbove: false,
    isMeasured: false,
  })

  useLayoutEffect(() => {
    if (!isTooltipOpen) {
      setPopoverPos((prev) => (prev.isMeasured ? { ...prev, isMeasured: false } : prev))
      return
    }

    const updatePosition = () => {
      const cardEl = cardRef.current
      const popoverEl = popoverRef.current
      if (!cardEl || !popoverEl) return

      const cardRect = cardEl.getBoundingClientRect()
      const popoverRect = popoverEl.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.innerHeight
      const MARGIN = 16

      const popoverWidth = popoverRect.width || 300
      const popoverHeight = popoverRect.height || 200

      // Clamp horizontally within [MARGIN, viewportWidth - MARGIN]
      const maxViewportLeft = Math.max(MARGIN, viewportWidth - popoverWidth - MARGIN)
      const targetViewportLeft = Math.max(MARGIN, Math.min(maxViewportLeft, cardRect.left))
      const leftOffset = Math.round(targetViewportLeft - cardRect.left)

      // Vertical placement
      const spaceBelow = viewportHeight - cardRect.bottom - MARGIN
      const spaceAbove = cardRect.top - MARGIN
      const isAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow

      setPopoverPos({
        leftOffset,
        isAbove,
        isMeasured: true,
      })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && popoverRef.current) {
      ro = new ResizeObserver(() => {
        updatePosition()
      })
      ro.observe(popoverRef.current)
    }

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      if (ro) ro.disconnect()
    }
  }, [isTooltipOpen])

  return (
    <div
      ref={cardRef}
      className={`word-brick-card ${isUsed ? 'used' : 'pending'} ${isTooltipOpen ? 'active' : ''}`}
      onMouseEnter={() => onMouseEnter(index)}
      onMouseLeave={onMouseLeave}
      onClick={() => onClick(index)}
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
          onClick={(e) => onSpeak(e, word, index)}
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
          ref={popoverRef}
          className="word-brick-popover"
          style={{
            left: `${popoverPos.leftOffset}px`,
            ...(popoverPos.isAbove
              ? {
                  top: 'auto',
                  bottom: '100%',
                  marginTop: 0,
                  marginBottom: '8px',
                }
              : {
                  top: '100%',
                  bottom: 'auto',
                  marginTop: '8px',
                  marginBottom: 0,
                }),
            visibility: popoverPos.isMeasured ? 'visible' : 'hidden',
          }}
          onMouseEnter={() => onMouseEnter(index)}
          onMouseLeave={onMouseLeave}
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
              onClick={onCloseTooltip}
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
            <WordBrickItem
              key={`${word}-${index}`}
              word={word}
              index={index}
              isUsed={isUsed}
              detail={detail}
              isTooltipOpen={isTooltipOpen}
              speakingIndex={speakingIndex}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={(idx) => setActiveTooltipIndex(activeTooltipIndex === idx ? null : idx)}
              onCloseTooltip={() => setActiveTooltipIndex(null)}
              onSpeak={handleSpeak}
              onReplaceWord={onReplaceWord}
              onRemoveWord={onRemoveWord}
            />
          )
        })}
      </div>
    </div>
  )
}
