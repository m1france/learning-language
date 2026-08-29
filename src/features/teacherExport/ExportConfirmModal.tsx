import React from 'react'
import { ArrowRight, X } from 'lucide-react'

type NoModificationsModalProps = {
  onClose: () => void
}

export function NoModificationsModal({ onClose }: NoModificationsModalProps) {
  return (
    <div className="teacher-export-overlay" onClick={onClose}>
      <div className="app-minimal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" onClick={onClose} aria-label="Fermer">
          <X size={16} />
        </button>
        <h3 className="modal-minimal-title">Aucune modification n'a été faite sur cette ressource, vous ne pouvez pas l'exporter</h3>
        <div className="modal-minimal-actions">
          <button type="button" className="primary" onClick={onClose} autoFocus>
            <span>Compris</span>
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
}

export function ConfirmExportModal({ onConfirm, onCancel }: ConfirmExportModalProps) {
  return (
    <div className="teacher-export-overlay" onClick={onCancel}>
      <div className="app-minimal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" onClick={onCancel} aria-label="Fermer">
          <X size={16} />
        </button>
        <h3 className="modal-minimal-title">Souhaitez-vous exporter cette ressource ?</h3>
        <div className="modal-minimal-actions">
          <button type="button" className="outline" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="primary" onClick={onConfirm} autoFocus>
            <span>Oui, exporter</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
