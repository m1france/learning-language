import React, { useState, useEffect } from 'react'
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Globe,
  GraduationCap,
  HelpCircle,
  MessageSquare,
  Smile,
  MessageCircle,
  User,
  AlertCircle,
  Calendar,
  Layers,
} from 'lucide-react'
import type { UserSettings } from '../../domain'
import { teacherCopy } from '../../i18n'
import type { ExportedLesson } from './teacherExportDomain'
import {
  getAllExportedLessons,
  deleteExportedLesson,
  buildExportUrl,
  getTeacherUsername,
  normalizeTeacherUsername,
} from './teacherExportService'
import { TeacherUsernameModal } from './TeacherUsernameModal'

type MyLessonsSettingsTabProps = {
  settings: UserSettings
  onUpdateSettings: (settings: UserSettings) => void
  onOpenLesson: (lesson: ExportedLesson) => void
  ui?: import('../../domain').UiLanguage
}

export function MyLessonsSettingsTab({
  settings,
  onUpdateSettings,
  onOpenLesson,
  ui,
}: MyLessonsSettingsTabProps) {
  const [lessons, setLessons] = useState<ExportedLesson[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteConfirmLesson, setDeleteConfirmLesson] = useState<ExportedLesson | null>(null)
  const [usernameModalOpen, setUsernameModalOpen] = useState(false)

  const activeUi = ui || settings.uiLanguage || 'fr'
  const t = teacherCopy[activeUi] || teacherCopy.fr
  const currentUsername = getTeacherUsername(settings)

  useEffect(() => {
    setLessons(getAllExportedLessons())
  }, [])

  const handleCopy = (lesson: ExportedLesson) => {
    const url = buildExportUrl(lesson.username, lesson.id)
    navigator.clipboard.writeText(url)
    setCopiedId(lesson.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = (lessonId: string) => {
    deleteExportedLesson(lessonId)
    setLessons(getAllExportedLessons())
    setDeleteConfirmLesson(null)
  }

  const handleSaveUsername = (newUsername: string) => {
    const normalized = normalizeTeacherUsername(newUsername)
    onUpdateSettings({ ...settings, teacherUsername: normalized })
    setUsernameModalOpen(false)
  }

  return (
    <div className="settings-section my-lessons-tab">
      {/* En-tête profil Enseignant */}
      <div className="my-lessons-header-card">
        <div className="my-lessons-teacher-info">
          <div className="my-lessons-avatar">
            <User size={20} />
          </div>
          <div>
            <h4>{t.usernameForLinks}</h4>
            <p>
              {t.subdomain}{' '}
              <code>
                share.mathisbnl.info/<strong>{currentUsername || 'prof'}</strong>/…
              </code>
            </p>
          </div>
        </div>
        <button
          className="btn-secondary small"
          onClick={() => setUsernameModalOpen(true)}
          title={t.changeUsername}
        >
          <span>{currentUsername ? t.changeUsername : t.setUsername}</span>
        </button>
      </div>

      {/* Titre de section */}
      <div className="my-lessons-title-row">
        <div>
          <h3>{t.myLessonsTitle}</h3>
          <p>{t.myLessonsDesc}</p>
        </div>
        <span className="my-lessons-count-badge">
          {lessons.length} {lessons.length > 1 ? t.lessonPlural : t.lessonSingular}
        </span>
      </div>

      {/* Liste des leçons */}
      {lessons.length === 0 ? (
        <div className="my-lessons-empty-state">
          <Share2 size={36} className="empty-icon" />
          <h4>{t.noSharedLessons}</h4>
          <p>{t.noSharedLessonsDesc}</p>
        </div>
      ) : (
        <div className="my-lessons-grid">
          {lessons.map((lesson) => {
            const url = buildExportUrl(lesson.username, lesson.id)
            const isCopied = copiedId === lesson.id
            const reactionsTotal = Object.values(lesson.reactions || {}).reduce((a, b) => a + b, 0)
            const commentsCount = lesson.studentComments?.length || 0

            return (
              <div key={lesson.id} className="my-lesson-card">
                <div className="my-lesson-card-head">
                  <div className="my-lesson-card-title-group">
                    <h4>{lesson.resourceTitle}</h4>
                  </div>
                  <span className="my-lesson-online-pill">{t.lessonOnline}</span>
                </div>

                {/* Lien partageable avec bouton de copie */}
                <div className="my-lesson-url-box">
                  <Globe size={14} className="url-globe-icon" />
                  <span className="my-lesson-url-text">{url}</span>
                  <button
                    className={`my-lesson-copy-btn ${isCopied ? 'copied' : ''}`}
                    onClick={() => handleCopy(lesson)}
                    data-tooltip={t.copyLink}
                  >
                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{isCopied ? t.copied : t.copyLink}</span>
                  </button>
                </div>

                {/* Métriques / Pilules épurées */}
                <div className="my-lesson-minimal-stats">
                  {lesson.tooltips.length > 0 && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${lesson.tooltips.length} ${t.statTooltips}`}
                    >
                      <HelpCircle size={14} />
                      <span className="stat-num">{lesson.tooltips.length}</span>
                    </span>
                  )}
                  {lesson.wordComments.length > 0 && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${lesson.wordComments.length} ${t.statComments}`}
                    >
                      <MessageSquare size={14} />
                      <span className="stat-num">{lesson.wordComments.length}</span>
                    </span>
                  )}
                  {lesson.homework && (
                    <span
                      className="lesson-stat-pill hw"
                      data-tooltip={t.statHomework}
                    >
                      <GraduationCap size={14} />
                    </span>
                  )}
                  {lesson.allowReactions && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${reactionsTotal} ${t.statReactions}`}
                    >
                      <Smile size={14} />
                      <span className="stat-num">{reactionsTotal}</span>
                    </span>
                  )}
                  {lesson.allowComments && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${commentsCount} ${t.statComments}`}
                    >
                      <MessageCircle size={14} />
                      <span className="stat-num">{commentsCount}</span>
                    </span>
                  )}
                </div>

                {/* Pied de carte avec date et actions */}
                <div className="my-lesson-card-foot">
                  <span className="my-lesson-date">
                    {t.exportedOn}{' '}
                    {new Date(lesson.createdAt).toLocaleDateString(activeUi === 'fr' ? 'fr-FR' : (activeUi === 'en' ? 'en-US' : (activeUi === 'es' ? 'es-ES' : (activeUi === 'zh' ? 'zh-CN' : (activeUi === 'ru' ? 'ru-RU' : 'pt-PT')))), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <div className="my-lesson-actions">
                    <button
                      className="btn-secondary small"
                      onClick={() => window.open(url, '_blank')}
                      title={t.viewPage}
                    >
                      <ExternalLink size={13} />
                      <span>{t.viewPage}</span>
                    </button>
                    <button
                      className="btn-danger-ghost small"
                      onClick={() => setDeleteConfirmLesson(lesson)}
                      title={t.unpublish}
                    >
                      <Trash2 size={13} />
                      <span>{t.unpublish}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Confirmation Dépublication */}
      {deleteConfirmLesson && (
        <div className="teacher-export-overlay" onClick={() => setDeleteConfirmLesson(null)}>
          <div className="teacher-export-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <header className="teacher-export-card-head">
              <div className="teacher-export-icon-badge warning">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3>{t.unpublishConfirmTitle}</h3>
                <p>{deleteConfirmLesson.resourceTitle} &bull; Page {deleteConfirmLesson.pageIndex + 1}</p>
              </div>
            </header>
            <div className="teacher-export-card-body">
              <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                {t.unpublishConfirmDesc}
              </p>
            </div>
            <footer className="teacher-export-card-foot">
              <button type="button" className="outline" onClick={() => setDeleteConfirmLesson(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirmLesson.id)}
              >
                <span>{t.unpublishPermanent}</span>
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal changement de nom d'utilisateur */}
      {usernameModalOpen && (
        <TeacherUsernameModal
          initialValue={currentUsername}
          onSave={handleSaveUsername}
          onCancel={() => setUsernameModalOpen(false)}
          ui={activeUi}
        />
      )}
    </div>
  )
}
