import React, { useState, useEffect, useRef } from 'react'
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
  Info,
  Clock,
  User,
} from 'lucide-react'
import type { ExportedLesson, ExportedLessonComment, StudentComment } from './teacherExportDomain'
import { addLessonReaction, addLessonComment, getExportedLesson } from './teacherExportService'
import type { Stroke } from '../LearningFocus'

type SharedLessonViewerProps = {
  lesson: ExportedLesson
  onBack?: () => void
  isTeacherPreview?: boolean
}

const AVAILABLE_EMOJIS = ['👍', '❤️', '💡', '👏', '🎯', '🤔']

export function SharedLessonViewer({ lesson: initialLesson, onBack, isTeacherPreview }: SharedLessonViewerProps) {
  const [lesson, setLesson] = useState<ExportedLesson>(initialLesson)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)
  const [activeCommentKey, setActiveCommentKey] = useState<string | null>(null)
  const [hoveredCommentKey, setHoveredCommentKey] = useState<string | null>(null)
  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false)
  const [commentsModalOpen, setCommentsModalOpen] = useState(false)

  // Saisie commentaire élève
  const [studentName, setStudentName] = useState(() => localStorage.getItem('vivre_student_name') || '')
  const [commentText, setCommentText] = useState('')
  const [userReacted, setUserReacted] = useState<Record<string, boolean>>({})

  const boardRef = useRef<HTMLDivElement>(null)

  // Recharger les données si le stockage change
  useEffect(() => {
    const refreshed = getExportedLesson(lesson.id)
    if (refreshed) setLesson(refreshed)
  }, [lesson.id])

  const handleReact = (emoji: string) => {
    const updated = addLessonReaction(lesson.id, emoji)
    setLesson((prev) => ({ ...prev, reactions: updated }))
    setUserReacted((prev) => ({ ...prev, [emoji]: true }))
  }

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    const author = studentName.trim() || 'Élève'
    localStorage.setItem('vivre_student_name', author)
    const newComment = addLessonComment(lesson.id, author, commentText)
    if (newComment) {
      setLesson((prev) => ({
        ...prev,
        studentComments: [...(prev.studentComments || []), newComment],
      }))
      setCommentText('')
    }
  }

  const wordCommentMap = new Map<string, ExportedLessonComment>()
  lesson.wordComments.forEach((c) => wordCommentMap.set(c.wordKey, c))

  return (
    <div className="shared-viewer-shell">
      {/* Barre supérieure étudiante */}
      <header className="shared-viewer-header">
        <div className="shared-viewer-header-left">
          {onBack && (
            <button className="shared-back-btn" onClick={onBack} title="Retour">
              <ChevronLeft size={18} />
              <span>{isTeacherPreview ? 'Quitter l\'aperçu' : 'Retour'}</span>
            </button>
          )}
          <div className="shared-teacher-badge">
            <span className="shared-teacher-avatar">
              {(lesson.teacherDisplayName || lesson.username || 'P').charAt(0).toUpperCase()}
            </span>
            <div className="shared-teacher-info">
              <span className="shared-teacher-name">{lesson.teacherDisplayName || `@${lesson.username}`}</span>
              <span className="shared-teacher-sub">Professeur</span>
            </div>
          </div>
        </div>

        <div className="shared-viewer-header-center">
          <h1 className="shared-resource-title">{lesson.resourceTitle}</h1>
          <span className="shared-page-pill">
            Page {lesson.pageIndex + 1} / {lesson.totalPages}
          </span>
        </div>

        <div className="shared-viewer-header-right">
          {lesson.homework && (
            <button
              className="shared-header-hw-btn"
              onClick={() => setHomeworkModalOpen(true)}
              title="Consulter le devoir associé"
            >
              <GraduationCap size={16} />
              <span>Devoir</span>
            </button>
          )}
          {lesson.allowComments && (
            <button
              className="shared-header-comm-btn"
              onClick={() => setCommentsModalOpen(true)}
              title="Commentaires et questions"
            >
              <MessageCircle size={16} />
              <span>Questions ({lesson.studentComments?.length || 0})</span>
            </button>
          )}
        </div>
      </header>

      {/* Corps du document annoté */}
      <main className="shared-viewer-body" onClick={() => { setActiveTooltipId(null); setActiveCommentKey(null); }}>
        <div className="focus-board shared-board" ref={boardRef}>
          <div className="focus-text-col">
            {lesson.paragraphs.map((paragraph) => {
              const green = new Set(paragraph.modifiedIndices ?? [])
              let offset = 0
              return (
                <div key={paragraph.key}>
                  {paragraph.isChapterStart && <h3 className="focus-chapter">{paragraph.chapterTitle}</h3>}
                  <p className="focus-paragraph" style={{ fontSize: lesson.fontSize }}>
                    {paragraph.text.split(/(\s+)/).map((part, index) => {
                      const start = offset
                      offset += part.length
                      if (/\s+/.test(part)) return <span key={index}>{part}</span>
                      const wordKey = `${paragraph.key}:${index}`
                      const comment = wordCommentMap.get(wordKey)
                      const isCommentActive = activeCommentKey === wordKey || hoveredCommentKey === wordKey

                      return (
                        <span
                          key={wordKey}
                          className={`focus-word shared-word ${comment ? 'has-comment' : ''}`}
                          data-word={wordKey}
                          onClick={(e) => {
                            if (comment) {
                              e.stopPropagation()
                              setActiveCommentKey(activeCommentKey === wordKey ? null : wordKey)
                            }
                          }}
                          onMouseEnter={() => comment && setHoveredCommentKey(wordKey)}
                          onMouseLeave={() => setHoveredCommentKey(null)}
                        >
                          {part.split('').map((letter, letterIdx) => {
                            const letterKey = `${wordKey}.${letterIdx}`
                            const userGray = lesson.annotations.grayed.includes(letterKey)
                            const isGreen = green.has(start + letterIdx)
                            return (
                              <span
                                key={letterIdx}
                                data-letter={letterKey}
                                className={`focus-letter ${isGreen ? 'edited-char' : ''} ${userGray ? 'user-gray' : ''}`}
                              >
                                {letter}
                              </span>
                            )
                          })}
                          {/* Popup commentaire du professeur sur mot */}
                          {comment && isCommentActive && (
                            <span className="export-word-comment-card student-view" onClick={(e) => e.stopPropagation()}>
                              <span className="export-word-comment-head">
                                <MessageSquare size={12} />
                                <strong>Remarque du professeur</strong>
                              </span>
                              <span className="export-word-comment-body">{comment.comment}</span>
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Notes textuelles */}
          {lesson.annotations.texts.map((note) => (
            <div
              key={note.id}
              className="focus-text-note shared-text-note"
              style={{ left: note.x, top: note.y, fontSize: note.size }}
            >
              {note.runs.map((run, idx) => (
                <span key={idx} style={{ color: run.c }}>
                  {run.t}
                </span>
              ))}
            </div>
          ))}

          {/* Calque de dessins et liaisons */}
          <svg className="focus-ink shared-ink-layer">
            {lesson.annotations.strokes.map((stroke) => (
              <StrokeShape stroke={stroke} key={stroke.id} />
            ))}
            {lesson.annotations.liaisons.map((liaison) => {
              const midX = (liaison.x1 + liaison.x2) / 2
              return (
                <path
                  key={liaison.id}
                  d={`M ${liaison.x1} ${liaison.y} Q ${midX} ${liaison.y + 22}, ${liaison.x2} ${liaison.y}`}
                  fill="none"
                  stroke={liaison.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {/* Infobulles interactives créées par le professeur */}
          {lesson.tooltips.map((tooltip) => (
            <div
              key={tooltip.id}
              className={`export-tooltip-pin ${activeTooltipId === tooltip.id ? 'active' : ''}`}
              style={{ left: `${tooltip.xPercent}%`, top: `${tooltip.yPercent}%` }}
              onClick={(e) => {
                e.stopPropagation()
                setActiveTooltipId(activeTooltipId === tooltip.id ? null : tooltip.id)
              }}
            >
              <button className="export-tooltip-badge student-badge" title="Cliquer pour lire l'infobulle">
                <HelpCircle size={16} />
              </button>
              {activeTooltipId === tooltip.id && (
                <div className="export-tooltip-popover student-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="export-tooltip-popover-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Info size={14} />
                      <strong>Explication du professeur</strong>
                    </div>
                    <button className="export-popup-close" onClick={() => setActiveTooltipId(null)}>
                      <X size={13} />
                    </button>
                  </div>
                  <p className="export-tooltip-popover-text">{tooltip.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Barre de Réactions (si autorisée par le professeur) */}
      {lesson.allowReactions && (
        <div className="shared-reactions-bar">
          <div className="shared-reactions-title">
            <Smile size={15} />
            <span>Réagir à la leçon</span>
          </div>
          <div className="shared-reactions-list">
            {AVAILABLE_EMOJIS.map((emoji) => {
              const count = lesson.reactions?.[emoji] || 0
              const hasReacted = userReacted[emoji]
              return (
                <button
                  key={emoji}
                  className={`shared-reaction-btn ${hasReacted ? 'reacted' : ''}`}
                  onClick={() => handleReact(emoji)}
                >
                  <span className="shared-reaction-emoji">{emoji}</span>
                  {count > 0 && <span className="shared-reaction-count">{count}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Bouton Devoir Flottant en bas à droite */}
      {lesson.homework && (
        <button
          className="shared-floating-homework-btn"
          onClick={() => setHomeworkModalOpen(true)}
          title="Consulter le devoir à faire"
        >
          <GraduationCap size={22} />
          <span>Devoir à faire</span>
        </button>
      )}

      {/* Modal Devoir complet */}
      {homeworkModalOpen && lesson.homework && (
        <div className="teacher-export-overlay" onClick={() => setHomeworkModalOpen(false)}>
          <div className="teacher-export-card homework-modal" onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <GraduationCap size={22} />
              </div>
              <div>
                <h3>Devoir à faire</h3>
                <p>Consignes laissées par votre professeur pour ce cours.</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setHomeworkModalOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body">
              <div className="homework-detail-block">
                <label>Énoncé / Consignes :</label>
                <div className="homework-detail-text">{lesson.homework.title}</div>
              </div>

              {lesson.homework.dueDate && (
                <div className="homework-detail-row">
                  <Calendar size={16} />
                  <span>
                    À rendre pour le : <strong>{new Date(lesson.homework.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                  </span>
                </div>
              )}

              {lesson.homework.instructions && (
                <div className="homework-detail-block">
                  <label>Modalités de rendu :</label>
                  <div className="homework-detail-subtext">{lesson.homework.instructions}</div>
                </div>
              )}

              {lesson.homework.attachmentName && (
                <div className="homework-detail-block">
                  <label>Pièce jointe :</label>
                  <div className="homework-attachment-card">
                    <Paperclip size={16} />
                    <span className="homework-attachment-name">{lesson.homework.attachmentName}</span>
                    {lesson.homework.attachmentData && (
                      <a
                        href={lesson.homework.attachmentData}
                        download={lesson.homework.attachmentName}
                        className="btn-download"
                      >
                        Télécharger
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <footer className="teacher-export-card-foot">
              <button type="button" className="btn-primary" onClick={() => setHomeworkModalOpen(false)} autoFocus>
                <span>Fermer</span>
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal Commentaires & Questions élèves */}
      {commentsModalOpen && lesson.allowComments && (
        <div className="teacher-export-overlay" onClick={() => setCommentsModalOpen(false)}>
          <div className="teacher-export-card comments-modal" onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <MessageCircle size={20} />
              </div>
              <div>
                <h3>Questions &amp; Commentaires</h3>
                <p>Échangez avec le professeur et les autres élèves.</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setCommentsModalOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body student-comments-container">
              {/* Liste des commentaires */}
              <div className="student-comments-list">
                {(!lesson.studentComments || lesson.studentComments.length === 0) ? (
                  <p className="no-comments-msg">Aucune question pour le moment. Soyez le premier à poser une question !</p>
                ) : (
                  lesson.studentComments.map((comm) => (
                    <div key={comm.id} className="student-comment-bubble">
                      <div className="student-comment-bubble-head">
                        <span className="student-comment-author">{comm.authorName}</span>
                        <span className="student-comment-date">
                          {new Date(comm.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="student-comment-bubble-text">{comm.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Formulaire de saisie d'un nouveau commentaire */}
              <form onSubmit={handlePostComment} className="student-comment-form">
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    placeholder="Votre prénom / nom"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    style={{ flex: '0 0 160px' }}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Posez votre question sur cette leçon..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{ flex: 1 }}
                    required
                  />
                  <button type="submit" className="btn-primary" disabled={!commentText.trim()}>
                    <Send size={15} />
                  </button>
                </div>
              </form>
            </div>

            <footer className="teacher-export-card-foot">
              <button type="button" className="btn-secondary" onClick={() => setCommentsModalOpen(false)}>
                Fermer
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

function StrokeShape({ stroke }: { stroke: Stroke }) {
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
  const span = stroke.points.reduce((max, point) => Math.max(max, Math.hypot(point.x - first.x, point.y - first.y)), 0)
  if (span < 3 && (stroke.kind === 'pen' || stroke.kind === 'highlighter')) {
    return <circle cx={first.x} cy={first.y} r={stroke.width / 2} fill={stroke.color} stroke="none" opacity={opacity} />
  }
  if (stroke.kind === 'pen' || stroke.kind === 'highlighter') {
    const d = `M ${first.x} ${first.y} ` + rest.map((point) => `L ${point.x} ${point.y}`).join(' ')
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
