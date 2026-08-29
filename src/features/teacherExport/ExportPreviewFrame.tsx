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
  Sparkles,
  Layers,
} from 'lucide-react'
import type { Resource } from '../../domain'
import type { PageAnnotations, Point, Stroke, TextNote, TextRun, Liaison } from '../LearningFocus'
import { modifiedCharIndices } from '../LearningFocus'
import type {
  ExportedLesson,
  ExportedLessonComment,
  ExportedLessonHomework,
  ExportedLessonPage,
  ExportedLessonParagraph,
  ExportedLessonTooltip,
} from './teacherExportDomain'

type ActiveAction = 'none' | 'tooltip' | 'text' | 'comment'

const COLORS = ['#20201e', '#dc2626', '#16a34a', '#2563eb', '#d97706', '#9333ea']

type ExportPreviewFrameProps = {
  resource: Resource
  pages: ExportedLessonPage[]
  initialPageIndex?: number
  fontSize: number
  teacherUsername: string
  teacherName?: string
  onCancel: () => void
  onExport: (exportedLesson: ExportedLesson) => void
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function ExportPreviewFrame({
  resource,
  pages,
  initialPageIndex = 0,
  fontSize,
  teacherUsername,
  teacherName,
  onCancel,
  onExport,
}: ExportPreviewFrameProps) {
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex)
  const [activeAction, setActiveAction] = useState<ActiveAction>('none')

  // Annotations par page
  const [pageAnnotationsMap, setPageAnnotationsMap] = useState<Record<number, PageAnnotations>>(() => {
    const map: Record<number, PageAnnotations> = {}
    pages.forEach((p) => {
      map[p.pageIndex] = p.annotations
    })
    return map
  })

  // Infobulles créées dans la frame
  const [tooltips, setTooltips] = useState<ExportedLessonTooltip[]>([])
  const [draftTooltip, setDraftTooltip] = useState<{
    pageIndex: number
    xPercent: number
    yPercent: number
    text: string
  } | null>(null)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)

  // Commentaires sur les mots
  const [wordComments, setWordComments] = useState<ExportedLessonComment[]>([])
  const [draftComment, setDraftComment] = useState<{
    pageIndex: number
    wordKey: string
    wordText: string
    text: string
    x: number
    y: number
  } | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)

  // Note textuelle en cours d'édition (style Teacher Mode)
  const [draftNote, setDraftNote] = useState<{
    pageIndex: number
    id?: string
    x: number
    y: number
    text: string
    color: string
    size: number
  } | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const dragNoteRef = useRef<{ pageIndex: number; id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

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

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Détection de la page visible au défilement pour mettre à jour la pilule en haut à droite
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      let visiblePage = 0
      let minDistance = Infinity

      pages.forEach((p) => {
        const el = pageRefs.current[p.pageIndex]
        if (el) {
          const top = el.offsetTop - container.offsetTop
          const dist = Math.abs(top - scrollTop)
          if (dist < minDistance) {
            minDistance = dist
            visiblePage = p.pageIndex
          }
        }
      })

      setCurrentPageIndex(visiblePage)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [pages])

  // Échap annule l'action en cours
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
        if (draftNote) {
          commitDraftNote()
          return
        }
        if (activeAction !== 'none') {
          setActiveAction('none')
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [draftTooltip, draftComment, draftNote, activeAction])

  const commitDraftNote = () => {
    if (!draftNote) return
    const { pageIndex: pIdx, id, x, y, text, color, size } = draftNote
    if (!text.trim()) {
      if (id) {
        // Suppression si vidé
        setPageAnnotationsMap((prev) => {
          const pageAnn = prev[pIdx] || { strokes: [], liaisons: [], texts: [], grayed: [], order: [] }
          return {
            ...prev,
            [pIdx]: {
              ...pageAnn,
              texts: pageAnn.texts.filter((t) => t.id !== id),
              order: pageAnn.order.filter((a) => a.id !== id),
            },
          }
        })
      }
      setDraftNote(null)
      return
    }

    setPageAnnotationsMap((prev) => {
      const pageAnn = prev[pIdx] || { strokes: [], liaisons: [], texts: [], grayed: [], order: [] }
      if (id) {
        return {
          ...prev,
          [pIdx]: {
            ...pageAnn,
            texts: pageAnn.texts.map((t) => (t.id === id ? { ...t, runs: [{ t: text, c: color }], color, size } : t)),
          },
        }
      }
      const newNote: TextNote = {
        id: uid(),
        x,
        y,
        runs: [{ t: text, c: color }],
        color,
        size,
      }
      return {
        ...prev,
        [pIdx]: {
          ...pageAnn,
          texts: [...pageAnn.texts, newNote],
          order: [...pageAnn.order, { kind: 'text', id: newNote.id }],
        },
      }
    })
    setDraftNote(null)
  }

  // Clic sur la page
  const handlePageClick = (pIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Si une note était en cours d'édition, la valider
    if (draftNote) {
      commitDraftNote()
    }

    const pageEl = pageRefs.current[pIdx]
    if (!pageEl) return

    const rect = pageEl.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const xPercent = Math.max(2, Math.min(98, (x / rect.width) * 100))
    const yPercent = Math.max(2, Math.min(98, (y / rect.height) * 100))

    if (activeAction === 'tooltip') {
      setDraftTooltip({
        pageIndex: pIdx,
        xPercent,
        yPercent,
        text: '',
      })
      return
    }

    if (activeAction === 'text') {
      setDraftNote({
        pageIndex: pIdx,
        x: Math.round(x),
        y: Math.round(y),
        text: '',
        color: COLORS[0],
        size: 22,
      })
      return
    }
  }

  // Clic sur un mot pour ajouter un commentaire
  const handleWordClick = (pIdx: number, wordKey: string, wordText: string, e: React.MouseEvent) => {
    if (activeAction !== 'comment') return
    e.stopPropagation()
    const pageEl = pageRefs.current[pIdx]
    const boardRect = pageEl?.getBoundingClientRect()
    const wordRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.max(10, Math.min(wordRect.left - (boardRect?.left || 0), (boardRect?.width || 800) - 300))
    const y = wordRect.bottom - (boardRect?.top || 0) + 6

    setDraftComment({
      pageIndex: pIdx,
      wordKey,
      wordText,
      text: '',
      x,
      y,
    })
  }

  // Validation d'une infobulle
  const handleSaveTooltip = () => {
    if (!draftTooltip || !draftTooltip.text.trim()) return
    const newTooltip: ExportedLessonTooltip = {
      id: uid(),
      pageIndex: draftTooltip.pageIndex,
      xPercent: draftTooltip.xPercent,
      yPercent: draftTooltip.yPercent,
      text: draftTooltip.text.trim(),
      createdAt: new Date().toISOString(),
    }
    setTooltips((prev) => [...prev, newTooltip])
    setDraftTooltip(null)
    setActiveAction('none')
  }

  // Validation d'un commentaire
  const handleSaveComment = () => {
    if (!draftComment || !draftComment.text.trim()) return
    const newComment: ExportedLessonComment = {
      id: uid(),
      pageIndex: draftComment.pageIndex,
      wordKey: draftComment.wordKey,
      wordText: draftComment.wordText,
      comment: draftComment.text.trim(),
      createdAt: new Date().toISOString(),
    }
    setWordComments((prev) => [...prev.filter((c) => c.wordKey !== draftComment.wordKey), newComment])
    setDraftComment(null)
    setActiveAction('none')
  }

  // Suppression d'une note texte
  const handleDeleteTextNote = (pIdx: number, noteId: string) => {
    setPageAnnotationsMap((prev) => {
      const pageAnn = prev[pIdx]
      if (!pageAnn) return prev
      return {
        ...prev,
        [pIdx]: {
          ...pageAnn,
          texts: pageAnn.texts.filter((t) => t.id !== noteId),
          order: pageAnn.order.filter((a) => a.id !== noteId),
        },
      }
    })
    setSelectedNoteId(null)
  }

  // Drag & drop d'une note texte
  const handleNotePointerDown = (pIdx: number, note: TextNote, e: React.PointerEvent) => {
    e.stopPropagation()
    setSelectedNoteId(note.id)
    dragNoteRef.current = {
      pageIndex: pIdx,
      id: note.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: note.x,
      origY: note.y,
      moved: false,
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!dragNoteRef.current) return
      const dx = moveEv.clientX - dragNoteRef.current.startX
      const dy = moveEv.clientY - dragNoteRef.current.startY
      if (Math.hypot(dx, dy) > 3) {
        dragNoteRef.current.moved = true
      }
      const newX = Math.max(0, dragNoteRef.current.origX + dx)
      const newY = Math.max(0, dragNoteRef.current.origY + dy)

      setPageAnnotationsMap((prev) => {
        const pageAnn = prev[pIdx]
        if (!pageAnn) return prev
        return {
          ...prev,
          [pIdx]: {
            ...pageAnn,
            texts: pageAnn.texts.map((t) => (t.id === note.id ? { ...t, x: newX, y: newY } : t)),
          },
        }
      })
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      dragNoteRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Déclenchement de l'export final
  const handleFinalize = () => {
    const exportedPages: ExportedLessonPage[] = pages.map((p) => ({
      pageIndex: p.pageIndex,
      chapterTitle: p.chapterTitle,
      paragraphs: p.paragraphs,
      annotations: pageAnnotationsMap[p.pageIndex] || p.annotations,
    }))

    const firstPage = exportedPages[0]
    const exported: ExportedLesson = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      username: teacherUsername,
      teacherDisplayName: teacherName || teacherUsername,
      resourceId: resource.id,
      resourceTitle: resource.title,
      resourceAuthor: resource.author,
      chapterIndex: 0,
      chapterTitle: firstPage?.chapterTitle || '',
      pageIndex: 0,
      totalPages: pages.length,
      pages: exportedPages,
      paragraphs: firstPage?.paragraphs || [],
      annotations: firstPage?.annotations || { strokes: [], liaisons: [], texts: [], grayed: [], order: [] },
      fontSize,
      tooltips,
      wordComments,
      homework: hwTitle.trim()
        ? {
            title: hwTitle.trim(),
            attachmentName: hwAttachmentName || undefined,
            attachmentData: hwAttachmentData || undefined,
            dueDate: hwDueDate || undefined,
            instructions: hwInstructions.trim() || undefined,
          }
        : null,
      allowReactions,
      allowComments,
      reactions: {},
      studentComments: [],
      figmaComments: [],
      stickers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    onExport(exported)
  }

  return (
    <div className="export-preview-overlay">
      <div className="export-preview-frame">
        {/* Barre supérieure */}
        <header className="export-preview-topbar">
          <div className="export-preview-title">
            <h3>{resource.title}</h3>
          </div>

          {activeAction !== 'none' && (
            <div className="export-action-hint">
              <span>
                {activeAction === 'tooltip' && "Cliquez sur le texte pour placer une infobulle"}
                {activeAction === 'text' && "Cliquez pour placer une note de texte"}
                {activeAction === 'comment' && "Cliquez sur un mot pour lui ajouter un commentaire"}
              </span>
              <button
                type="button"
                className="export-action-hint-cancel"
                onClick={() => setActiveAction('none')}
                title="Annuler l'action (Échap)"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Pilule Page X / Y calée à droite */}
          <div className="export-preview-topbar-right">
            <span className="export-preview-page-badge">
              Page {currentPageIndex + 1} / {pages.length}
            </span>
          </div>
        </header>

        {/* Zone de contenu défilable affichant TOUTE la ressource */}
        <div ref={scrollContainerRef} className="export-preview-content">
          <div className="export-multi-pages-container">
            {pages.map((p, pIdx) => {
              const pageAnn = pageAnnotationsMap[p.pageIndex] || p.annotations
              const pageTooltips = tooltips.filter((t) => (t.pageIndex ?? 0) === p.pageIndex)
              const pageComments = wordComments.filter((c) => (c.pageIndex ?? 0) === p.pageIndex)
              const commentKeys = new Set(pageComments.map((c) => c.wordKey))

              return (
                <div
                  key={p.pageIndex}
                  className={`export-page-block mode-${activeAction}`}
                >
                  {/* Séparateur élégant entre les pages */}
                  {pages.length > 1 && (
                    <div className="export-page-divider">
                      <span className="export-page-divider-line" />
                      <span className="export-page-divider-badge">PAGE {p.pageIndex + 1}</span>
                      <span className="export-page-divider-line" />
                    </div>
                  )}

                  {/* Tableau relatif de la page — Exactement identique à focus-board */}
                  <div
                    ref={(el) => {
                      pageRefs.current[p.pageIndex] = el
                    }}
                    className="export-page-board focus-board"
                    style={{ fontSize }}
                    onClick={(e) => handlePageClick(p.pageIndex, e)}
                  >
                    {/* Layer 1: Paragraphes de texte et titres de chapitre */}
                    <div className="focus-text-col">
                      {p.paragraphs.map((par, parIdx) => {
                        const words = par.text.split(/(\s+)/)
                        const greenSet = new Set(par.modifiedIndices || [])
                        let letterOffset = 0

                        return (
                          <div key={par.key}>
                            {par.isChapterStart && <h3 className="focus-chapter">{par.chapterTitle}</h3>}
                            <p className="focus-paragraph" style={{ fontSize }}>
                              {words.map((word, wIdx) => {
                                if (/\s+/.test(word)) {
                                  letterOffset += word.length
                                  return <span key={wIdx}>{word}</span>
                                }

                                const wordKey = `${par.key}:${wIdx}`
                                const hasComment = commentKeys.has(wordKey)
                                const commentObj = pageComments.find((c) => c.wordKey === wordKey)

                                const wordEl = (
                                  <span
                                    key={wIdx}
                                    className={`export-word ${hasComment ? 'has-comment' : ''} ${
                                      activeAction === 'comment' ? 'selectable-for-comment' : ''
                                    }`}
                                    onClick={(e) => handleWordClick(p.pageIndex, wordKey, word, e)}
                                  >
                                    {word.split('').map((letter, lIdx) => {
                                      const letterKey = `${par.key}:${wIdx}.${lIdx}`
                                      const isGrayed = pageAnn.grayed.includes(letterKey)
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
                                    <span
                                      key={wIdx}
                                      className="export-commented-word-wrap"
                                      onClick={() =>
                                        setActiveCommentId(activeCommentId === commentObj.id ? null : commentObj.id)
                                      }
                                    >
                                      {wordEl}
                                      {activeCommentId === commentObj.id && (
                                        <div className="export-word-comment-card" onClick={(e) => e.stopPropagation()}>
                                          <div className="export-word-comment-head">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <MessageSquare size={12} />
                                              <strong>{commentObj.wordText}</strong>
                                            </div>
                                            <button
                                              type="button"
                                              className="export-del-btn"
                                              onClick={() =>
                                                setWordComments((prev) => prev.filter((c) => c.id !== commentObj.id))
                                              }
                                              title="Supprimer ce commentaire"
                                            >
                                              <Trash2 size={12} />
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

                    {/* Layer 2: Dessins SVG au-dessus du texte (position absolute) */}
                    <svg className="export-drawing-svg focus-ink" aria-hidden="true">
                      {pageAnn.strokes.map((stroke, sIdx) => (
                        <StrokeRender key={sIdx} stroke={stroke} />
                      ))}
                      {pageAnn.liaisons.map((liaison, lIdx) => (
                        <LiaisonRender key={lIdx} liaison={liaison} />
                      ))}
                    </svg>

                    {/* Layer 3: Notes textuelles (Exact Teacher Mode : draggable, éditable, palette) */}
                    {pageAnn.texts.map((note) => {
                      const isSelected = selectedNoteId === note.id
                      const noteText = note.runs.map((r) => r.t).join('')

                      return (
                        <div
                          key={note.id}
                          className={`export-text-note-pin focus-text-note ${isSelected ? 'selected' : ''}`}
                          style={{
                            left: note.x,
                            top: note.y,
                            fontSize: note.size || 22,
                            color: note.color || COLORS[0],
                          }}
                          onPointerDown={(e) => handleNotePointerDown(p.pageIndex, note, e)}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setDraftNote({
                              pageIndex: p.pageIndex,
                              id: note.id,
                              x: note.x,
                              y: note.y,
                              text: noteText,
                              color: note.color || COLORS[0],
                              size: note.size || 22,
                            })
                          }}
                        >
                          <span>{noteText}</span>
                          {isSelected && (
                            <button
                              type="button"
                              className="export-del-btn export-note-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteTextNote(p.pageIndex, note.id)
                              }}
                              title="Supprimer la note"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {/* Édition d'une note texte */}
                    {draftNote && draftNote.pageIndex === p.pageIndex && (
                      <div
                        className="export-popup export-textnote-popup"
                        style={{ left: draftNote.x, top: draftNote.y }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="export-popup-body">
                          <textarea
                            autoFocus
                            value={draftNote.text}
                            onChange={(e) => setDraftNote({ ...draftNote, text: e.target.value })}
                            placeholder="Écrire une note…"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                commitDraftNote()
                              }
                            }}
                          />
                          <div className="export-color-swatches">
                            {COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`export-color-swatch ${draftNote.color === c ? 'active' : ''}`}
                                style={{ background: c }}
                                onClick={() => setDraftNote({ ...draftNote, color: c })}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            className="export-send-btn"
                            disabled={!draftNote.text.trim()}
                            onClick={commitDraftNote}
                          >
                            <Send size={13} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Layer 4: Infobulles créées (Icône minimaliste orange) */}
                    {pageTooltips.map((t) => {
                      const isOpen = activeTooltipId === t.id
                      return (
                        <div
                          key={t.id}
                          className="export-tooltip-pin"
                          style={{ left: `${t.xPercent}%`, top: `${t.yPercent}%` }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="export-tooltip-minimal-btn"
                            onClick={() => setActiveTooltipId(isOpen ? null : t.id)}
                            title="Voir l'infobulle"
                          >
                            <HelpCircle size={20} className="minimal-orange-icon" />
                          </button>

                          {isOpen && (
                            <div className="export-tooltip-popover">
                              <div className="export-tooltip-popover-head">
                                <span>Infobulle</span>
                                <button
                                  type="button"
                                  className="export-del-btn"
                                  onClick={() => setTooltips((prev) => prev.filter((item) => item.id !== t.id))}
                                  title="Supprimer"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <p className="export-tooltip-popover-text">{t.text}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Popups de saisie interactive */}
                    {draftTooltip && draftTooltip.pageIndex === p.pageIndex && (
                      <div
                        className="export-popup"
                        style={{
                          left: `${draftTooltip.xPercent}%`,
                          top: `${draftTooltip.yPercent}%`,
                        }}
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
                            placeholder="Saisissez l'explication de l'infobulle…"
                            value={draftTooltip.text}
                            onChange={(e) => setDraftTooltip({ ...draftTooltip, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSaveTooltip()
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="export-send-btn"
                            disabled={!draftTooltip.text.trim()}
                            onClick={handleSaveTooltip}
                            title="Valider l'infobulle"
                          >
                            <Send size={13} />
                          </button>
                        </div>
                      </div>
                    )}

                    {draftComment && draftComment.pageIndex === p.pageIndex && (
                      <div
                        className="export-popup export-word-comment-popup"
                        style={{ left: draftComment.x, top: draftComment.y }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="export-popup-head">
                          <span>Commentaire sur : « {draftComment.wordText} »</span>
                          <button className="export-popup-close" onClick={() => setDraftComment(null)}>
                            <X size={13} />
                          </button>
                        </div>
                        <div className="export-popup-body">
                          <textarea
                            autoFocus
                            placeholder="Votre commentaire pour les élèves…"
                            value={draftComment.text}
                            onChange={(e) => setDraftComment({ ...draftComment, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSaveComment()
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="export-send-btn"
                            disabled={!draftComment.text.trim()}
                            onClick={handleSaveComment}
                            title="Valider le commentaire"
                          >
                            <Send size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fine bande beige clair en bas avec les boutons au style de l'application */}
        <footer className="export-preview-beige-bar">
          <div className="export-bar-left">
            <button
              type="button"
              className={`app-bar-pill-btn ${activeAction === 'tooltip' ? 'active' : ''}`}
              onClick={() => setActiveAction(activeAction === 'tooltip' ? 'none' : 'tooltip')}
            >
              <HelpCircle size={15} />
              <span>Ajouter une infobulle</span>
              {tooltips.length > 0 && <span className="export-btn-count">{tooltips.length}</span>}
            </button>

            <button
              type="button"
              className={`app-bar-pill-btn ${activeAction === 'text' ? 'active' : ''}`}
              onClick={() => setActiveAction(activeAction === 'text' ? 'none' : 'text')}
            >
              <Type size={15} />
              <span>Ajouter un texte</span>
            </button>

            <button
              type="button"
              className={`app-bar-pill-btn ${activeAction === 'comment' ? 'active' : ''}`}
              onClick={() => setActiveAction(activeAction === 'comment' ? 'none' : 'comment')}
            >
              <MessageSquare size={15} />
              <span>Ajouter un commentaire</span>
              {wordComments.length > 0 && <span className="export-btn-count">{wordComments.length}</span>}
            </button>

            <button
              type="button"
              className={`app-bar-pill-btn ${homework ? 'configured' : ''}`}
              onClick={() => setHomeworkModalOpen(true)}
            >
              <GraduationCap size={15} />
              <span>{homework ? 'Devoir configuré ✓' : 'Ajouter un devoir'}</span>
            </button>
          </div>

          <div className="export-bar-right">
            <button type="button" className="outline" onClick={onCancel}>
              Annuler
            </button>
            <button
              type="button"
              className="primary"
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
          <div className="teacher-export-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <GraduationCap size={22} />
              </div>
              <div>
                <h3>Ajouter un devoir</h3>
                <p>Donnez des exercices ou des consignes complémentaires à vos élèves.</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setHomeworkModalOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body">
              <div className="teacher-export-field">
                <label>Devoir / Énoncé *</label>
                <textarea
                  autoFocus
                  placeholder="Ex : Faire les exercices 1 et 2 page 42, réviser les verbes irréguliers…"
                  value={hwTitle}
                  onChange={(e) => setHwTitle(e.target.value)}
                />
              </div>

              <div className="teacher-export-grid-2">
                <div className="teacher-export-field">
                  <label>Date d'échéance (optionnel)</label>
                  <input type="date" value={hwDueDate} onChange={(e) => setHwDueDate(e.target.value)} />
                </div>
                <div className="teacher-export-field">
                  <label>Pièce-jointe (optionnel)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Nom du fichier..."
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
                            reader.onload = () => setHwAttachmentData(String(reader.result))
                            reader.readAsDataURL(file)
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="teacher-export-field">
                <label>Instructions pour le rendre (optionnel)</label>
                <textarea
                  placeholder="Ex : Déposer le PDF sur l'ENT ou envoyer par email…"
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
                    setHwTitle('')
                    setHomeworkModalOpen(false)
                  }}
                >
                  Supprimer le devoir
                </button>
              )}
              <button type="button" className="outline" onClick={() => setHomeworkModalOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                disabled={!hwTitle.trim()}
                onClick={() => {
                  setHomework({
                    title: hwTitle.trim(),
                    attachmentName: hwAttachmentName || undefined,
                    attachmentData: hwAttachmentData || undefined,
                    dueDate: hwDueDate || undefined,
                    instructions: hwInstructions.trim() || undefined,
                  })
                  setHomeworkModalOpen(false)
                }}
              >
                <span>Enregistrer</span>
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal Toggles Réactions & Commentaires */}
      {finalizeModalOpen && (
        <div className="teacher-export-overlay" onClick={() => setFinalizeModalOpen(false)}>
          <div className="teacher-export-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge primary">
                <Sparkles size={22} />
              </div>
              <div>
                <h3>Options d'interaction pour les élèves</h3>
                <p>Définissez comment vos élèves pourront interagir avec cette page.</p>
              </div>
              <button className="teacher-export-close-btn" onClick={() => setFinalizeModalOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body">
              <div className="teacher-export-toggles">
                <div className="teacher-toggle-item">
                  <div className="teacher-toggle-info">
                    <span className="teacher-toggle-title">
                      <strong>1. Souhaitez-vous accepter les réactions ?</strong>
                    </span>
                    <p>Les élèves pourront déposer des stickers d'emojis (👍, ❤️, 💡, 👏, 🎯) sur la page.</p>
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

                <div className="teacher-toggle-item">
                  <div className="teacher-toggle-info">
                    <span className="teacher-toggle-title">
                      <strong>2. Souhaitez-vous accepter les commentaires ?</strong>
                    </span>
                    <p>Les élèves pourront placer des commentaires Figma n'importe où sur la page.</p>
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
              <button type="button" className="outline" onClick={() => setFinalizeModalOpen(false)}>
                Retour
              </button>
              <button type="button" className="primary" onClick={handleFinalize}>
                <span>Générer le lien unique</span>
                <ArrowRight size={15} />
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
