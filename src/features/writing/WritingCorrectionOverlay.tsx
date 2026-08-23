import React, { useState, useMemo } from 'react'
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

  const { originalText, correctedFullText, overallFeedback, score, corrections } = correctionResult

  // Calculate parsed segments
  const segments = useMemo<TextSegment[]>(() => {
    if (!corrections.length || !originalText) {
      return [{ type: 'text', text: originalText }]
    }

    // Find non-overlapping occurrences of correction.original in originalText
    type Match = {
      start: number
      end: number
      correction: CorrectionItem
    }

    const matches: Match[] = []
    let cursor = 0

    // Sort corrections by where they first appear in originalText
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
        return 'Grammaire & Vocabulaire'
      case 'syntax_structure':
        return 'Structure de phrase'
      case 'unnatural_phrasing':
        return 'Tournure idiomatique'
      case 'punctuation':
        return 'Ponctuation & Majuscule'
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
          <marker
            id="teacher-arrowhead-blue"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#2563eb" />
          </marker>
        </defs>
      </svg>

      {/* Top Banner Toolbar */}
      <div className="correction-top-banner">
        <div className="banner-left">
          <div className="correction-title-wrap">
            <span className="correction-ai-icon-pill">
              <Sparkles size={14} />
            </span>
            <span className="banner-title">Correction du Professeur IA</span>
          </div>

          <div className="banner-badges">
            {score !== undefined && (
              <span className="score-badge" title="Note globale estimée">
                <Award size={13} />
                <span>{score}/100</span>
              </span>
            )}
            {errorCount > 0 && (
              <span className="badge-count error">
                <AlertCircle size={12} />
                <span>{errorCount} {errorCount === 1 ? 'faute' : 'fautes'}</span>
              </span>
            )}
            {styleCount > 0 && (
              <span className="badge-count style">
                <Info size={12} />
                <span>{styleCount} {styleCount === 1 ? 'conseil de style' : 'conseils de style'}</span>
              </span>
            )}
            {corrections.length === 0 && (
              <span className="badge-count success">
                <Check size={12} />
                <span>Texte parfait ! Aucun défaut repéré.</span>
              </span>
            )}
          </div>
        </div>

        <div className="banner-actions">
          <button
            type="button"
            className="outline mode-toggle-btn"
            onClick={onToggleEditorView}
            title={isEditorView ? 'Afficher les annotations manuscrites' : 'Masquer les annotations et modifier le texte'}
          >
            {isEditorView ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{isEditorView ? 'Voir annotations' : 'Mode texte brut'}</span>
          </button>

          {corrections.length > 0 && (
            <button
              type="button"
              className="primary apply-all-btn"
              onClick={() => onApplyAll(correctedFullText)}
              title="Remplacer le texte par la version entièrement corrigée"
            >
              <CheckCheck size={14} />
              <span>Appliquer tout</span>
            </button>
          )}

          <button
            type="button"
            className="outline close-btn"
            onClick={onClose}
            title="Quitter le mode correction"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Teacher General Feedback Note */}
      {overallFeedback && (
        <div className="correction-overall-feedback">
          <div className="feedback-quote-icon">📝</div>
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
                  onMouseEnter={() => setHoveredCorrectionId(corr.id)}
                  onMouseLeave={() => setHoveredCorrectionId(null)}
                >
                  {/* TYPE 1: Letter Error / Word Typo with red strike and green handwriting */}
                  {(corr.type === 'letter_error' || corr.type === 'word_error' || corr.type === 'punctuation') && (
                    <span className="letter-correction-wrap">
                      {corr.charDiffs && corr.charDiffs.length > 0 ? (
                        corr.charDiffs.map((diff, dIdx) => {
                          if (diff.type === 'removed') {
                            return (
                              <span key={dIdx} className="char-del" title="Lettre fautive">
                                {diff.text}
                              </span>
                            )
                          }
                          if (diff.type === 'inserted') {
                            return (
                              <span
                                key={dIdx}
                                className="char-ins"
                                style={{ transform: `rotate(${rotation}deg)` }}
                                title="Correction du professeur"
                              >
                                {diff.text}
                              </span>
                            )
                          }
                          return <span key={dIdx} className="char-eq">{diff.text}</span>
                        })
                      ) : (
                        <>
                          <span className="word-del">{corr.original}</span>
                          <span
                            className="word-ins"
                            style={{ transform: `rotate(${rotation}deg)` }}
                          >
                            {corr.corrected}
                          </span>
                        </>
                      )}
                    </span>
                  )}

                  {/* TYPE 2: Syntax Structure with hand-drawn arrow & handwriting sentence underneath */}
                  {corr.type === 'syntax_structure' && (
                    <span className="syntax-correction-wrap">
                      <span className="faulty-syntax-phrase">{corr.original}</span>
                      <span
                        className="teacher-restructure-under"
                        style={{ transform: `rotate(${rotation}deg)` }}
                      >
                        <svg
                          className="teacher-arrow-svg"
                          width="24"
                          height="20"
                          viewBox="0 0 24 20"
                        >
                          <path
                            d="M 4 18 C 10 16, 14 10, 18 4"
                            stroke="#16a34a"
                            strokeWidth="2"
                            strokeLinecap="round"
                            fill="none"
                            markerEnd="url(#teacher-arrowhead-green)"
                          />
                        </svg>
                        <span className="teacher-handwriting-text">{corr.corrected}</span>
                      </span>
                    </span>
                  )}

                  {/* TYPE 3: Unnatural phrasing with dotted underline & tooltip bubble */}
                  {corr.type === 'unnatural_phrasing' && (
                    <span className="unnatural-correction-wrap">
                      <span className="unnatural-phrase-text">{corr.original}</span>
                      <button
                        type="button"
                        className="naturalness-info-bubble"
                        title="Conseil de formulation naturelle (clique pour voir l'explication)"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActivePopoverId(isActive ? null : corr.id)
                        }}
                      >
                        💡
                      </button>
                    </span>
                  )}

                  {/* Interactive Floating Popover / Tooltip */}
                  {(isActive || isHovered) && (
                    <div
                      className="correction-floating-popover"
                      onClick={(e) => e.stopPropagation()}
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
                          <span>Remplacer par cette correction</span>
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
