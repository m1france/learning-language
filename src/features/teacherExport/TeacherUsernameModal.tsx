import React, { useState } from 'react'
import { User, Globe, ArrowRight, X } from 'lucide-react'
import { normalizeTeacherUsername } from './teacherExportService'

type TeacherUsernameModalProps = {
  initialValue?: string
  onSave: (username: string) => void
  onCancel: () => void
}

export function TeacherUsernameModal({ initialValue = '', onSave, onCancel }: TeacherUsernameModalProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')

  const clean = normalizeTeacherUsername(value)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clean || clean.length < 2) {
      setError('Veuillez saisir au moins 2 caractères (lettres ou chiffres).')
      return
    }
    onSave(clean)
  }

  return (
    <div className="teacher-export-overlay" onClick={onCancel}>
      <div className="teacher-export-card" onClick={(e) => e.stopPropagation()}>
        <header className="teacher-export-card-head">
          <div className="teacher-export-icon-badge">
            <User size={20} />
          </div>
          <div>
            <h3>Choisissez votre nom d'utilisateur</h3>
            <p>Ce nom sera utilisé pour créer vos liens de partage de leçons.</p>
          </div>
          <button className="teacher-export-close-btn" onClick={onCancel} title="Fermer">
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="teacher-export-card-body">
          <div className="teacher-export-field">
            <label htmlFor="teacher-username-input">Nom d'utilisateur enseignant</label>
            <div className="teacher-export-input-wrap">
              <span className="teacher-export-input-prefix">@</span>
              <input
                id="teacher-username-input"
                type="text"
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setError('')
                }}
                placeholder="prof-dupont ou mathis"
                maxLength={30}
              />
            </div>
            {error && <span className="teacher-export-error">{error}</span>}
          </div>

          <div className="teacher-export-url-preview">
            <Globe size={15} />
            <div className="teacher-export-url-text">
              <span>Vos élèves recevront des liens sous la forme :</span>
              <code>
                share.mathisbnl.info/<strong>{clean || 'votre-nom'}</strong>/x9y2z4
              </code>
            </div>
          </div>

          <footer className="teacher-export-card-foot">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={!clean || clean.length < 2}>
              <span>Continuer</span>
              <ArrowRight size={16} />
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
