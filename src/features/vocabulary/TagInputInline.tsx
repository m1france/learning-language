import React, { useState, useRef } from 'react'
import { X } from 'lucide-react'

export type TagInputInlineProps = {
  allTags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  label?: string
}

/**
 * Single-line inline autocomplete tag input (Google search bar style).
 * Displays ghost autocomplete text in-place and renders active tags on the right.
 */
export function TagInputInline({
  allTags,
  existingTags,
  onAdd,
  onRemove,
  label = 'Tags associés',
}: TagInputInlineProps) {
  const [input, setInput] = useState('')
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = input.trim().toLowerCase().replace(/^#/, '')
  const match = (!dismissedSuggestion && query && allTags.length > 0)
    ? allTags.find((t) => {
        const cleanT = t.toLowerCase().replace(/^#/, '')
        return cleanT.startsWith(query) && !existingTags.some((ex) => ex.toLowerCase().replace(/^#/, '') === cleanT)
      })
    : undefined

  const ghostSuffix = (match && input && match.toLowerCase().replace(/^#/, '').startsWith(query))
    ? match.replace(/^#/, '').slice(query.length)
    : ''

  const handleCommit = (tagToCommit?: string) => {
    const raw = tagToCommit || match || input.trim()
    const clean = raw.replace(/^#/, '').replace(/,/g, '').trim()
    if (clean && !existingTags.includes(clean)) {
      onAdd(clean)
      setInput('')
      setDismissedSuggestion(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleCommit()
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      if (match) {
        e.preventDefault()
        setInput(match.replace(/^#/, ''))
      }
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (ghostSuffix && !dismissedSuggestion) {
        e.preventDefault()
        setDismissedSuggestion(true)
      } else if (!input && existingTags.length > 0 && e.key === 'Backspace') {
        onRemove(existingTags[existingTags.length - 1])
      }
    } else if (e.key === 'Escape') {
      if (ghostSuffix && !dismissedSuggestion) {
        e.preventDefault()
        setDismissedSuggestion(true)
      } else {
        setInput('')
        setDismissedSuggestion(false)
      }
    }
  }

  return (
    <div className="wp-tag-line-row">
      <div className="wp-tag-input-box">
        <div className="wp-tag-ghost-text" aria-hidden="true">
          <span className="wp-tag-ghost-typed">{input}</span>
          <span className="wp-tag-ghost-suffix">{ghostSuffix}</span>
        </div>
        <input
          ref={inputRef}
          className="wp-tag-input-field"
          value={input}
          placeholder={existingTags.length === 0 ? label : '+ Tag'}
          onChange={(e) => {
            setInput(e.target.value)
            setDismissedSuggestion(false)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) {
              handleCommit()
            }
          }}
        />
      </div>
      {existingTags.length > 0 && (
        <div className="wp-tag-text-list">
          {existingTags.map((item) => (
            <button
              key={item}
              type="button"
              className="wp-tag-text-item"
              title="Cliquer pour supprimer"
              aria-label={`Supprimer ${item}`}
              onClick={() => onRemove(item)}
            >
              {item} <X size={10} style={{ marginLeft: 2, opacity: 0.7 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
