import React, { useState } from 'react'
import { Check, Copy, ExternalLink, Globe, X, HelpCircle, MessageSquare, GraduationCap } from 'lucide-react'
import type { ExportedLesson } from './teacherExportDomain'
import { buildExportUrl } from './teacherExportService'

type ExportSuccessModalProps = {
  lesson: ExportedLesson
  onClose: () => void
  onOpenViewer?: (lesson: ExportedLesson) => void
}

export function ExportSuccessModal({ lesson, onClose }: ExportSuccessModalProps) {
  const [copied, setCopied] = useState(false)
  const fullUrl = buildExportUrl(lesson.username, lesson.id)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleOpenDirect = () => {
    window.open(fullUrl, '_blank')
  }

  return (
    <div className="teacher-export-overlay" onClick={onClose}>
      <div className="teacher-export-card success-card" onClick={(e) => e.stopPropagation()}>
        <header className="teacher-export-card-head">
          <div className="teacher-export-icon-badge success">
            <Check size={22} />
          </div>
          <div>
            <h3>Leçon exportée avec succès !</h3>
            <p>Votre lien unique est prêt à être partagé avec vos élèves.</p>
          </div>
          <button className="teacher-export-close-btn" onClick={onClose} title="Fermer">
            <X size={16} />
          </button>
        </header>

        <div className="teacher-export-card-body">
          {/* Bloc d'affichage du lien avec bouton de copie */}
          <div className="export-link-box">
            <div className="export-link-url-line">
              <Globe size={18} className="export-link-icon" />
              <input
                type="text"
                readOnly
                value={fullUrl}
                className="export-link-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
            <button className={`export-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
              {copied ? (
                <>
                  <Check size={16} />
                  <span>Copié !</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copier le lien</span>
                </>
              )}
            </button>
          </div>

          {/* Résumé des éléments exportés */}
          <div className="export-summary-pills">
            <div className="export-summary-pill">
              <strong>{lesson.resourceTitle}</strong> &bull; {lesson.pages?.length || lesson.totalPages || 1} page{(lesson.pages?.length || lesson.totalPages || 1) > 1 ? 's' : ''}
            </div>
            {lesson.tooltips.length > 0 && (
              <div className="export-summary-pill">
                <HelpCircle size={13} />
                <span>
                  {lesson.tooltips.length} infobulle{lesson.tooltips.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
            {lesson.wordComments.length > 0 && (
              <div className="export-summary-pill">
                <MessageSquare size={13} />
                <span>
                  {lesson.wordComments.length} commentaire{lesson.wordComments.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
            {lesson.homework && (
              <div className="export-summary-pill highlight">
                <GraduationCap size={13} />
                <span>Devoir inclus</span>
              </div>
            )}
          </div>

          <p className="export-info-subtext">
            Vous pourrez retrouver, consulter et dépublier vos leçons partagées à tout moment dans{' '}
            <strong>Paramètres &gt; Mes leçons</strong>.
          </p>
        </div>

        <footer className="teacher-export-card-foot">
          <button type="button" className="outline" onClick={handleOpenDirect}>
            <ExternalLink size={15} />
            <span>Voir la page</span>
          </button>
          <button type="button" className="primary" onClick={onClose} autoFocus>
            <span>Terminer</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
