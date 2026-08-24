import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { CorrectionItem, WritingCorrectionResult } from './writingCorrectionAiService'
import {
  Check,
  X,
  Sparkles,
  ArrowRight,
  Info,
  CheckCheck,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  Award,
} from 'lucide-react'

type WritingCorrectionOverlayProps = {
  correctionResult: WritingCorrectionResult
  onApplyAll: (newText: string) => void
  onApplySingle: (correction: CorrectionItem) => void
  onDismissSingle: (correctionId: string) => void
  onClose: () => void
  isEditorView: boolean
  onToggleEditorView: () => void
}

type TextSegment =
  | { type: 'text'; text: string }
  | { type: 'correction'; correction: CorrectionItem }

export function WritingCorrectionOverlay({
  correctionResult,
  onApplyAll,
  onApplySingle,
  onDismissSingle,
  onClose,
  isEditorView,
  onToggleEditorView,
}: WritingCorrectionOverlayProps) {
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null)
  const [hoveredCorrectionId, setHoveredCorrectionId] = useState<string | null>(null)
  // Two separate refs to track whether mouse is over anchor or popover, independently
  const isMouseInAnchorRef = useRef(false)
  const isMouseInPopoverRef = useRef(false)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { originalText, correctedFullText, overallFeedback, score, corrections } = correctionResult

  // Clean up any pending timer on unmount
  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current)
    }
  }, [])

  const scheduleClose = () => {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current)
    hoverCloseTimerRef.current = setTimeout(() => {
      // Only actually close if mouse is neither in anchor nor in popover
      if (!isMouseInAnchorRef.current && !isMouseInPopoverRef.current) {
        setHoveredCorrectionId(null)
      }
    }, 300)
  }

  const handleAnchorMouseEnter = (id: string) => {
    isMouseInAnchorRef.current = true
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
    setHoveredCorrectionId(id)
  }

  const handleAnchorMouseLeave = () => {
    isMouseInAnchorRef.current = false
    scheduleClose()
  }

  const handlePopoverMouseEnter = () => {
    isMouseInPopoverRef.current = true
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }

  const handlePopoverMouseLeave = () => {
    isMouseInPopoverRef.current = false
    scheduleClose()
  }

  // Calculate parsed segments
  const segments = useMemo<TextSegment[]>(() => {
    if (!corrections.length || !originalText) {
      return [{ type: 'text', text: originalText }]
    }

    type Match = {
      start: number
      end: number
      correction: CorrectionItem
    }

    const matches: Match[] = []
    let cursor = 0

    const sortedCorrections = [...corrections].sort((a, b) => {
      const idxA = originalText.indexOf(a.original, cursor)
      const idxB = originalText.indexOf(b.original, cursor)
      return (idxA === -1 ? 999999 : idxA) - (idxB === -1 ? 999999 : idxB)
    })

    let searchStart = 0
    for (const corr of sortedCorrections) {
      if (!corr.original) continue
      const idx = originalText.indexOf(corr.original, searchStart)
      if (idx !== -1 && idx >= searchStart) {
        matches.push({
          start: idx,
          end: idx + corr.original.length,
          correction: corr,
        })
        searchStart = idx + corr.original.length
      }
    }

    if (!matches.length) {
      return [{ type: 'text', text: originalText }]
    }

    const segs: TextSegment[] = []
    let lastIdx = 0

    for (const match of matches) {
      if (match.start > lastIdx) {
        segs.push({
          type: 'text',
          text: originalText.slice(lastIdx, match.start),
        })
      }
      segs.push({
        type: 'correction',
        correction: match.correction,
      })
      lastIdx = match.end
    }

    if (lastIdx < originalText.length) {
      segs.push({
        type: 'text',
        text: originalText.slice(lastIdx),
      })
    }

    return segs
  }, [originalText, corrections])

  const errorCount = corrections.filter((c) => c.severity === 'error').length
  const styleCount = corrections.filter((c) => c.severity === 'style' || c.type === 'unnatural_phrasing').length

  const getCategoryLabel = (type: CorrectionItem['type']) => {
    switch (type) {
      case 'letter_error':
        return 'Orthographe'
      case 'word_error':
        return 'Grammaire'
      case 'syntax_structure':
        return 'Structure'
      case 'unnatural_phrasing':
        return 'Tournure'
      case 'punctuation':
        return 'Ponctuation'
      default:
        return 'Correction'
    }
  }

  return (
    <div className="writing-correction-panel">
      {/* SVG Marker Definitions for hand-drawn arrows */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <marker
            id="teacher-arrowhead-green"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#16a34a" />
          </marker>
        </defs>
      </svg>

      {/* Top Banner Toolbar */}
      <div className="correction-top-banner">
        <div className="banner-left">
          <div className="correction-title-wrap">
            <span className="correction-ai-icon-pill">
              <Sparkles size={13} />
            </span>
            <span className="banner-title">Correction du Professeur IA</span>
          </div>

          <div className="banner-badges">
            {score !== undefined && (
              <span className="score-badge" title="Note globale estimée">
                <Award size={12} />
                <span>{score}/100</span>
              </span>
            )}
            {errorCount > 0 && (
              <span className="badge-count error">
                <AlertCircle size={11} />
                <span>{errorCount} {errorCount === 1 ? 'faute' : 'fautes'}</span>
              </span>
            )}
            {styleCount > 0 && (
              <span className="badge-count style">
                <Info size={11} />
                <span>{styleCount} {styleCount === 1 ? 'conseil de style' : 'conseils de style'}</span>
              </span>
            )}
            {corrections.length === 0 && (
              <span className="badge-count success">
                <Check size={11} />
                <span>Texte impeccable !</span>
              </span>
            )}
          </div>
        </div>

        <div className="banner-actions">
          <button
            type="button"
            className="banner-mode-toggle-btn"
            onClick={onToggleEditorView}
            title={isEditorView ? 'Afficher les annotations manuscrites' : 'Masquer les annotations et modifier le texte'}
          >
            {isEditorView ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{isEditorView ? 'Voir annotations' : 'Mode texte brut'}</span>
          </button>

          {corrections.length > 0 && (
            <button
              type="button"
              className="banner-apply-all-btn"
              onClick={() => onApplyAll(correctedFullText)}
              title="Remplacer le texte par la version entièrement corrigée"
            >
              <CheckCheck size={13} />
              <span>Appliquer tout</span>
            </button>
          )}

          <button
            type="button"
            className="banner-close-btn"
            onClick={onClose}
            title="Quitter le mode correction"
            aria-label="Quitter le mode correction"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Teacher General Feedback Note */}
      {overallFeedback && (
        <div className="correction-overall-feedback">
          <span className="feedback-badge-label">Conseil :</span>
          <p className="feedback-text">{overallFeedback}</p>
        </div>
      )}

      {/* Main Annotated Document Canvas */}
      {!isEditorView && (
        <div className="teacher-annotated-canvas" onClick={() => setActivePopoverId(null)}>
          <div className="canvas-paper">
            {segments.map((seg, sIdx) => {
              if (seg.type === 'text') {
                return (
                  <span key={`text_${sIdx}`} className="plain-student-text">
                    {seg.text}
                  </span>
                )
              }

              const corr = seg.correction
              const isActive = activePopoverId === corr.id
              const isHovered = hoveredCorrectionId === corr.id
              const rotation = corr.rotation ?? (sIdx % 2 === 0 ? -1.5 : 1.5)

              return (
                <span
                  key={corr.id}
                  className={`annotated-correction-anchor ${corr.type} ${isActive ? 'active-popover' : ''} ${isHovered ? 'hovered' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePopoverId(isActive ? null : corr.id)
                  }}
                  onMouseEnter={() => handleAnchorMouseEnter(corr.id)}
                  onMouseLeave={handleAnchorMouseLeave}
                >
                  {/* TYPE 1: Letter Error / Word Typo with standard inline serif style */}
                  {(corr.type === 'letter_error' || corr.type === 'word_error' || corr.type === 'punctuation') && (
                    <span className="letter-correction-wrap">
                      {corr.charDiffs && corr.charDiffs.length > 0 ? (
                        corr.charDiffs.map((diff, dIdx) => {
                          if (diff.type === 'removed') {
                            return (
                              <span key={dIdx} className="char-del" title="Supprimer / Erreur">
                                {diff.text}
                              </span>
                            )
                          }
                          if (diff.type === 'inserted') {
                            return (
                              <span key={dIdx} className="char-ins" title="Remplacer / Ajouter">
                                {diff.text}
                              </span>
                            )
                          }
                          return <span key={dIdx} className="char-eq">{diff.text}</span>
                        })
                      ) : (
                        <>
                          <span className="word-del">{corr.original}</span>
                          <span className="word-ins">{corr.corrected}</span>
                        </>
                      )}
                    </span>
                  )}

                  {/* TYPE 2: Syntax Structure with hand-drawn arrow & absolute floating handwriting underneath */}
                  {corr.type === 'syntax_structure' && (
                    <span className="syntax-correction-wrap">
                      <span className="faulty-syntax-phrase">{corr.original}</span>
                      <span className={`teacher-restructure-under ${corr.displaySize === 'large' ? 'large' : ''}`}>
                        <svg
                          className="teacher-arrow-svg"
                          width="16"
                          height="14"
                          viewBox="0 0 16 14"
                        >
                          <path
                            d="M 14 13 Q 7 12 3 3"
                            stroke="#16a34a"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            fill="none"
                            markerEnd="url(#teacher-arrowhead-green)"
                          />
                        </svg>
                        <span className="teacher-handwriting-text">{corr.corrected}</span>
                      </span>
                    </span>
                  )}

                  {/* TYPE 3: Unnatural phrasing with wavy underline & absolute floating handwriting */}
                  {corr.type === 'unnatural_phrasing' && (
                    <span className="unnatural-correction-wrap">
                      <span className="unnatural-phrase-text">{corr.original}</span>
                      <span className={`teacher-restructure-under ${corr.displaySize === 'large' ? 'large' : ''}`}>
                        <svg
                          className="teacher-arrow-svg"
                          width="16"
                          height="14"
                          viewBox="0 0 16 14"
                        >
                          <path
                            d="M 14 13 Q 7 12 3 3"
                            stroke="#16a34a"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            fill="none"
                            markerEnd="url(#teacher-arrowhead-green)"
                          />
                        </svg>
                        <span className="teacher-handwriting-text">{corr.corrected}</span>
                      </span>
                    </span>
                  )}

                  {/* Interactive Floating Popover / Tooltip */}
                  {(isActive || isHovered) && (
                    <div
                      className="correction-floating-popover"
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={handlePopoverMouseEnter}
                      onMouseLeave={handlePopoverMouseLeave}
                    >
                      <div className="popover-header">
                        <span className={`category-tag ${corr.severity}`}>
                          {getCategoryLabel(corr.type)}
                        </span>
                        <button
                          type="button"
                          className="popover-close-btn"
                          onClick={() => setActivePopoverId(null)}
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <div className="popover-diff-preview">
                        <div className="diff-item original">
                          <span className="diff-label">Original :</span>
                          <span className="diff-val strike">{corr.original}</span>
                        </div>
                        <div className="diff-arrow"><ArrowRight size={13} /></div>
                        <div className="diff-item corrected">
                          <span className="diff-label">Suggestion :</span>
                          <span className="diff-val correct-handwriting">{corr.corrected}</span>
                        </div>
                      </div>

                      {corr.explanation && (
                        <div className="popover-explanation">
                          <HelpCircle size={13} className="explanation-icon" />
                          <p>{corr.explanation}</p>
                        </div>
                      )}

                      <div className="popover-actions">
                        <button
                          type="button"
                          className="popover-btn apply"
                          onClick={() => {
                            onApplySingle(corr)
                            setActivePopoverId(null)
                          }}
                        >
                          <Check size={13} />
                          <span>Remplacer</span>
                        </button>

                        <button
                          type="button"
                          className="popover-btn dismiss"
                          onClick={() => {
                            onDismissSingle(corr.id)
                            setActivePopoverId(null)
                          }}
                        >
                          <X size={13} />
                          <span>Ignorer</span>
                        </button>
                      </div>
                    </div>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
