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
  Loader2,
} from 'lucide-react'
import type { Resource, UiLanguage, ApiSettings } from '../../domain'
import { teacherCopy } from '../../i18n'
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
import {
  resolveLiaisonGeometry,
  resolveTextNoteGeometry,
  resolveStrokeGeometry,
} from './annotationAnchorService'
import { optimizeAnnotationsWithAi } from './teacherAlignmentAiService'

type ActiveAction = 'none' | 'tooltip' | 'text' | 'comment'

const COLORS = ['#20201e', '#dc2626', '#16a34a', '#2563eb', '#d97706', '#9333ea']

type ExportPreviewFrameProps = {
  resource: Resource
  pages: ExportedLessonPage[]
  initialPageIndex?: number
  fontSize: number
  teacherUsername: string
  teacherName?: string
  existingLesson?: ExportedLesson | null
  onCancel: () => void
  onExport: (exportedLesson: ExportedLesson) => void
  ui?: UiLanguage
  api?: ApiSettings
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function ExportPreviewFrame({
  resource,
  pages,
  initialPageIndex = 0,
  fontSize,
  teacherUsername,
  teacherName,
  existingLesson,
  onCancel,
  onExport,
  ui = 'fr',
  api,
}: ExportPreviewFrameProps) {
  const t = teacherCopy[ui] || teacherCopy.fr
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex)
  const [activeAction, setActiveAction] = useState<ActiveAction>('none')
  const [isAiAligning, setIsAiAligning] = useState(false)
  const [aiAlignToast, setAiAlignToast] = useState<string | null>(null)
  const [, forceRedraw] = useState(0)

  // Annotations par page
  const [pageAnnotationsMap, setPageAnnotationsMap] = useState<Record<number, PageAnnotations>>(() => {
    const map: Record<number, PageAnnotations> = {}
    pages.forEach((p) => {
      map[p.pageIndex] = p.annotations
    })
    return map
  })

  // Infobulles initialisées avec celles de la leçon existante
  const [tooltips, setTooltips] = useState<ExportedLessonTooltip[]>(
    () => existingLesson?.tooltips || []
  )
  const [draftTooltip, setDraftTooltip] = useState<{
    pageIndex: number
    xPercent: number
    yPercent: number
    text: string
  } | null>(null)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)

  // Commentaires sur les mots initialisés avec ceux de la leçon existante
  const [wordComments, setWordComments] = useState<ExportedLessonComment[]>(
    () => existingLesson?.wordComments || []
  )
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [homeworkModalOpen, setHomeworkModalOpen] = useState(false)
  const [homework, setHomework] = useState<ExportedLessonHomework | null>(
    () => existingLesson?.homework || null
  )
  const [hwTitle, setHwTitle] = useState(() => existingLesson?.homework?.title || '')
  const [hwAttachmentName, setHwAttachmentName] = useState(() => existingLesson?.homework?.attachmentName || '')
  const [hwAttachmentData, setHwAttachmentData] = useState(() => existingLesson?.homework?.attachmentData || '')
  const [hwDueDate, setHwDueDate] = useState(() => existingLesson?.homework?.dueDate || '')
  const [hwInstructions, setHwInstructions] = useState(() => existingLesson?.homework?.instructions || '')

  // Modal final de configuration d'export (toggles)
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false)
  const [allowReactions, setAllowReactions] = useState(
    () => existingLesson?.allowReactions ?? true
  )
  const [allowComments, setAllowComments] = useState(
    () => existingLesson?.allowComments ?? true
  )

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
        // Suppression si vidé lors de l'édition
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
            texts: pageAnn.texts.map((t) =>
              t.id === id
                ? {
                    ...t,
                    runs: [{ t: text.trim(), c: color }],
                    color,
                    size,
                  }
                : t
            ),
          },
        }
      }
      const newNote: TextNote = {
        id: uid(),
        x,
        y,
        runs: [{ t: text.trim(), c: color }],
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

  // Alignement et fidélité de toutes les pages par IA
  const handleAiAlignAllPages = async () => {
    if (isAiAligning) return
    if (draftNote) commitDraftNote()
    setIsAiAligning(true)
    try {
      const updatedMap = { ...pageAnnotationsMap }
      let totalChanges = 0
      for (const p of pages) {
        const pageAnn = updatedMap[p.pageIndex] || p.annotations
        const res = await optimizeAnnotationsWithAi({
          paragraphs: p.paragraphs,
          annotations: pageAnn,
          api: api || ({} as ApiSettings),
          uiLanguage: ui,
        })
        if (res.success) {
          updatedMap[p.pageIndex] = res.updatedAnnotations
          totalChanges += res.appliedChangesCount
        }
      }
      setPageAnnotationsMap(updatedMap)
      setAiAlignToast(t.aiAlignSuccess)
      setTimeout(() => setAiAlignToast(null), 4500)
    } catch (e) {
      console.error(e)
    } finally {
      setIsAiAligning(false)
    }
  }

  // Changement direct de couleur d'une note sélectionnée
  const handleChangeNoteColor = (pIdx: number, noteId: string, color: string) => {
    setPageAnnotationsMap((prev) => {
      const pageAnn = prev[pIdx]
      if (!pageAnn) return prev
      return {
        ...prev,
        [pIdx]: {
          ...pageAnn,
          texts: pageAnn.texts.map((t) =>
            t.id === noteId ? { ...t, color, runs: t.runs.map((r) => ({ ...r, c: color })) } : t
          ),
        },
      }
    })
  }

  // Clic sur la page
  const handlePageClick = (pIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Si une note était en cours d'édition, la valider
    if (draftNote) {
      commitDraftNote()
    }
    setSelectedNoteId(null)
    setActiveTooltipId(null)
    setActiveCommentId(null)

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
      setActiveAction('none')
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
      setActiveAction('none')
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
      id: existingLesson?.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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
      reactions: existingLesson?.reactions || {},
      studentComments: existingLesson?.studentComments || [],
      figmaComments: existingLesson?.figmaComments || [],
      stickers: existingLesson?.stickers || [],
      createdAt: existingLesson?.createdAt || new Date().toISOString(),
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

          {/* Bouton IA de fidélisation & Pilule Page X / Y calée à droite */}
          <div className="export-preview-topbar-right">
            <button
              type="button"
              className={`export-ai-fidelity-btn glass ${isAiAligning ? 'loading' : ''}`}
              title={t.aiAlignTooltip}
              onClick={handleAiAlignAllPages}
              disabled={isAiAligning}
            >
              {isAiAligning ? <Loader2 size={13} className="spin-slow" /> : <Sparkles size={13} />}
              <span>{isAiAligning ? t.aiAligning : t.aiAlignBtn}</span>
            </button>
            <span className="export-preview-page-badge">
              Page {currentPageIndex + 1} / {pages.length}
            </span>
          </div>
        </header>

        {/* Toast notification de confirmation d'alignement IA */}
        {aiAlignToast && (
          <div className="export-ai-toast glass">
            <Sparkles size={14} className="toast-sparkle" />
            <span>{aiAlignToast}</span>
          </div>
        )}

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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                              <button
                                                type="button"
                                                className="export-del-btn danger"
                                                onClick={() =>
                                                  setWordComments((prev) => prev.filter((c) => c.id !== commentObj.id))
                                                }
                                                title={t.deleteComment}
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                              <button
                                                type="button"
                                                className="export-popup-close"
                                                onClick={() => setActiveCommentId(null)}
                                                title={t.close}
                                              >
                                                <X size={12} />
                                              </button>
                                            </div>
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
                        <StrokeRender key={sIdx} stroke={stroke} boardEl={pageRefs.current[p.pageIndex]} />
                      ))}
                      {pageAnn.liaisons.map((liaison, lIdx) => (
                        <LiaisonRender key={lIdx} liaison={liaison} boardEl={pageRefs.current[p.pageIndex]} />
                      ))}
                    </svg>

                    {/* Layer 3: Notes textuelles (Exact Teacher Mode : draggable, éditable, palette) */}
                    {pageAnn.texts.map((note) => {
                      // Si la note est actuellement en cours d'édition dans draftNote, masquer le calque statique
                      if (draftNote && draftNote.id === note.id) return null

                      const isSelected = selectedNoteId === note.id
                      const noteText = note.runs.map((r) => r.t).join('')
                      const resolvedPos = resolveTextNoteGeometry(note, pageRefs.current[p.pageIndex])

                      return (
                        <div
                          key={note.id}
                          className={`export-text-note-pin focus-text-note ${isSelected ? 'selected' : ''}`}
                          style={{
                            left: resolvedPos.left,
                            top: resolvedPos.top,
                            fontSize: note.size || 22,
                            color: note.color || COLORS[0],
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (draftNote) commitDraftNote()
                            setSelectedNoteId(note.id)
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            if (draftNote) commitDraftNote()
                            handleNotePointerDown(p.pageIndex, note, e)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setSelectedNoteId(null)
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
                            <>
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
                              <div
                                className="export-live-text-colors"
                                style={{
                                  position: 'absolute',
                                  top: 'calc(100% + 4px)',
                                  left: 0,
                                  zIndex: 35,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    className={`export-color-bullet ${note.color === c ? 'active' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => handleChangeNoteColor(p.pageIndex, note.id, c)}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Édition d'une note texte en direct temps réel */}
                    {draftNote && draftNote.pageIndex === p.pageIndex && (
                      <div
                        className="export-live-text-editor"
                        style={{ left: draftNote.x, top: draftNote.y }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          type="text"
                          className="export-live-text-input"
                          style={{
                            color: draftNote.color || COLORS[0],
                            fontSize: draftNote.size || 22,
                          }}
                          value={draftNote.text}
                          placeholder="Écrire un texte…"
                          onChange={(e) => setDraftNote({ ...draftNote, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitDraftNote()
                            }
                          }}
                        />
                        <div className="export-live-text-colors">
                          {COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`live-color-dot ${draftNote.color === c ? 'active' : ''}`}
                              style={{ background: c }}
                              onClick={() => setDraftNote({ ...draftNote, color: c })}
                            />
                          ))}
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
                            <HelpCircle size={16} className="minimal-orange-icon" />
                          </button>

                          {isOpen && (
                            <div className="export-tooltip-popover">
                              <div className="export-tooltip-popover-head">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <HelpCircle size={13} style={{ color: '#ea580c' }} />
                                  <span>Infobulle</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button
                                    type="button"
                                    className="export-del-btn danger"
                                    onClick={() => setTooltips((prev) => prev.filter((item) => item.id !== t.id))}
                                    title="Supprimer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="export-popup-close"
                                    onClick={() => setActiveTooltipId(null)}
                                    title="Fermer"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                              <p className="export-tooltip-popover-text">{t.text}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Saisie d'une nouvelle infobulle — Minimaliste et sans header */}
                    {draftTooltip && draftTooltip.pageIndex === p.pageIndex && (
                      <div
                        className={`export-inline-input-pin ${draftTooltip.yPercent > 70 ? 'pos-above' : 'pos-below'}`}
                        style={{
                          left: `${draftTooltip.xPercent}%`,
                          top: `${draftTooltip.yPercent}%`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <HelpCircle size={16} className="minimal-orange-icon inline-pin-icon" />
                        <div className="export-inline-input-bubble">
                          <input
                            autoFocus
                            type="text"
                            placeholder={t.tooltipPlaceholder}
                            value={draftTooltip.text}
                            onChange={(e) => setDraftTooltip({ ...draftTooltip, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleSaveTooltip()
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="export-inline-action-btn primary"
                            disabled={!draftTooltip.text.trim()}
                            onClick={handleSaveTooltip}
                            title={t.confirm}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            className="export-inline-action-btn"
                            onClick={() => setDraftTooltip(null)}
                            title={t.cancel}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Saisie d'un nouveau commentaire sur un mot — Minimaliste */}
                    {draftComment && draftComment.pageIndex === p.pageIndex && (
                      <div
                        className="export-inline-comment-bubble"
                        style={{ left: draftComment.x, top: draftComment.y }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          type="text"
                          placeholder={`${t.wordCommentPlaceholder}`}
                          value={draftComment.text}
                          onChange={(e) => setDraftComment({ ...draftComment, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveComment()
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="export-inline-action-btn primary"
                          disabled={!draftComment.text.trim()}
                          onClick={handleSaveComment}
                          title={t.confirm}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="export-inline-action-btn"
                          onClick={() => setDraftComment(null)}
                          title={t.cancel}
                        >
                          <X size={13} />
                        </button>
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
              <span>{t.addTooltip}</span>
              {tooltips.length > 0 && <span className="export-btn-count">{tooltips.length}</span>}
            </button>

            <button
              type="button"
              className={`app-bar-pill-btn ${activeAction === 'text' ? 'active' : ''}`}
              onClick={() => setActiveAction(activeAction === 'text' ? 'none' : 'text')}
            >
              <Type size={15} />
              <span>{t.addTextNote}</span>
            </button>

            <button
              type="button"
              className={`app-bar-pill-btn ${activeAction === 'comment' ? 'active' : ''}`}
              onClick={() => setActiveAction(activeAction === 'comment' ? 'none' : 'comment')}
            >
              <MessageSquare size={15} />
              <span>{t.addComment}</span>
              {wordComments.length > 0 && <span className="export-btn-count">{wordComments.length}</span>}
            </button>

            <button
              type="button"
              className={`app-bar-pill-btn ${homework ? 'configured' : ''}`}
              onClick={() => setHomeworkModalOpen(true)}
            >
              <GraduationCap size={15} />
              <span>{homework ? t.homeworkConfigured : t.addHomework}</span>
            </button>
          </div>

          <div className="export-bar-right">
            <button type="button" className="outline" onClick={onCancel}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setFinalizeModalOpen(true)}
            >
              <span>{existingLesson ? t.updateLesson : t.exportBtn}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </footer>
      </div>

      {/* Modal Devoir */}
      {homeworkModalOpen && (
        <div className="teacher-export-overlay" onClick={() => setHomeworkModalOpen(false)}>
          <div className="teacher-export-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head" style={{ paddingBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{t.homeworkModalTitle}</h3>
              <button className="teacher-export-close-btn" onClick={() => setHomeworkModalOpen(false)} title={t.close}>
                <X size={16} />
              </button>
            </header>

            <div className="teacher-export-card-body">
              <div className="teacher-export-field">
                <label>{t.homeworkPromptLabel}</label>
                <textarea
                  autoFocus
                  placeholder={t.homeworkPromptPlaceholder}
                  value={hwTitle}
                  onChange={(e) => setHwTitle(e.target.value)}
                />
              </div>

              <div className="teacher-export-grid-2">
                <div className="teacher-export-field">
                  <label>{t.homeworkDueDateLabel}</label>
                  <input type="date" value={hwDueDate} onChange={(e) => setHwDueDate(e.target.value)} />
                </div>
                <div className="teacher-export-field">
                  <label>{t.homeworkAttachmentLabel}</label>
                  <div
                    className={`hw-upload-dropzone ${hwAttachmentName ? 'has-file' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (file) {
                        setHwAttachmentName(file.name)
                        const reader = new FileReader()
                        reader.onload = () => setHwAttachmentData(String(reader.result))
                        reader.readAsDataURL(file)
                      }
                    }}
                  >
                    <input
                      ref={fileInputRef}
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
                    {hwAttachmentName ? (
                      <div className="hw-dropzone-file-row">
                        <Paperclip size={15} className="hw-dropzone-file-icon" />
                        <span className="hw-dropzone-file-name">{hwAttachmentName}</span>
                        <button
                          type="button"
                          className="export-del-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setHwAttachmentName('')
                            setHwAttachmentData('')
                          }}
                          title={t.homeworkRemoveAttachment}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="hw-dropzone-empty">
                        <Paperclip size={16} />
                        <span>{t.homeworkDropzoneEmpty}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="teacher-export-field">
                <label>{t.homeworkInstructionsLabel}</label>
                <textarea
                  placeholder={t.homeworkInstructionsPlaceholder}
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
                  {t.homeworkDeleteBtn}
                </button>
              )}
              <button type="button" className="outline" onClick={() => setHomeworkModalOpen(false)}>
                {t.cancel}
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
                <span>{t.save}</span>
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal Toggles Réactions & Commentaires */}
      {finalizeModalOpen && (
        <div className="teacher-export-overlay" onClick={() => setFinalizeModalOpen(false)}>
          <div className="teacher-export-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 18px 0 18px' }}>
              <button className="teacher-export-close-btn" onClick={() => setFinalizeModalOpen(false)} title={t.close}>
                <X size={16} />
              </button>
            </div>

            <div className="teacher-export-card-body" style={{ paddingTop: 4 }}>
              <div className="teacher-export-toggles">
                <div className="teacher-toggle-item">
                  <div className="teacher-toggle-info">
                    <span className="teacher-toggle-title">
                      <strong>{t.finalizeReactionsTitle}</strong>
                    </span>
                    <p>{t.finalizeReactionsDesc}</p>
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
                      <strong>{t.finalizeCommentsTitle}</strong>
                    </span>
                    <p>{t.finalizeCommentsDesc}</p>
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
                {t.back}
              </button>
              <button type="button" className="primary" onClick={handleFinalize}>
                <span>{existingLesson ? t.updateLessonBtn : t.generateUniqueLink}</span>
                <ArrowRight size={15} />
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

function StrokeRender({ stroke, boardEl }: { stroke: Stroke; boardEl?: HTMLElement | null }) {
  const resolved = resolveStrokeGeometry(stroke, boardEl ?? null)
  const opacity = resolved.kind === 'highlighter' ? 0.35 : 1
  const common = {
    stroke: resolved.color,
    strokeWidth: resolved.width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    opacity,
  }
  const [first, ...rest] = resolved.points
  if (!first) return null

  if (resolved.points.length <= 1) {
    return <circle cx={first.x} cy={first.y} r={resolved.width / 2} fill={resolved.color} opacity={opacity} />
  }

  if (resolved.kind === 'pen' || resolved.kind === 'highlighter') {
    const d = `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ')
    return <path d={d} {...common} />
  }

  const last = resolved.points[resolved.points.length - 1] ?? first
  const x = Math.min(first.x, last.x)
  const y = Math.min(first.y, last.y)
  const w = Math.abs(last.x - first.x)
  const h = Math.abs(last.y - first.y)

  if (resolved.kind === 'rect') return <rect x={x} y={y} width={w} height={h} rx={4} {...common} />
  if (resolved.kind === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  if (resolved.kind === 'line') return <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} {...common} />

  const angle = Math.atan2(last.y - first.y, last.x - first.x)
  const head = 10 + resolved.width
  const a1 = angle + Math.PI * 0.82
  const a2 = angle - Math.PI * 0.82

  return (
    <g {...common}>
      <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} stroke={resolved.color} strokeWidth={resolved.width} strokeLinecap="round" />
      <path
        d={`M ${last.x} ${last.y} L ${last.x + head * Math.cos(a1)} ${last.y + head * Math.sin(a1)} M ${last.x} ${last.y} L ${last.x + head * Math.cos(a2)} ${last.y + head * Math.sin(a2)}`}
        stroke={resolved.color}
        strokeWidth={resolved.width}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}

function LiaisonRender({ liaison, boardEl }: { liaison: Liaison; boardEl?: HTMLElement | null }) {
  const geo = resolveLiaisonGeometry(liaison, boardEl ?? null)
  return (
    <path
      d={geo.d}
      fill="none"
      stroke={liaison.color || '#d64545'}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  )
}
