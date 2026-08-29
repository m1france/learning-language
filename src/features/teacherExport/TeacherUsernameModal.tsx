import React, { useState } from 'react'
import { User, Globe, ArrowRight, X } from 'lucide-react'
import type { UiLanguage } from '../../domain'
import { teacherCopy } from '../../i18n'
import { normalizeTeacherUsername } from './teacherExportService'

type TeacherUsernameModalProps = {
  initialValue?: string
  onSave: (username: string) => void
  onCancel: () => void
  ui?: UiLanguage
}

export function TeacherUsernameModal({ initialValue = '', onSave, onCancel, ui = 'fr' }: TeacherUsernameModalProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const t = teacherCopy[ui] || teacherCopy.fr

  const clean = normalizeTeacherUsername(value)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clean || clean.length < 2) {
      setError(t.teacherUsernameError)
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
            <h3>{t.chooseUsernameTitle}</h3>
            <p>{t.chooseUsernameDesc}</p>
          </div>
          <button className="teacher-export-close-btn" onClick={onCancel} title={t.close}>
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="teacher-export-card-body">
          <div className="teacher-export-field">
            <label htmlFor="teacher-username-input">{t.teacherUsernameLabel}</label>
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
                placeholder={t.teacherUsernamePlaceholder}
                maxLength={30}
              />
            </div>
            {error && <span className="teacher-export-error">{error}</span>}
          </div>

          <div className="teacher-export-url-preview">
            <Globe size={15} />
            <div className="teacher-export-url-text">
              <span>{t.studentsReceiveUrl}</span>
              <code>
                share.mathisbnl.info/<strong>{clean || t.yourName}</strong>/x9y2z4
              </code>
            </div>
          </div>

          <footer className="teacher-export-card-foot">
            <button type="button" className="outline" onClick={onCancel}>
              {t.cancel}
            </button>
            <button type="submit" className="primary" disabled={!clean || clean.length < 2}>
              <span>{t.continueBtn}</span>
              <ArrowRight size={16} />
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
