import React from 'react'
import { AlertCircle, HelpCircle, Check, X, ArrowRight, Share2 } from 'lucide-react'

type NoModificationsModalProps = {
  onClose: () => void
}

export function NoModificationsModal({ onClose }: NoModificationsModalProps) {
  return (
    <div className="teacher-export-overlay" onClick={onClose}>
      <div className="teacher-export-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <header className="teacher-export-card-head">
          <div className="teacher-export-icon-badge warning">
            <AlertCircle size={22} />
          </div>
          <div>
            <h3>Ressource non modifiée</h3>
            <p>Aucune modification n'a été faite sur cette ressource, vous ne pouvez pas l'exporter.</p>
          </div>
          <button className="teacher-export-close-btn" onClick={onClose} title="Fermer">
            <X size={16} />
          </button>
        </header>
        <div className="teacher-export-card-body" style={{ paddingTop: 6 }}>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>
            Utilisez les outils du Teacher Mode (stylo, surligneur, édition du texte, lettres grisées, formes ou notes) pour apporter des corrections avant de créer un lien pour vos élèves.
          </p>
        </div>
        <footer className="teacher-export-card-foot">
          <button type="button" className="btn-primary" onClick={onClose} autoFocus>
            <span>Compris</span>
          </button>
        </footer>
      </div>
    </div>
  )
}

type ConfirmExportModalProps = {
  pageNumber: number
  totalPages: number
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmExportModal({ pageNumber, totalPages, onConfirm, onCancel }: ConfirmExportModalProps) {
  return (
    <div className="teacher-export-overlay" onClick={onCancel}>
      <div className="teacher-export-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <header className="teacher-export-card-head">
          <div className="teacher-export-icon-badge primary">
            <Share2 size={20} />
          </div>
          <div>
            <h3>Souhaitez-vous exporter cette page ?</h3>
            <p>
              Page {pageNumber} sur {totalPages} &bull; Toutes vos corrections et annotations actuelles seront incluses.
            </p>
          </div>
          <button className="teacher-export-close-btn" onClick={onCancel} title="Fermer">
            <X size={16} />
          </button>
        </header>

        <div className="teacher-export-card-body" style={{ paddingTop: 6 }}>
          <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>
            Vous allez accéder à l'aperçu final où vous pourrez ajouter des <strong>infobulles</strong>, des <strong>textes</strong>, des <strong>commentaires sur les mots</strong> et un <strong>devoir</strong> avant de générer le lien de partage pour vos élèves.
          </p>
        </div>

        <footer className="teacher-export-card-foot">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Non, annuler
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} autoFocus>
            <span>Oui, exporter</span>
            <ArrowRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  )
}
