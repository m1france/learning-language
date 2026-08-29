import React from 'react'
import { ArrowRight, X } from 'lucide-react'
import type { UiLanguage } from '../../domain'
import { teacherCopy } from '../../i18n'

type NoModificationsModalProps = {
  onClose: () => void
  ui?: UiLanguage
}

export function NoModificationsModal({ onClose, ui = 'fr' }: NoModificationsModalProps) {
  const t = teacherCopy[ui] || teacherCopy.fr
  return (
    <div className="teacher-export-overlay" onClick={onClose}>
      <div className="app-minimal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" onClick={onClose} aria-label={t.close}>
          <X size={16} />
        </button>
        <h3 className="modal-minimal-title">{t.noModifTitle}</h3>
        <div className="modal-minimal-actions">
          <button type="button" className="primary" onClick={onClose} autoFocus>
            <span>{t.gotIt}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

type ConfirmExportModalProps = {
  pageNumber?: number
  totalPages?: number
  onConfirm: () => void
  onCancel: () => void
  ui?: UiLanguage
}

export function ConfirmExportModal({ onConfirm, onCancel, ui = 'fr' }: ConfirmExportModalProps) {
  const t = teacherCopy[ui] || teacherCopy.fr
  return (
    <div className="teacher-export-overlay" onClick={onCancel}>
      <div className="app-minimal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" onClick={onCancel} aria-label={t.close}>
          <X size={16} />
        </button>
        <h3 className="modal-minimal-title">{t.confirmExportTitle}</h3>
        <div className="modal-minimal-actions">
          <button type="button" className="outline" onClick={onCancel}>
            {t.cancel}
          </button>
          <button type="button" className="primary" onClick={onConfirm} autoFocus>
            <span>{t.yesExport}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
