import React from 'react'
import type { Language, LearnedWord } from '../../domain'
import { renderPhoneticFormatted } from './phoneticUtils'
import {
  X,
  Sparkles,
  Edit2,
  Trash2,
  Volume2,
  BookOpen,
} from 'lucide-react'
import { speak } from '../../ai'

export type PageSavedWordsModalProps = {
  isOpen: boolean
  onClose: () => void
  words: LearnedWord[]
  language: Language
  onEditWord: (word: LearnedWord) => void
  onDeleteWord?: (raw: string, language: Language) => void
  api?: any
}

export function PageSavedWordsModal({
  isOpen,
  onClose,
  words,
  language,
  onEditWord,
  onDeleteWord,
  api,
}: PageSavedWordsModalProps) {
  const [speakingWord, setSpeakingWord] = React.useState<string | null>(null)

  if (!isOpen) return null

  const handleSpeak = async (e: React.MouseEvent, text: string) => {
    e.stopPropagation()
    if (speakingWord || !text.trim()) return
    setSpeakingWord(text)
    try {
      if (api) {
        await speak(text, language, api)
      }
    } finally {
      setSpeakingWord(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card page-saved-words-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="page-saved-modal-header">
          <div className="page-saved-modal-title-wrap">
            <div className="page-saved-icon-circle">
              <Sparkles size={18} />
            </div>
            <div>
              <h3>Mots enregistrés sur cette page</h3>
              <p className="subtitle">
                {words.length} {words.length === 1 ? 'mot analysé et enregistré' : 'mots analysés et enregistrés'} par l'IA
              </p>
            </div>
          </div>
          <button
            type="button"
            className="vault-modal-close-btn"
            onClick={onClose}
            title="Fermer"
          >
            <X size={17} />
          </button>
        </header>

        <div className="page-saved-words-scroll">
          {words.length === 0 ? (
            <div className="empty-vocab-msg">
              <BookOpen size={30} className="empty-icon" />
              <p>Aucun mot enregistré pour cette page.</p>
            </div>
          ) : (
            <div className="page-saved-words-list">
              {words.map((w) => (
                <div key={w.id || w.normalized} className="page-saved-word-row">
                  <div className="page-saved-word-info">
                    <div className="page-saved-word-heading">
                      <strong className="word-text">{w.word}</strong>
                      {w.phonetic && (
                        <span className="word-phonetic">
                          {renderPhoneticFormatted(w.phonetic)}
                        </span>
                      )}
                      {w.partOfSpeech && (
                        <span className="word-pos-chip">{w.partOfSpeech}</span>
                      )}
                    </div>

                    {w.translation && (
                      <p className="word-translation">{w.translation}</p>
                    )}

                    {w.contextSentence && (
                      <blockquote className="word-context-snippet">
                        « {w.contextSentence} »
                      </blockquote>
                    )}

                    {w.tags && w.tags.length > 0 && (
                      <div className="word-tags-row">
                        {w.tags.map((t) => (
                          <span key={t} className="word-tag-pill">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="page-saved-word-actions">
                    <button
                      type="button"
                      className="icon-action-btn"
                      onClick={(e) => handleSpeak(e, w.word)}
                      title="Écouter la prononciation"
                    >
                      <Volume2
                        size={15}
                        className={speakingWord === w.word ? 'spinning' : ''}
                      />
                    </button>
                    <button
                      type="button"
                      className="icon-action-btn edit"
                      onClick={() => onEditWord(w)}
                      title="Modifier manuellement ce mot"
                    >
                      <Edit2 size={15} />
                    </button>
                    {onDeleteWord && (
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteWord(w.word, language)
                        }}
                        title="Supprimer ce mot enregistré"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="page-saved-modal-footer">
          <button type="button" className="primary btn-block" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </div>
    </div>
  )
}
