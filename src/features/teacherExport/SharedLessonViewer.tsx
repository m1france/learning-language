import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  GraduationCap,
  HelpCircle,
  MessageSquare,
  Smile,
  MessageCircle,
  Send,
  Calendar,
  Paperclip,
  X,
  FileText,
  Check,
  ChevronLeft,
  Share2,
  Clock,
  User,
  Trash2,
} from 'lucide-react'
import type { UiLanguage } from '../../domain'
import { teacherCopy } from '../../i18n'
import type {
  ExportedLesson,
  ExportedLessonComment,
  ExportedLessonPage,
  StudentComment,
  StudentFigmaComment,
  StudentSticker,
} from './teacherExportDomain'
import {
  addLessonReaction,
  addLessonComment,
  addStudentFigmaComment,
  addStudentSticker,
  getExportedLesson,
} from './teacherExportService'
import type { Stroke, Liaison } from '../LearningFocus'

type SharedLessonViewerProps = {
  lesson: ExportedLesson
  onBack?: () => void
  isTeacherPreview?: boolean
  ui?: UiLanguage
}

const AVAILABLE_STICKER_EMOJIS = ['👍', '❤️', '💡', '👏', '🎯', '🔥', '🤔', '✨']

export function SharedLessonViewer({
  lesson: initialLesson,
  onBack,
  isTeacherPreview,
  ui = 'fr',
}: SharedLessonViewerProps) {
  const t = teacherCopy[ui] || teacherCopy.fr
  const [lesson, setLesson] = useState<ExportedLesson>(initialLesson)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)
  const [activeWordCommentKey, setActiveWordCommentKey] = useState<string | null>(null)
  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false)

  // Mode Figma Commentaire
  const [isFigmaCommentMode, setIsFigmaCommentMode] = useState(false)
  const [draftFigmaComment, setDraftFigmaComment] = useState<{
    pageIndex: number
    xPercent: number
    yPercent: number
    text: string
  } | null>(null)
  const [activeFigmaCommentId, setActiveFigmaCommentId] = useState<string | null>(null)

  // Mode Sticker Réaction
  const [selectedStickerEmoji, setSelectedStickerEmoji] = useState<string | null>(null)

  // Identité élève
  const [studentName, setStudentName] = useState(() => localStorage.getItem('vivre_student_name') || '')

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Recharger les données si le stockage local change
  useEffect(() => {
    const refreshed = getExportedLesson(lesson.id)
    if (refreshed) setLesson(refreshed)
  }, [lesson.id])

  // Normalisation des pages : toutes les pages si disponibles
  const allPages: ExportedLessonPage[] = useMemo(() => {
    if (lesson.pages && lesson.pages.length > 0) {
      return lesson.pages
    }
    return [
      {
        pageIndex: lesson.pageIndex || 0,
        chapterTitle: lesson.chapterTitle,
        paragraphs: lesson.paragraphs || [],
        annotations: lesson.annotations || { strokes: [], liaisons: [], texts: [], grayed: [], order: [] },
      },
    ]
  }, [lesson])

  // Map des commentaires de mots du professeur
  const wordCommentMap = useMemo(() => {
    const map = new Map<string, ExportedLessonComment>()
    ;(lesson.wordComments || []).forEach((c) => map.set(c.wordKey, c))
    return map
  }, [lesson.wordComments])

  // Clic sur une page pour déposer un sticker ou un commentaire Figma
  const handlePageClick = (pIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const pageEl = pageRefs.current[pIdx]
    if (!pageEl) return

    const rect = pageEl.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const xPercent = Math.max(2, Math.min(98, (x / rect.width) * 100))
    const yPercent = Math.max(2, Math.min(98, (y / rect.height) * 100))

    // 1. Dépose de Sticker
    if (selectedStickerEmoji && lesson.allowReactions) {
      const newSticker = addStudentSticker(lesson.id, {
        pageIndex: pIdx,
        xPercent,
        yPercent,
        emoji: selectedStickerEmoji,
      })
      if (newSticker) {
        setLesson((prev) => ({
          ...prev,
          stickers: [...(prev.stickers || []), newSticker],
        }))
      }
      setSelectedStickerEmoji(null)
      return
    }

    // 2. Dépose de Commentaire Figma
    if (isFigmaCommentMode && lesson.allowComments) {
      setDraftFigmaComment({
        pageIndex: pIdx,
        xPercent,
        yPercent,
        text: '',
      })
      setIsFigmaCommentMode(false)
      return
    }
  }

  // Glisser-déposer d'un sticker depuis le dock vertical
  const handleStickerDrop = (pIdx: number, emoji: string, e: React.DragEvent<HTMLDivElement>) => {
    if (!lesson.allowReactions) return
    const pageEl = pageRefs.current[pIdx]
    if (!pageEl) return

    const rect = pageEl.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const xPercent = Math.max(2, Math.min(98, (x / rect.width) * 100))
    const yPercent = Math.max(2, Math.min(98, (y / rect.height) * 100))

    const newSticker = addStudentSticker(lesson.id, {
      pageIndex: pIdx,
      xPercent,
      yPercent,
      emoji,
    })
    if (newSticker) {
      setLesson((prev) => ({
        ...prev,
        stickers: [...(prev.stickers || []), newSticker],
      }))
    }
  }

  // Envoi du commentaire Figma
  const handleSendFigmaComment = () => {
    if (!draftFigmaComment || !draftFigmaComment.text.trim()) return
    const author = studentName.trim() || 'Student'
    localStorage.setItem('vivre_student_name', author)

    const newComment = addStudentFigmaComment(lesson.id, {
      pageIndex: draftFigmaComment.pageIndex,
      xPercent: draftFigmaComment.xPercent,
      yPercent: draftFigmaComment.yPercent,
      authorName: author,
      text: draftFigmaComment.text.trim(),
    })

    if (newComment) {
      setLesson((prev) => ({
        ...prev,
        figmaComments: [...(prev.figmaComments || []), newComment],
      }))
    }
    setDraftFigmaComment(null)
  }

  return (
    <div className={`shared-viewer-shell ${selectedStickerEmoji ? 'is-stamping-sticker' : ''} ${isFigmaCommentMode ? 'is-figma-commenting' : ''}`}>
      {/* Barre supérieure étudiante */}
      <header className="shared-viewer-header">
        <div className="shared-viewer-header-left">
          {onBack && isTeacherPreview && (
            <button className="shared-back-btn" onClick={onBack} title={t.quitPreview}>
              <ChevronLeft size={18} />
              <span>{t.quitPreview}</span>
            </button>
          )}
          <div className="shared-teacher-badge">
            <span className="shared-teacher-avatar">
              {(lesson.teacherDisplayName || lesson.username || 'P').charAt(0).toUpperCase()}
            </span>
            <div className="shared-teacher-info">
              <span className="shared-teacher-name">{lesson.teacherDisplayName || `@${lesson.username}`}</span>
              <span className="shared-teacher-sub">{t.teacherLabel}</span>
            </div>
          </div>
        </div>

        <div className="shared-viewer-header-center">
          <h1 className="shared-resource-title">{lesson.resourceTitle}</h1>
        </div>

        <div className="shared-viewer-header-right">
          {/* Bouton Commentaire Figma pour les élèves */}
          {lesson.allowComments && (
            <button
              type="button"
              className={`figma-comment-trigger-btn ${isFigmaCommentMode ? 'active' : ''}`}
              onClick={() => {
                setIsFigmaCommentMode(!isFigmaCommentMode)
                setSelectedStickerEmoji(null)
              }}
              title={t.commentOnPage}
            >
              <MessageSquare size={15} />
              <span>{isFigmaCommentMode ? t.clickOnPage : t.commentBtn}</span>
              {(lesson.figmaComments?.length || 0) > 0 && (
                <span className="figma-count-pill">{lesson.figmaComments?.length}</span>
              )}
            </button>
          )}

          {/* Bouton Devoir en haut s'il existe */}
          {lesson.homework && (
            <button
              type="button"
              className="shared-header-hw-btn"
              onClick={() => setHomeworkModalOpen(true)}
              title={t.viewHomework}
            >
              <GraduationCap size={16} />
              <span>{t.homeworkBtn}</span>
            </button>
          )}
        </div>
      </header>

      {/* Corps défilable contenant TOUTES les pages de la ressource */}
      <main className="shared-viewer-body">
        <div className="shared-multi-pages-container">
          {allPages.map((p, pIdx) => {
            const pageTooltips = (lesson.tooltips || []).filter((t) => (t.pageIndex ?? 0) === p.pageIndex)
            const pageWordComments = (lesson.wordComments || []).filter((c) => (c.pageIndex ?? 0) === p.pageIndex)
            const pageStickers = (lesson.stickers || []).filter((s) => (s.pageIndex ?? 0) === p.pageIndex)
            const pageFigmaComments = (lesson.figmaComments || []).filter((fc) => (fc.pageIndex ?? 0) === p.pageIndex)
            const commentKeys = new Set(pageWordComments.map((c) => c.wordKey))

            return (
              <div
                key={p.pageIndex}
                className="shared-page-block"
              >
                {/* Séparateur entre les pages si plusieurs pages */}
                {allPages.length > 1 && (
                  <div className="shared-page-divider">
                    <span className="shared-page-divider-line" />
                    <span className="shared-page-divider-badge">PAGE {p.pageIndex + 1}</span>
                    <span className="shared-page-divider-line" />
                  </div>
                )}

                {/* Tableau relatif de la page — Exactement identique à focus-board */}
                <div
                  ref={(el) => {
                    pageRefs.current[p.pageIndex] = el
                  }}
                  className="shared-page-board focus-board"
                  style={{ fontSize: lesson.fontSize || 32 }}
                  onClick={(e) => handlePageClick(p.pageIndex, e)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const emoji = e.dataTransfer.getData('text/plain')
                    if (emoji) {
                      handleStickerDrop(p.pageIndex, emoji, e)
                    }
                  }}
                >
                  {/* Layer 1 : Stickers d'élèves en arrière-plan sous le texte (z-index: 2) */}
                  {pageStickers.map((sticker) => (
                    <div
                      key={sticker.id}
                      className="student-placed-sticker"
                      style={{
                        left: `${sticker.xPercent}%`,
                        top: `${sticker.yPercent}%`,
                      }}
                      title={`Sticker déposé par un élève le ${new Date(sticker.createdAt).toLocaleDateString()}`}
                    >
                      <span>{sticker.emoji}</span>
                    </div>
                  ))}

                  {/* Layer 2 : Paragraphes de texte et titres de chapitre (z-index: 5) */}
                  <div className="focus-text-col">
                    {p.paragraphs.map((par) => {
                      const words = par.text.split(/(\s+)/)
                      const greenSet = new Set(par.modifiedIndices || [])
                      let letterOffset = 0

                      return (
                        <div key={par.key}>
                          {par.isChapterStart && <h3 className="focus-chapter">{par.chapterTitle}</h3>}
                          <p className="focus-paragraph">
                            {words.map((word, wIdx) => {
                              if (/\s+/.test(word)) {
                                letterOffset += word.length
                                return <span key={wIdx}>{word}</span>
                              }

                              const wordKey = `${par.key}:${wIdx}`
                              const hasComment = commentKeys.has(wordKey)
                              const commentObj = pageWordComments.find((c) => c.wordKey === wordKey)

                              const wordEl = (
                                <span
                                  key={wIdx}
                                  className={`export-word ${hasComment ? 'has-comment' : ''}`}
                                  onClick={(e) => {
                                    if (hasComment && commentObj) {
                                      e.stopPropagation()
                                      setActiveWordCommentKey(
                                        activeWordCommentKey === commentObj.id ? null : commentObj.id
                                      )
                                    }
                                  }}
                                >
                                  {word.split('').map((letter, lIdx) => {
                                    const letterKey = `${par.key}:${wIdx}.${lIdx}`
                                    const isGrayed = p.annotations.grayed.includes(letterKey)
                                    const isGreen = greenSet.has(letterOffset + lIdx)

                                    return (
                                      <span
                                        key={lIdx}
                                        className={`focus-letter ${isGreen ? 'edited-char' : ''} ${
                                          isGrayed ? 'user-gray' : ''
                                        }`}
                                      >
                                        {letter}
                                      </span>
                                    )
                                  })}
                                </span>
                              )

                              letterOffset += word.length

                              if (hasComment && commentObj) {
                                return (
                                  <span key={wIdx} className="export-commented-word-wrap">
                                    {wordEl}
                                    {activeWordCommentKey === commentObj.id && (
                                      <div
                                        className="export-word-comment-card student-comment-popover"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="export-word-comment-head">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <MessageSquare size={12} />
                                            <strong>{t.teacherCommentTitle}</strong>
                                          </div>
                                          <button
                                            type="button"
                                            className="export-popup-close"
                                            onClick={() => setActiveWordCommentKey(null)}
                                            title={t.close}
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                        <span className="export-word-comment-body">{commentObj.comment}</span>
                                      </div>
                                    )}
                                  </span>
                                )
                              }

                              return wordEl
                            })}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Layer 3 : Dessins SVG du professeur au-dessus du texte (z-index: 10) */}
                  <svg className="export-drawing-svg focus-ink" aria-hidden="true">
                    {p.annotations.strokes.map((stroke, sIdx) => (
                      <StrokeRender key={sIdx} stroke={stroke} />
                    ))}
                    {p.annotations.liaisons.map((liaison, lIdx) => (
                      <LiaisonRender key={lIdx} liaison={liaison} />
                    ))}
                  </svg>

                  {/* Layer 4 : Notes textuelles du professeur (z-index: 12) */}
                  {p.annotations.texts.map((note) => (
                    <div
                      key={note.id}
                      className="export-text-note-pin focus-text-note read-only"
                      style={{
                        left: note.x,
                        top: note.y,
                        fontSize: note.size || 22,
                        color: note.color || '#20201e',
                      }}
                    >
                      <span>{note.runs.map((r) => r.t).join('')}</span>
                    </div>
                  ))}

                  {/* Layer 5 : Infobulles du professeur (Icône orange minimaliste) (z-index: 15) */}
                  {pageTooltips.map((tip) => {
                    const isOpen = activeTooltipId === tip.id
                    return (
                      <div
                        key={tip.id}
                        className="export-tooltip-pin"
                        style={{ left: `${tip.xPercent}%`, top: `${tip.yPercent}%` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="export-tooltip-minimal-btn student-tooltip-btn"
                          onClick={() => setActiveTooltipId(isOpen ? null : tip.id)}
                          title={t.tooltipExplanation}
                        >
                          <HelpCircle size={20} className="minimal-orange-icon" />
                        </button>

                        {isOpen && (
                          <div className="export-tooltip-popover student-tooltip-popover">
                            <div className="export-tooltip-popover-head">
                              <span>{t.tooltipExplanation}</span>
                              <button
                                type="button"
                                className="export-popup-close"
                                onClick={() => setActiveTooltipId(null)}
                                title={t.close}
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <p className="export-tooltip-popover-text">{tip.text}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Layer 6 : Commentaires Figma d'élèves (z-index: 20) */}
                  {pageFigmaComments.map((fc) => {
                    const isOpen = activeFigmaCommentId === fc.id
                    return (
                      <div
                        key={fc.id}
                        className="figma-comment-pin"
                        style={{ left: `${fc.xPercent}%`, top: `${fc.yPercent}%` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="figma-comment-pin-badge"
                          onClick={() => setActiveFigmaCommentId(isOpen ? null : fc.id)}
                          title={`Commentaire de ${fc.authorName}`}
                        >
                          <MessageSquare size={13} />
                        </button>

                        {isOpen && (
                          <div className="figma-comment-popover">
                            <div className="figma-comment-popover-head">
                              <strong>{fc.authorName}</strong>
                              <span className="figma-comment-date">
                                {new Date(fc.createdAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </span>
                              <button
                                type="button"
                                className="export-del-btn"
                                onClick={() => setActiveFigmaCommentId(null)}
                                title="Fermer"
                              >
                                <X size={13} />
                              </button>
                            </div>
                            <p className="figma-comment-popover-text">{fc.text}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Saisie d'un nouveau commentaire Figma avec Pin et popup attachée */}
                  {draftFigmaComment && draftFigmaComment.pageIndex === p.pageIndex && (
                    <div
                      className="figma-comment-pin drafting"
                      style={{
                        left: `${draftFigmaComment.xPercent}%`,
                        top: `${draftFigmaComment.yPercent}%`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="figma-comment-pin-badge active">
                        <MessageSquare size={13} />
                      </div>

                      <div className="figma-comment-input-card attached-popup">
                        <div className="figma-comment-input-head">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MessageSquare size={13} style={{ color: '#0d99ff' }} />
                            <span>{t.yourCommentTitle}</span>
                          </div>
                          <button
                            type="button"
                            className="export-del-btn"
                            onClick={() => setDraftFigmaComment(null)}
                            title={t.close}
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="figma-comment-input-body">
                          <input
                            type="text"
                            placeholder={t.studentNamePlaceholder}
                            value={studentName}
                            onChange={(e) => setStudentName(e.target.value)}
                            className="figma-name-input"
                          />
                          <div className="figma-textarea-wrap">
                            <textarea
                              autoFocus
                              placeholder={t.studentCommentPlaceholder}
                              value={draftFigmaComment.text}
                              onChange={(e) =>
                                setDraftFigmaComment({ ...draftFigmaComment, text: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSendFigmaComment()
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="figma-send-icon-btn"
                              disabled={!draftFigmaComment.text.trim()}
                              onClick={handleSendFigmaComment}
                              title={t.sendComment}
                            >
                              <Send size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Dock vertical de stickers en bas à droite (uniquement les emojis avec drag & drop) */}
      {lesson.allowReactions && (
        <div className="shared-vertical-sticker-dock">
          {AVAILABLE_STICKER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              draggable="true"
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', emoji)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className={`shared-sticker-dock-btn ${selectedStickerEmoji === emoji ? 'selected' : ''}`}
              onClick={() => {
                setSelectedStickerEmoji(selectedStickerEmoji === emoji ? null : emoji)
                setIsFigmaCommentMode(false)
              }}
              title={`Glisser-déposer ${emoji} sur la page, ou cliquer`}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bouton Devoir Flottant (bas droite) */}
      {lesson.homework && (
        <button
          className="shared-floating-homework-btn"
          onClick={() => setHomeworkModalOpen(true)}
          title={t.viewHomework}
        >
          <GraduationCap size={18} />
          <span>{t.homeworkBtn}</span>
        </button>
      )}

      {/* Modal Détails du Devoir */}
      {homeworkModalOpen && lesson.homework && (
        <div className="teacher-export-overlay" onClick={() => setHomeworkModalOpen(false)}>
          <div className="teacher-export-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <GraduationCap size={22} />
              </div>
              <div>
                <h3>{t.homeworkDetailsTitle}</h3>
                <p>{t.homeworkTeacherInstructions}</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setHomeworkModalOpen(false)} title={t.close}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body">
              <div className="homework-detail-block">
                <label>{t.homeworkPromptLabel}</label>
                <div className="homework-detail-text">{lesson.homework.title}</div>
              </div>

              {lesson.homework.dueDate && (
                <div className="homework-detail-block">
                  <label>{t.homeworkDueDateLabel}</label>
                  <div className="homework-detail-row">
                    <Calendar size={15} />
                    <span>
                      {t.homeworkDueFor}{' '}
                      <strong>
                        {new Date(lesson.homework.dueDate).toLocaleDateString(ui === 'fr' ? 'fr-FR' : (ui === 'en' ? 'en-US' : (ui === 'es' ? 'es-ES' : (ui === 'zh' ? 'zh-CN' : (ui === 'ru' ? 'ru-RU' : 'pt-PT')))), {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {lesson.homework.instructions && (
                <div className="homework-detail-block">
                  <label>{t.homeworkInstructionsLabel}</label>
                  <div className="homework-detail-subtext">{lesson.homework.instructions}</div>
                </div>
              )}

              {lesson.homework.attachmentName && lesson.homework.attachmentData && (
                <div className="homework-detail-block">
                  <label>{t.homeworkAttachmentLabel}</label>
                  <div className="homework-attachment-card">
                    <Paperclip size={16} />
                    <span className="homework-attachment-name">{lesson.homework.attachmentName}</span>
                    <a
                      href={lesson.homework.attachmentData}
                      download={lesson.homework.attachmentName}
                      className="btn-download"
                    >
                      {t.homeworkDownload}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <footer className="teacher-export-card-foot">
              <button type="button" className="primary" onClick={() => setHomeworkModalOpen(false)}>
                <span>{t.gotIt}</span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

function StrokeRender({ stroke }: { stroke: Stroke }) {
  const opacity = stroke.kind === 'highlighter' ? 0.35 : 1
  const common = {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    opacity,
  }
  const [first, ...rest] = stroke.points
  if (!first) return null

  if (stroke.points.length <= 1) {
    return <circle cx={first.x} cy={first.y} r={stroke.width / 2} fill={stroke.color} opacity={opacity} />
  }

  if (stroke.kind === 'pen' || stroke.kind === 'highlighter') {
    const d = `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ')
    return <path d={d} {...common} />
  }

  const last = stroke.points[stroke.points.length - 1] ?? first
  const x = Math.min(first.x, last.x)
  const y = Math.min(first.y, last.y)
  const w = Math.abs(last.x - first.x)
  const h = Math.abs(last.y - first.y)

  if (stroke.kind === 'rect') return <rect x={x} y={y} width={w} height={h} rx={4} {...common} />
  if (stroke.kind === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  if (stroke.kind === 'line') return <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} {...common} />

  const angle = Math.atan2(last.y - first.y, last.x - first.x)
  const head = 10 + stroke.width
  const a1 = angle + Math.PI * 0.82
  const a2 = angle - Math.PI * 0.82

  return (
    <g {...common}>
      <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
      <path
        d={`M ${last.x} ${last.y} L ${last.x + head * Math.cos(a1)} ${last.y + head * Math.sin(a1)} M ${last.x} ${last.y} L ${last.x + head * Math.cos(a2)} ${last.y + head * Math.sin(a2)}`}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}

function LiaisonRender({ liaison }: { liaison: Liaison }) {
  const midX = (liaison.x1 + liaison.x2) / 2
  return (
    <path
      d={`M ${liaison.x1} ${liaison.y} Q ${midX} ${liaison.y + 22}, ${liaison.x2} ${liaison.y}`}
      fill="none"
      stroke={liaison.color || '#d64545'}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  )
}
