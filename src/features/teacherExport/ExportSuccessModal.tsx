import React, { useState } from 'react'
import { Check, Copy, ExternalLink, Globe, X, HelpCircle, MessageSquare, GraduationCap } from 'lucide-react'
import type { UiLanguage } from '../../domain'
import { teacherCopy } from '../../i18n'
import type { ExportedLesson } from './teacherExportDomain'
import { buildExportUrl } from './teacherExportService'

type ExportSuccessModalProps = {
  lesson: ExportedLesson
  onClose: () => void
  onOpenViewer?: (lesson: ExportedLesson) => void
  ui?: UiLanguage
}

export function ExportSuccessModal({ lesson, onClose, ui = 'fr' }: ExportSuccessModalProps) {
  const [copied, setCopied] = useState(false)
  const fullUrl = buildExportUrl(lesson.username, lesson.id)
  const t = teacherCopy[ui] || teacherCopy.fr

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
      <div className="teacher-export-card success-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <header className="teacher-export-card-head">
          <div className="teacher-export-icon-badge success">
            <Check size={20} />
          </div>
          <div className="export-header-meta">
            <span className="export-header-title">{lesson.resourceTitle}</span>
            <div className="export-header-badges">
              {lesson.tooltips.length > 0 && (
                <span className="export-header-badge-item" title={`${lesson.tooltips.length} ${t.statTooltips}`}>
                  <HelpCircle size={13} style={{ color: '#ea580c' }} />
                  <span>{lesson.tooltips.length}</span>
                </span>
              )}
              {lesson.wordComments.length > 0 && (
                <span className="export-header-badge-item" title={`${lesson.wordComments.length} ${t.statComments}`}>
                  <MessageSquare size={13} style={{ color: '#d97706' }} />
                  <span>{lesson.wordComments.length}</span>
                </span>
              )}
              {lesson.homework && (
                <span className="export-header-badge-item" title={t.statHomework}>
                  <GraduationCap size={13} style={{ color: '#2563eb' }} />
                </span>
              )}
            </div>
          </div>
          <button className="teacher-export-close-btn" onClick={onClose} title={t.close}>
            <X size={16} />
          </button>
        </header>

        <div className="teacher-export-card-body">
          {/* Bloc d'affichage du lien avec bouton de copie */}
          <div className="export-link-box">
            <div className="export-link-url-line">
              <Globe size={16} className="export-link-icon" />
              <input
                type="text"
                readOnly
                value={fullUrl}
                className="export-link-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
            <button
              type="button"
              className={`export-copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  <span>{t.successCopied}</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>{t.copyLink}</span>
                </>
              )}
            </button>
          </div>

          <p className="export-info-subtext" style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            {t.successInfo}
          </p>
        </div>

        <footer className="teacher-export-card-foot">
          <button type="button" className="outline" onClick={handleOpenDirect}>
            <ExternalLink size={14} />
            <span>{t.viewPage}</span>
          </button>
          <button type="button" className="primary" onClick={onClose} autoFocus>
            <span>{t.done}</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
