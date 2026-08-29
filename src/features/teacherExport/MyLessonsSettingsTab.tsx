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
}

export function MyLessonsSettingsTab({
  settings,
  onUpdateSettings,
  onOpenLesson,
}: MyLessonsSettingsTabProps) {
  const [lessons, setLessons] = useState<ExportedLesson[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteConfirmLesson, setDeleteConfirmLesson] = useState<ExportedLesson | null>(null)
  const [usernameModalOpen, setUsernameModalOpen] = useState(false)

  const currentUsername = getTeacherUsername(settings)

  const reload = () => {
    setLessons(getAllExportedLessons())
  }

  useEffect(() => {
    reload()
  }, [])

  const handleCopy = async (lesson: ExportedLesson) => {
    const url = buildExportUrl(lesson.username, lesson.id)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(lesson.id)
      setTimeout(() => setCopiedId(null), 2500)
    } catch {
      setCopiedId(lesson.id)
      setTimeout(() => setCopiedId(null), 2500)
    }
  }

  const handleDelete = (lessonId: string) => {
    deleteExportedLesson(lessonId)
    setDeleteConfirmLesson(null)
    reload()
  }

  const handleSaveUsername = (newUsername: string) => {
    const clean = normalizeTeacherUsername(newUsername)
    onUpdateSettings({ ...settings, teacherUsername: clean })
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
            <h4>Nom d'utilisateur pour vos liens</h4>
            <p>
              Sous-domaine :{' '}
              <code>
                share.mathisbnl.info/<strong>{currentUsername || 'non-defini'}</strong>/…
              </code>
            </p>
          </div>
        </div>
        <button
          className="btn-secondary small"
          onClick={() => setUsernameModalOpen(true)}
          title="Modifier le nom d'utilisateur"
        >
          <span>{currentUsername ? 'Modifier le nom' : 'Définir un nom'}</span>
        </button>
      </div>

      {/* Titre de section */}
      <div className="my-lessons-title-row">
        <div>
          <h3>Mes leçons exportées</h3>
          <p>Retrouvez tous les liens générés pour vos élèves et gérez leur visibilité.</p>
        </div>
        <span className="my-lessons-count-badge">
          {lessons.length} leçon{lessons.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Liste des leçons */}
      {lessons.length === 0 ? (
        <div className="my-lessons-empty-state">
          <Share2 size={36} className="empty-icon" />
          <h4>Aucune leçon partagée pour le moment</h4>
          <p>
            Lorsque vous êtes en <strong>Teacher Mode</strong>, effectuez des modifications sur votre texte puis cliquez sur{' '}
            <strong>« Exporter »</strong> en bas à droite pour créer votre premier lien de cours interactif.
          </p>
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
                  <span className="my-lesson-online-pill">En ligne</span>
                </div>

                {/* Lien partageable avec bouton de copie */}
                <div className="my-lesson-url-box">
                  <Globe size={14} className="url-globe-icon" />
                  <span className="my-lesson-url-text">{url}</span>
                  <button
                    className={`my-lesson-copy-btn ${isCopied ? 'copied' : ''}`}
                    onClick={() => handleCopy(lesson)}
                    data-tooltip="Copier le lien"
                  >
                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{isCopied ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>

                {/* Métriques / Pilules épurées (icône + nombre uniquement, sans background ni bordure) */}
                <div className="my-lesson-minimal-stats">
                  {lesson.tooltips.length > 0 && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${lesson.tooltips.length} infobulle${lesson.tooltips.length > 1 ? 's' : ''} créée${lesson.tooltips.length > 1 ? 's' : ''}`}
                    >
                      <HelpCircle size={14} />
                      <span className="stat-num">{lesson.tooltips.length}</span>
                    </span>
                  )}
                  {lesson.wordComments.length > 0 && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${lesson.wordComments.length} commentaire${lesson.wordComments.length > 1 ? 's' : ''} sur mots`}
                    >
                      <MessageSquare size={14} />
                      <span className="stat-num">{lesson.wordComments.length}</span>
                    </span>
                  )}
                  {lesson.homework && (
                    <span
                      className="lesson-stat-pill hw"
                      data-tooltip="Devoir inclus"
                    >
                      <GraduationCap size={14} />
                    </span>
                  )}
                  {lesson.allowReactions && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${reactionsTotal} réaction${reactionsTotal > 1 ? 's' : ''} reçue${reactionsTotal > 1 ? 's' : ''}`}
                    >
                      <Smile size={14} />
                      <span className="stat-num">{reactionsTotal}</span>
                    </span>
                  )}
                  {lesson.allowComments && (
                    <span
                      className="lesson-stat-pill"
                      data-tooltip={`${commentsCount} question${commentsCount > 1 ? 's' : ''} / message${commentsCount > 1 ? 's' : ''}`}
                    >
                      <MessageCircle size={14} />
                      <span className="stat-num">{commentsCount}</span>
                    </span>
                  )}
                </div>

                {/* Pied de carte avec date et actions */}
                <div className="my-lesson-card-foot">
                  <span className="my-lesson-date">
                    Exporté le {new Date(lesson.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <div className="my-lesson-actions">
                    <button
                      className="btn-secondary small"
                      onClick={() => window.open(url, '_blank')}
                      title="Ouvrir directement la leçon dans un nouvel onglet"
                    >
                      <ExternalLink size={13} />
                      <span>Voir la page</span>
                    </button>
                    <button
                      className="btn-danger-ghost small"
                      onClick={() => setDeleteConfirmLesson(lesson)}
                      title="Dépublier cette leçon"
                    >
                      <Trash2 size={13} />
                      <span>Dépublier</span>
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
                <h3>Dépublier cette leçon ?</h3>
                <p>{deleteConfirmLesson.resourceTitle} &bull; Page {deleteConfirmLesson.pageIndex + 1}</p>
              </div>
            </header>
            <div className="teacher-export-card-body">
              <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                Cette action supprimera définitivement le lien de partage. Vos élèves ne pourront plus accéder à cette page corrigée.
              </p>
            </div>
            <footer className="teacher-export-card-foot">
              <button className="btn-secondary" onClick={() => setDeleteConfirmLesson(null)}>
                Annuler
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirmLesson.id)}
              >
                <span>Dépublier définitivement</span>
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
        />
      )}
    </div>
  )
}
