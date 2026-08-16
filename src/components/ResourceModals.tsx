import React, { useEffect, useRef, useState } from 'react'
import { Check, FileText, Image, Pencil, Trash2, X } from 'lucide-react'
import type { Resource } from '../domain'
import { toChapters } from '../importer'

export type ResourceContextTarget = {
  resource: Resource
  x: number
  y: number
}

export type ResourceAction = 'editContent' | 'rename' | 'changeCover' | 'delete'

export function ResourceContextMenu({
  target,
  onSelectAction,
  onClose,
}: {
  target: ResourceContextTarget
  onSelectAction: (action: ResourceAction, resource: Resource) => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const menuWidth = 210
  const menuHeight = 170
  const left = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, target.x))
  const top = Math.max(10, Math.min(window.innerHeight - menuHeight - 10, target.y))

  return (
    <div
      ref={menuRef}
      className="page-context-menu resource-context-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="page-context-item"
        onClick={() => {
          onClose()
          onSelectAction('editContent', target.resource)
        }}
      >
        <i><FileText size={15} /></i> Modifier le contenu
      </button>

      <button
        type="button"
        className="page-context-item"
        onClick={() => {
          onClose()
          onSelectAction('rename', target.resource)
        }}
      >
        <i><Pencil size={15} /></i> Renommer
      </button>

      <button
        type="button"
        className="page-context-item"
        onClick={() => {
          onClose()
          onSelectAction('changeCover', target.resource)
        }}
      >
        <i><Image size={15} /></i> Modifier la couverture
      </button>

      <div className="page-context-sep" />

      <button
        type="button"
        className="page-context-item danger"
        onClick={() => {
          onClose()
          onSelectAction('delete', target.resource)
        }}
      >
        <i><Trash2 size={15} /></i> Supprimer
      </button>
    </div>
  )
}

export function EditContentModal({
  resource,
  onSave,
  onClose,
}: {
  resource: Resource
  onSave: (updated: Resource) => void
  onClose: () => void
}) {
  const initialText = resource.chapters.flatMap((c) => c.paragraphs).join('\n\n')
  const [content, setContent] = useState(initialText)

  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const chars = content.length
  const paragraphsCount = content.split(/\n{2,}|\r?\n(?=\S)/).filter((p) => p.trim().length > 0).length

  const handleSave = () => {
    const rawParagraphs = content
      .split(/\n{2,}|\r?\n(?=\S)/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0)

    const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : [content.trim() || 'Sans contenu']
    const newWords = paragraphs.join(' ').split(/\s+/).filter(Boolean).length
    const updated: Resource = {
      ...resource,
      chapters: toChapters(paragraphs),
      minutes: Math.max(1, Math.round(newWords / 180)),
    }
    onSave(updated)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="edit-content-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="edit-content-header">
          <div>
            <p className="eyebrow">MODIFIER LE CONTENU</p>
            <h2>{resource.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </header>

        <div className="edit-content-meta-bar">
          <span>{words} mots</span>
          <span>·</span>
          <span>{chars} caractères</span>
          <span>·</span>
          <span>{paragraphsCount} paragraphes</span>
        </div>

        <div className="edit-content-body">
          <textarea
            className="edit-content-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Écrivez ou collez le texte de la ressource ici..."
            autoFocus
          />
        </div>

        <footer className="edit-content-footer">
          <button type="button" className="outline" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            <Check size={16} /> Enregistrer les modifications
          </button>
        </footer>
      </div>
    </div>
  )
}

export function RenameModal({
  resource,
  onSave,
  onClose,
}: {
  resource: Resource
  onSave: (updated: Resource) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(resource.title)

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!title.trim()) return
    onSave({ ...resource, title: title.trim() })
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="rename-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rename-modal-head">
          <h3>Renommer la ressource</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="rename-modal-field">
            <label>Nouveau titre</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
              }}
            />
          </div>
          <div className="rename-modal-actions">
            <button type="button" className="outline" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="primary" disabled={!title.trim()}>
              <Check size={15} /> Renommer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function DeleteModal({
  resource,
  onConfirm,
  onClose,
}: {
  resource: Resource
  onConfirm: (resourceId: string) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="delete-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="delete-modal-head">
          <h3>Supprimer la ressource</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <p className="delete-modal-msg">
          Êtes-vous sûr de vouloir supprimer <strong>« {resource.title} »</strong> ? Cette action est irréversible.
        </p>
        <div className="delete-modal-actions">
          <button type="button" className="outline" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              onConfirm(resource.id)
              onClose()
            }}
          >
            <Trash2 size={15} /> Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  )
}
