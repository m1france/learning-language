import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { ApiSettings, Language } from '../../domain'
import { translateText, type DeepLTranslationResult } from './deeplService'
import {
  Search,
  X,
  ExternalLink,
  Loader2,
  BookmarkPlus,
  Check,
} from 'lucide-react'

type TabType = 'deepl' | 'linguee' | 'cambridge'

type QuickWordLookupProps = {
  isOpen: boolean
  onClose: () => void
  language: Language
  api: ApiSettings
  onSaveWord?: (args: {
    raw: string
    sentence: string
    language: Language
    translation: string
    parent: string
    pronunciation: string
    tags?: string[]
  }) => void
}

export function QuickWordLookup({ isOpen, onClose, language, api, onSaveWord }: QuickWordLookupProps) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('deepl')
  const [translation, setTranslation] = useState<DeepLTranslationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<number | null>(null)

  // Focus input automatically when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  // Handle translation fetch with debounce
  const handleTranslate = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) {
        setTranslation(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const targetLang = api.deepLTargetLang || (language === 'fr' ? 'EN-US' : 'FR')
      try {
        const result = await translateText(trimmed, api.deepLKey, targetLang, 'FR')
        setTranslation(result)
      } catch (err) {
        console.error('[QuickWordLookup] Translation error:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [api.deepLKey, api.deepLTargetLang, language],
  )

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
    }

    if (!val.trim()) {
      setTranslation(null)
      setIsLoading(false)
      return
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void handleTranslate(val)
    }, 280)
  }

  const handleClear = () => {
    setQuery('')
    setTranslation(null)
    setIsSaved(false)
    inputRef.current?.focus()
  }

  const handleSaveToVault = () => {
    if (!onSaveWord || !query.trim() || !translation?.translatedText) return
    onSaveWord({
      raw: query.trim(),
      sentence: '',
      language,
      translation: translation.translatedText,
      parent: '',
      pronunciation: '',
      tags: ['oral', 'deepl'],
    })
    setIsSaved(true)
  }

  const cleanWord = query.trim().replace(/^[.,!?;:()"“”«»\s]+|[.,!?;:()"“”«»\s]+$/g, '')
  const lingueeUrl = `https://www.linguee.com/french-english/translation/${encodeURIComponent(cleanWord || 'bonjour')}.html`

  const openCambridgePopup = (wordToOpen: string = cleanWord) => {
    const target = wordToOpen || 'hello'
    const url = `https://dictionary.cambridge.org/dictionary/french-english/${encodeURIComponent(target.toLowerCase())}`
    const width = 760
    const height = 820
    const left = Math.max(0, (window.screenX ?? 0) + window.innerWidth - width - 40)
    const top = Math.max(0, (window.screenY ?? 0) + 60)
    window.open(
      url,
      'cambridge_quick_dict',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no`,
    )
  }

  if (!isOpen) return null

  return (
    <div className="quick-dict-drawer" onClick={(e) => e.stopPropagation()}>
      {/* Head with discrete tabs and close button */}
      <div className="quick-dict-head">
        <div className="quick-dict-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`quick-dict-tab ${activeTab === 'deepl' ? 'active' : ''}`}
            onClick={() => setActiveTab('deepl')}
          >
            DeepL
          </button>
          <button
            type="button"
            role="tab"
            className={`quick-dict-tab ${activeTab === 'linguee' ? 'active' : ''}`}
            onClick={() => setActiveTab('linguee')}
          >
            Linguee
          </button>
          <button
            type="button"
            role="tab"
            className={`quick-dict-tab ${activeTab === 'cambridge' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('cambridge')
              openCambridgePopup(cleanWord)
            }}
          >
            Cambridge
          </button>
        </div>
        <button className="quick-dict-close" onClick={onClose} title="Fermer">
          <X size={14} />
        </button>
      </div>

      {/* Body: Translation / Dictionary frames en haut */}
      <div className="quick-dict-body">
        {activeTab === 'deepl' && (
          <div className="quick-dict-deepl-view">
            {query.trim() ? (
              <>
                <div className="quick-dict-source-text">{query}</div>
                <div className="quick-dict-divider" />
                {isLoading ? (
                  <div className="quick-dict-loading">
                    <Loader2 size={13} className="spin" />
                    <span>Traduction en cours…</span>
                  </div>
                ) : (
                  <div className="quick-dict-translated-wrap">
                    <div className="quick-dict-translated-text">
                      {translation?.translatedText || 'Traduction…'}
                    </div>
                    {onSaveWord && translation?.translatedText && (
                      <button
                        type="button"
                        className={`quick-dict-save-btn ${isSaved ? 'saved' : ''}`}
                        onClick={handleSaveToVault}
                        title="Enregistrer ce mot dans mon vocabulaire"
                      >
                        {isSaved ? <Check size={12} /> : <BookmarkPlus size={12} />}
                        <span>{isSaved ? 'Enregistré' : 'Ajouter au vocabulaire'}</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="quick-dict-empty-state">
                Tape un mot ou une phrase ci-dessous pour traduire
              </div>
            )}
          </div>
        )}

        {activeTab === 'linguee' && (
          <div className="quick-dict-linguee-view">
            <iframe
              key={cleanWord}
              src={lingueeUrl}
              title={`Linguee — ${cleanWord}`}
              className="quick-dict-frame"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        )}

        {activeTab === 'cambridge' && (
          <div className="quick-dict-cambridge-view">
            <p className="quick-dict-cambridge-desc">
              Dictionnaire Cambridge avec prononciation sound-by-sound
            </p>
            <div className="quick-dict-cambridge-word">
              <span>Mot : </span>
              <strong>{cleanWord || query || '—'}</strong>
            </div>
            <button
              type="button"
              className="quick-dict-cambridge-btn"
              onClick={() => openCambridgePopup(cleanWord)}
            >
              <ExternalLink size={13} />
              <span>Ouvrir la fenêtre Cambridge</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer: Search input en bas */}
      <div className="quick-dict-bottom-search">
        <div className="quick-dict-input-wrap">
          <Search size={14} className="quick-dict-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="quick-dict-input"
            placeholder="Rechercher un mot ou une phrase..."
            value={query}
            onChange={handleQueryChange}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (query) {
                  handleClear()
                } else {
                  onClose()
                }
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="quick-dict-clear"
              onClick={handleClear}
              title="Effacer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
