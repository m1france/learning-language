import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  HelpCircle,
  Type,
  MessageSquare,
  GraduationCap,
  X,
  Send,
  Trash2,
  Paperclip,
  Calendar,
  FileText,
  Check,
  ArrowRight,
  Info,
  Sparkles,
  Smile,
  MessageCircle,
} from 'lucide-react'
import type { Resource } from '../../domain'
import type { PageAnnotations, Point, Stroke, TextNote, TextRun, Liaison } from '../LearningFocus'
import { modifiedCharIndices } from '../LearningFocus'
import type {
  ExportedLesson,
  ExportedLessonComment,
  ExportedLessonHomework,
  ExportedLessonParagraph,
  ExportedLessonTooltip,
} from './teacherExportDomain'

type ActiveAction = 'none' | 'tooltip' | 'text' | 'comment'

type ExportPreviewFrameProps = {
  resource: Resource
  pageIndex: number
  totalPages: number
  paragraphs: ExportedLessonParagraph[]
  annotations: PageAnnotations
  fontSize: number
  teacherUsername: string
  teacherName?: string
  onCancel: () => void
  onExport: (exportedLesson: ExportedLesson) => void
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function ExportPreviewFrame({
  resource,
  pageIndex,
  totalPages,
  paragraphs,
  annotations: initialAnnotations,
  fontSize,
  teacherUsername,
  teacherName,
  onCancel,
  onExport,
}: ExportPreviewFrameProps) {
  const [annotations, setAnnotations] = useState<PageAnnotations>(initialAnnotations)
  const [activeAction, setActiveAction] = useState<ActiveAction>('none')

  // Infobulles
  const [tooltips, setTooltips] = useState<ExportedLessonTooltip[]>([])
  const [draftTooltip, setDraftTooltip] = useState<{ x: number; y: number; xPercent: number; yPercent: number; text: string } | null>(null)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)

  // Commentaires sur les mots
  const [wordComments, setWordComments] = useState<ExportedLessonComment[]>([])
  const [draftComment, setDraftComment] = useState<{ wordKey: string; wordText: string; x: number; y: number; text: string } | null>(null)
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)

  // Notes texte ajoutées dans la frame
  const [draftTextNote, setDraftTextNote] = useState<{ x: number; y: number; text: string; color: string; size: number } | null>(null)

  // Devoir
  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false)
  const [homework, setHomework] = useState<ExportedLessonHomework | null>(null)
  const [hwTitle, setHwTitle] = useState('')
  const [hwAttachmentName, setHwAttachmentName] = useState('')
  const [hwAttachmentData, setHwAttachmentData] = useState('')
  const [hwDueDate, setHwDueDate] = useState('')
  const [hwInstructions, setHwInstructions] = useState('')

  // Modal final de configuration d'export (toggles)
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false)
  const [allowReactions, setAllowReactions] = useState(true)
  const [allowComments, setAllowComments] = useState(true)

  const boardRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Annulation par touche Échap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (draftTooltip) {
          setDraftTooltip(null)
          return
        }
        if (draftComment) {
          setDraftComment(null)
          return
        }
        if (draftTextNote) {
          setDraftTextNote(null)
          return
        }
        if (homeworkModalOpen) {
          setHomeworkModalOpen(false)
          return
        }
        if (finalizeModalOpen) {
          setFinalizeModalOpen(false)
          return
        }
        if (activeAction !== 'none') {
          setActiveAction('none')
          return
        }
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [draftTooltip, draftComment, draftTextNote, homeworkModalOpen, finalizeModalOpen, activeAction, onCancel])

  // Clic sur le tableau
  const handleBoardClick = (e: React.MouseEvent) => {
    // Ignorer les clics sur les contrôles existants ou popups
    if ((e.target as HTMLElement).closest('.export-popup, .export-tooltip-badge, .export-action-btn, .homework-modal, .finalize-modal')) {
      return
    }

    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100))
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100))

    if (activeAction === 'tooltip') {
      // Ouvre la popup de saisie de l'infobulle juste en haut à droite du point cliqué
      setDraftTooltip({
        x: Math.min(rect.width - 240, Math.max(10, x + 8)),
        y: Math.max(10, y - 45),
        xPercent,
        yPercent,
        text: '',
      })
      return
    }

    if (activeAction === 'text') {
      setDraftTextNote({
        x: Math.min(rect.width - 200, Math.max(10, x)),
        y: Math.max(10, y),
        text: '',
        color: '#20201e',
        size: 24,
      })
      return
    }
  }

  // Clic sur un mot pour ajouter un commentaire
  const handleWordClick = (e: React.MouseEvent, wordKey: string, wordText: string) => {
    if (activeAction !== 'comment') return
    e.stopPropagation()

    const wordEl = e.currentTarget as HTMLElement
    const board = boardRef.current
    if (!board) return
    const wordRect = wordEl.getBoundingClientRect()
    const boardRect = board.getBoundingClientRect()

    // Calculer position relative pour la popup de saisie (au-dessus ou en-dessous)
    const x = Math.max(10, Math.min(boardRect.width - 260, wordRect.left - boardRect.left))
    const y = wordRect.bottom - boardRect.top + 8

    setDraftComment({
      wordKey,
      wordText,
      x,
      y,
      text: '',
    })
  }

  // Sauvegarde de l'infobulle
  const handleSaveTooltip = () => {
    if (!draftTooltip || !draftTooltip.text.trim()) {
      setDraftTooltip(null)
      return
    }
    const newTooltip: ExportedLessonTooltip = {
      id: uid(),
      xPercent: draftTooltip.xPercent,
      yPercent: draftTooltip.yPercent,
      text: draftTooltip.text.trim(),
      createdAt: new Date().toISOString(),
    }
    setTooltips((prev) => [...prev, newTooltip])
    setDraftTooltip(null)
    setActiveAction('none')
  }

  // Sauvegarde du commentaire sur mot
  const handleSaveComment = () => {
    if (!draftComment || !draftComment.text.trim()) {
      setDraftComment(null)
      return
    }
    const newComment: ExportedLessonComment = {
      id: uid(),
      wordKey: draftComment.wordKey,
      wordText: draftComment.wordText,
      comment: draftComment.text.trim(),
      createdAt: new Date().toISOString(),
    }
    // Remplacer ou ajouter le commentaire pour ce mot
    setWordComments((prev) => [...prev.filter((c) => c.wordKey !== draftComment.wordKey), newComment])
    setDraftComment(null)
    setActiveAction('none')
  }

  // Sauvegarde d'une note texte
  const handleSaveTextNote = () => {
    if (!draftTextNote || !draftTextNote.text.trim()) {
      setDraftTextNote(null)
      return
    }
    const newNote: TextNote = {
      id: uid(),
      x: draftTextNote.x,
      y: draftTextNote.y,
      runs: [{ t: draftTextNote.text.trim(), c: draftTextNote.color }],
      size: draftTextNote.size,
      color: draftTextNote.color,
    }
    setAnnotations((prev) => ({
      ...prev,
      texts: [...prev.texts, newNote],
      order: [...prev.order, { kind: 'text', id: newNote.id }],
    }))
    setDraftTextNote(null)
    setActiveAction('none')
  }

  // Sauvegarde du devoir
  const handleSaveHomework = (e: React.FormEvent) => {
    e.preventDefault()
    if (!hwTitle.trim()) {
      setHomework(null)
      setHomeworkModalOpen(false)
      return
    }
    setHomework({
      title: hwTitle.trim(),
      attachmentName: hwAttachmentName.trim() || undefined,
      attachmentData: hwAttachmentData || undefined,
      dueDate: hwDueDate || undefined,
      instructions: hwInstructions.trim() || undefined,
    })
    setHomeworkModalOpen(false)
  }

  // Ouvrir modal devoir
  const handleOpenHomeworkModal = () => {
    if (homework) {
      setHwTitle(homework.title)
      setHwAttachmentName(homework.attachmentName || '')
      setHwAttachmentData(homework.attachmentData || '')
      setHwDueDate(homework.dueDate || '')
      setHwInstructions(homework.instructions || '')
    } else {
      setHwTitle('')
      setHwAttachmentName('')
      setHwAttachmentData('')
      setHwDueDate('')
      setHwInstructions('')
    }
    setHomeworkModalOpen(true)
  }

  // Finaliser l'export
  const handleFinalizeExport = () => {
    const exportedLesson: ExportedLesson = {
      id: uid(),
      username: teacherUsername,
      teacherDisplayName: teacherName || teacherUsername,
      resourceId: resource.id,
      resourceTitle: resource.title,
      resourceAuthor: resource.author,
      chapterIndex: paragraphs[0]?.chapterIndex ?? 0,
      chapterTitle: paragraphs[0]?.chapterTitle ?? '',
      pageIndex: pageIndex,
      totalPages: totalPages,
      paragraphs,
      annotations,
      fontSize,
      tooltips,
      wordComments,
      homework,
      allowReactions,
      allowComments,
      reactions: {},
      studentComments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    onExport(exportedLesson)
  }

  const commentedWordKeys = useMemo(() => new Set(wordComments.map((c) => c.wordKey)), [wordComments])

  return (
    <div className="export-preview-overlay">
      {/* Frame Grand Écran */}
      <div className="export-preview-frame">
        {/* En-tête discret de la frame */}
        <header className="export-preview-topbar">
          <div className="export-preview-title">
            <span className="export-preview-badge">Aperçu d'exportation</span>
            <h3>{resource.title}</h3>
            <span className="export-preview-page">
              Page {pageIndex + 1} / {totalPages}
            </span>
          </div>
          {activeAction !== 'none' && (
            <div className="export-action-hint">
              {activeAction === 'tooltip' && 'Cliquez sur le texte pour placer une infobulle (Échap pour annuler)'}
              {activeAction === 'text' && 'Cliquez où vous souhaitez ajouter du texte (Échap pour annuler)'}
              {activeAction === 'comment' && 'Cliquez sur un mot pour lui ajouter un commentaire (Échap pour annuler)'}
              <button className="export-action-hint-cancel" onClick={() => setActiveAction('none')}>
                <X size={13} />
              </button>
            </div>
          )}
        </header>

        {/* Zone de contenu scrollable horizontalement et verticalement */}
        <div className="export-preview-content" ref={scrollContainerRef}>
          <div
            className={`focus-board export-board-stage ${activeAction !== 'none' ? `mode-${activeAction}` : ''}`}
            ref={boardRef}
            onClick={handleBoardClick}
          >
            <div className="focus-text-col">
              {paragraphs.map((paragraph) => {
                const green = new Set(paragraph.modifiedIndices ?? [])
                let offset = 0
                return (
                  <div key={paragraph.key}>
                    {paragraph.isChapterStart && <h3 className="focus-chapter">{paragraph.chapterTitle}</h3>}
                    <p className="focus-paragraph" style={{ fontSize }}>
                      {paragraph.text.split(/(\s+)/).map((part, index) => {
                        const start = offset
                        offset += part.length
                        if (/\s+/.test(part)) return <span key={index}>{part}</span>
                        const wordKey = `${paragraph.key}:${index}`
                        const hasComment = commentedWordKeys.has(wordKey)
                        const comment = wordComments.find((c) => c.wordKey === wordKey)
                        const isDrafting = draftComment?.wordKey === wordKey

                        return (
                          <span
                            key={wordKey}
                            className={`focus-word export-word ${hasComment || isDrafting ? 'has-comment' : ''} ${activeAction === 'comment' ? 'selectable-for-comment' : ''}`}
                            data-word={wordKey}
                            onClick={(e) => handleWordClick(e, wordKey, part)}
                            onMouseEnter={() => hasComment && setHoveredCommentId(wordKey)}
                            onMouseLeave={() => setHoveredCommentId(null)}
                          >
                            {part.split('').map((letter, letterIdx) => {
                              const letterKey = `${wordKey}.${letterIdx}`
                              const userGray = annotations.grayed.includes(letterKey)
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
                            {/* Popup au survol/clic d'un mot commenté */}
                            {hasComment && comment && (hoveredCommentId === wordKey || activeCommentId === wordKey) && (
                              <span className="export-word-comment-card" onClick={(e) => e.stopPropagation()}>
                                <span className="export-word-comment-head">
                                  <MessageSquare size={12} />
                                  <strong>Commentaire</strong>
                                  <button
                                    className="export-del-btn"
                                    title="Supprimer ce commentaire"
                                    onClick={() => setWordComments((prev) => prev.filter((c) => c.wordKey !== wordKey))}
                                  >
                                    <Trash2 size={11} />
                                  </button>
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
            {annotations.texts.map((note) => (
              <div
                key={note.id}
                className="focus-text-note"
                style={{ left: note.x, top: note.y, fontSize: note.size }}
                onClick={(e) => e.stopPropagation()}
              >
                {note.runs.map((run, idx) => (
                  <span key={idx} style={{ color: run.c }}>
                    {run.t}
                  </span>
                ))}
              </div>
            ))}

            {/* Dessins et liaisons */}
            <svg className="focus-ink export-ink-layer">
              {annotations.strokes.map((stroke) => (
                <StrokeShape stroke={stroke} key={stroke.id} />
              ))}
              {annotations.liaisons.map((liaison) => {
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

            {/* Infobulles existantes */}
            {tooltips.map((tooltip) => (
              <div
                key={tooltip.id}
                className={`export-tooltip-pin ${activeTooltipId === tooltip.id ? 'active' : ''}`}
                style={{ left: `${tooltip.xPercent}%`, top: `${tooltip.yPercent}%` }}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveTooltipId(activeTooltipId === tooltip.id ? null : tooltip.id)
                }}
              >
                <button className="export-tooltip-badge" title="Cliquer pour afficher l'infobulle">
                  <HelpCircle size={15} />
                </button>
                {activeTooltipId === tooltip.id && (
                  <div className="export-tooltip-popover" onClick={(e) => e.stopPropagation()}>
                    <div className="export-tooltip-popover-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Info size={13} />
                        <strong>Infobulle</strong>
                      </div>
                      <button
                        className="export-del-btn"
                        title="Supprimer cette infobulle"
                        onClick={() => {
                          setTooltips((prev) => prev.filter((t) => t.id !== tooltip.id))
                          setActiveTooltipId(null)
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="export-tooltip-popover-text">{tooltip.text}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Popup saisie d'infobulle en cours de création */}
            {draftTooltip && (
              <div
                className="export-popup export-tooltip-input-card"
                style={{ left: draftTooltip.x, top: draftTooltip.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="export-popup-head">
                  <span>Nouvelle infobulle</span>
                  <button className="export-popup-close" onClick={() => setDraftTooltip(null)}>
                    <X size={13} />
                  </button>
                </div>
                <div className="export-popup-body">
                  <textarea
                    autoFocus
                    placeholder="Écrivez votre explication ou note pour les élèves..."
                    value={draftTooltip.text}
                    onChange={(e) => setDraftTooltip({ ...draftTooltip, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        handleSaveTooltip()
                      }
                    }}
                  />
                  <button
                    className="export-send-btn"
                    title="Valider l'infobulle"
                    disabled={!draftTooltip.text.trim()}
                    onClick={handleSaveTooltip}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Popup saisie de commentaire sur mot */}
            {draftComment && (
              <div
                className="export-popup export-comment-input-card"
                style={{ left: draftComment.x, top: draftComment.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="export-popup-head">
                  <span>
                    Commentaire sur : <em>« {draftComment.wordText} »</em>
                  </span>
                  <button className="export-popup-close" onClick={() => setDraftComment(null)}>
                    <X size={13} />
                  </button>
                </div>
                <div className="export-popup-body">
                  <textarea
                    autoFocus
                    placeholder="Saisissez votre remarque ou correction pédagogique..."
                    value={draftComment.text}
                    onChange={(e) => setDraftComment({ ...draftComment, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        handleSaveComment()
                      }
                    }}
                  />
                  <button
                    className="export-send-btn"
                    title="Valider le commentaire"
                    disabled={!draftComment.text.trim()}
                    onClick={handleSaveComment}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Popup saisie de texte libre */}
            {draftTextNote && (
              <div
                className="export-popup export-textnote-input-card"
                style={{ left: draftTextNote.x, top: draftTextNote.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="export-popup-head">
                  <span>Ajouter une note textuelle</span>
                  <button className="export-popup-close" onClick={() => setDraftTextNote(null)}>
                    <X size={13} />
                  </button>
                </div>
                <div className="export-popup-body">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Tapez votre texte..."
                    value={draftTextNote.text}
                    onChange={(e) => setDraftTextNote({ ...draftTextNote, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSaveTextNote()
                      }
                    }}
                  />
                  <div className="export-color-swatches">
                    {['#20201e', '#d64545', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed'].map((c) => (
                      <button
                        key={c}
                        className={`export-color-swatch ${draftTextNote.color === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setDraftTextNote({ ...draftTextNote, color: c })}
                      />
                    ))}
                  </div>
                  <button
                    className="export-send-btn"
                    title="Valider la note"
                    disabled={!draftTextNote.text.trim()}
                    onClick={handleSaveTextNote}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fine bande beige clair en bas avec options à gauche et boutons à droite */}
        <footer className="export-preview-beige-bar">
          {/* Options collées à gauche */}
          <div className="export-bar-left">
            <button
              className={`export-bar-btn ${activeAction === 'tooltip' ? 'active' : ''}`}
              onClick={() => {
                setActiveAction(activeAction === 'tooltip' ? 'none' : 'tooltip')
                setDraftTooltip(null)
                setDraftComment(null)
                setDraftTextNote(null)
              }}
            >
              <HelpCircle size={15} />
              <span>Ajouter une infobulle</span>
              {tooltips.length > 0 && <span className="export-btn-count">{tooltips.length}</span>}
            </button>

            <button
              className={`export-bar-btn ${activeAction === 'text' ? 'active' : ''}`}
              onClick={() => {
                setActiveAction(activeAction === 'text' ? 'none' : 'text')
                setDraftTooltip(null)
                setDraftComment(null)
                setDraftTextNote(null)
              }}
            >
              <Type size={15} />
              <span>Ajouter un texte</span>
            </button>

            <button
              className={`export-bar-btn ${activeAction === 'comment' ? 'active' : ''}`}
              onClick={() => {
                setActiveAction(activeAction === 'comment' ? 'none' : 'comment')
                setDraftTooltip(null)
                setDraftComment(null)
                setDraftTextNote(null)
              }}
            >
              <MessageSquare size={15} />
              <span>Ajouter un commentaire</span>
              {wordComments.length > 0 && <span className="export-btn-count">{wordComments.length}</span>}
            </button>

            <button
              className={`export-bar-btn ${homework ? 'configured' : ''}`}
              onClick={handleOpenHomeworkModal}
            >
              <GraduationCap size={15} />
              <span>{homework ? 'Devoir configuré ✓' : 'Ajouter un devoir'}</span>
            </button>
          </div>

          {/* Options collées à droite (dans l'ordre : Annuler, Exporter) */}
          <div className="export-bar-right">
            <button className="export-bar-action cancel" onClick={onCancel}>
              Annuler
            </button>
            <button
              className="export-bar-action export"
              onClick={() => setFinalizeModalOpen(true)}
            >
              <span>Exporter</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </footer>
      </div>

      {/* Modal Devoir */}
      {homeworkModalOpen && (
        <div className="teacher-export-overlay" onClick={() => setHomeworkModalOpen(false)}>
          <div className="teacher-export-card homework-modal" onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <GraduationCap size={20} />
              </div>
              <div>
                <h3>{homework ? 'Modifier le devoir' : 'Ajouter un devoir'}</h3>
                <p>Vos élèves verront une icône devoir en bas à droite de leur écran.</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setHomeworkModalOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <form onSubmit={handleSaveHomework} className="teacher-export-card-body">
              <div className="teacher-export-field">
                <label>
                  Devoir (Énoncé / Consignes) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  required
                  autoFocus
                  placeholder="Ex : Réécrire les 5 phrases corrigées et apprendre le vocabulaire surligné..."
                  value={hwTitle}
                  rows={3}
                  onChange={(e) => setHwTitle(e.target.value)}
                />
              </div>

              <div className="teacher-export-field">
                <label>Pièce-jointe (optionnel)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Nom du fichier ou lien de ressource (ex : exercice_fiche_1.pdf)"
                    value={hwAttachmentName}
                    onChange={(e) => setHwAttachmentName(e.target.value)}
                  />
                  <label className="export-file-upload-btn" title="Joindre un fichier">
                    <Paperclip size={16} />
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setHwAttachmentName(file.name)
                          const reader = new FileReader()
                          reader.onload = (re) => setHwAttachmentData(String(re.target?.result || ''))
                          reader.readAsDataURL(file)
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="teacher-export-grid-2">
                <div className="teacher-export-field">
                  <label>Date d'échéance (optionnel)</label>
                  <input
                    type="date"
                    value={hwDueDate}
                    onChange={(e) => setHwDueDate(e.target.value)}
                  />
                </div>

                <div className="teacher-export-field">
                  <label>Instructions pour le rendre (optionnel)</label>
                  <input
                    type="text"
                    placeholder="Ex : Rendre par email ou au prochain cours"
                    value={hwInstructions}
                    onChange={(e) => setHwInstructions(e.target.value)}
                  />
                </div>
              </div>

              <footer className="teacher-export-card-foot">
                {homework && (
                  <button
                    type="button"
                    className="btn-danger-ghost"
                    onClick={() => {
                      setHomework(null)
                      setHomeworkModalOpen(false)
                    }}
                  >
                    Supprimer le devoir
                  </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-secondary" onClick={() => setHomeworkModalOpen(false)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn-primary" disabled={!hwTitle.trim()}>
                    <span>Enregistrer</span>
                    <Check size={16} />
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Modal Final d'Export (avec les deux toggles obligatoires) */}
      {finalizeModalOpen && (
        <div className="teacher-export-overlay" onClick={() => setFinalizeModalOpen(false)}>
          <div className="teacher-export-card finalize-modal" onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <Sparkles size={20} />
              </div>
              <div>
                <h3>Options de partage de la leçon</h3>
                <p>Configurez les interactions autorisées pour vos élèves.</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setFinalizeModalOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body">
              <div className="teacher-export-toggles">
                {/* Toggle 1 : Réactions */}
                <div className="teacher-toggle-item">
                  <div className="teacher-toggle-info">
                    <div className="teacher-toggle-title">
                      <Smile size={17} />
                      <strong>Souhaitez-vous accepter les réactions ?</strong>
                    </div>
                    <p>Permet aux élèves de réagir avec des emojis (👍, ❤️, 💡, 👏, 🎯, 🤔).</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={allowReactions}
                      onChange={(e) => setAllowReactions(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                {/* Toggle 2 : Commentaires */}
                <div className="teacher-toggle-item">
                  <div className="teacher-toggle-info">
                    <div className="teacher-toggle-title">
                      <MessageCircle size={17} />
                      <strong>Souhaitez-vous accepter les commentaires ?</strong>
                    </div>
                    <p>Permet aux élèves de poser des questions ou laisser des messages sous la leçon.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={allowComments}
                      onChange={(e) => setAllowComments(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>

            <footer className="teacher-export-card-foot">
              <button type="button" className="btn-secondary" onClick={() => setFinalizeModalOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setFinalizeModalOpen(false)
                  handleFinalizeExport()
                }}
              >
                <span>Générer le lien unique</span>
                <ArrowRight size={16} />
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
