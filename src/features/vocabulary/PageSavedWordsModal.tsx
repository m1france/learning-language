import React from 'react'
import type { Language, LearnedWord, UiLanguage } from '../../domain'
import { renderPhoneticFormatted, renderStyledMarkdown } from './phoneticUtils'
import {
  X,
  Sparkles,
  Edit2,
  Trash2,
  Volume2,
  BookOpen,
} from 'lucide-react'
import { speak } from '../../ai'
import { vocabCopy } from '../../i18n'

export type PageSavedWordsModalProps = {
  isOpen: boolean
  onClose: () => void
  words: LearnedWord[]
  language: Language
  ui?: UiLanguage
  onEditWord: (word: LearnedWord) => void
  onDeleteWord?: (raw: string, language: Language) => void
  onDeleteAllWords?: () => void
  api?: any
}

export function PageSavedWordsModal({
  isOpen,
  onClose,
  words,
  language,
  ui = 'fr',
  onEditWord,
  onDeleteWord,
  onDeleteAllWords,
  api,
}: PageSavedWordsModalProps) {
  const t = vocabCopy[ui] || vocabCopy.fr
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

  const handleDeleteAll = () => {
    if (onDeleteAllWords) {
      onDeleteAllWords()
    } else if (onDeleteWord) {
      for (const w of words) {
        onDeleteWord(w.word, language)
      }
      onClose()
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
              <h3>{t.savedPageWordsTitle}</h3>
              <p className="subtitle">
                {words.length} {t.wordsCount} {t.savedPageWordsSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="vault-modal-close-btn"
            onClick={onClose}
            title={t.close}
          >
            <X size={17} />
          </button>
        </header>

        <div className="page-saved-words-scroll">
          {words.length === 0 ? (
            <div className="empty-vocab-msg">
              <BookOpen size={30} className="empty-icon" />
              <p>{t.noSavedWordsOnPage}</p>
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
                      <p className="word-translation-line">{renderStyledMarkdown(w.translation)}</p>
                    )}

                    {w.parent && (
                      <span className="word-parent-chip">
                        {t.rootWord} {w.parent}
                      </span>
                    )}

                    {w.contextSentence && (
                      <blockquote className="word-context-line">
                        « {renderStyledMarkdown(w.contextSentence)} »
                      </blockquote>
                    )}
                  </div>

                  <div className="page-saved-word-actions">
                    <button
                      type="button"
                      className="icon-action-btn speak"
                      onClick={(e) => handleSpeak(e, w.word)}
                      title={t.listenPronunciation}
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
                      title={t.editWord}
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
                        title={t.deleteWord}
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
          {words.length > 0 && (
            <button
              type="button"
              className="page-saved-delete-all-btn"
              onClick={handleDeleteAll}
              title={t.cancelAndDeleteAllWords}
              aria-label={t.cancelAndDeleteAllWords}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button type="button" className="primary btn-block page-saved-close-btn" onClick={onClose}>
            {t.close}
          </button>
        </footer>
      </div>
    </div>
  )
}
