import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { ApiSettings, Language } from '../../domain'
import { translateText, type DeepLTranslationResult } from './deeplService'
import { speak } from '../../ai'
import {
  Search,
  X,
  ExternalLink,
  Loader2,
  Volume2,
  Sparkles,
} from 'lucide-react'

type TabType = 'deepl' | 'linguee' | 'cambridge'

export type StageWordRequest = {
  word: string
  targetLang: Language
  contextSentence?: string
  fallbackTranslation?: string
}

type QuickWordLookupProps = {
  isOpen: boolean
  onClose: () => void
  language: Language
  ui?: 'fr' | 'en'
  api: ApiSettings
  existingTags?: string[]
  onRequestStageWord?: (req: StageWordRequest) => void
}

export function QuickWordLookup({
  isOpen,
  onClose,
  language,
  ui = 'fr',
  api,
  existingTags = [],
  onRequestStageWord,
}: QuickWordLookupProps) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('deepl')
  const [translation, setTranslation] = useState<DeepLTranslationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Floating word action popover state
  const [activeWordMenu, setActiveWordMenu] = useState<{
    word: string
    top: number
    left: number
    lang: Language
    contextSentence: string
  } | null>(null)

  const drawerRef = useRef<HTMLDivElement>(null)
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

  // Close context menu when clicking outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveWordMenu(null)
    }
    if (activeWordMenu) {
      window.addEventListener('click', handleGlobalClick)
    }
    return () => {
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [activeWordMenu])

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
        const result = await translateText(trimmed, api, targetLang, 'FR')
        setTranslation(result)
      } catch (err) {
        console.error('[QuickWordLookup] Translation error:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [api, language],
  )

  const queryWordCount = query.trim().split(/\s+/).filter(Boolean).length
  const isMultiWord = queryWordCount > 1

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setActiveWordMenu(null)

    const wordCount = val.trim().split(/\s+/).filter(Boolean).length
    if (wordCount > 1 && (activeTab === 'linguee' || activeTab === 'cambridge')) {
      setActiveTab('deepl')
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
    }

    if (!val.trim()) {
      setTranslation(null)
      setIsLoading(false)
      return
    }

    // Debounce translation lookup
    debounceTimerRef.current = window.setTimeout(() => {
      handleTranslate(val)
    }, 280)
  }

  const handleClear = () => {
    setQuery('')
    setTranslation(null)
    setActiveWordMenu(null)
    inputRef.current?.focus()
  }

  const handleWordTokenClick = (
    word: string,
    event: React.MouseEvent,
    wordLang: Language,
    contextSentence: string,
  ) => {
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const drawerRect = drawerRef.current?.getBoundingClientRect()

    // Calculate relative coordinates inside drawer
    const top = (drawerRect ? rect.bottom - drawerRect.top : rect.bottom) + 6
    const left = Math.max(
      12,
      Math.min(
        (drawerRect ? rect.left - drawerRect.left : rect.left) - 30,
        (drawerRect?.width || 340) - 230,
      ),
    )

    setActiveWordMenu({
      word,
      top,
      left,
      lang: wordLang,
      contextSentence,
    })
  }

  // Action 1: Pronounce word immediately and close menu
  const handlePronounce = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeWordMenu?.word) return
    const wordToSpeak = activeWordMenu.word
    const langToSpeak = activeWordMenu.lang
    setActiveWordMenu(null)
    void speak(wordToSpeak, langToSpeak, api)
  }

  // Action 2: Trigger AI analysis in background and close menu immediately
  const handleSaveWord = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeWordMenu?.word || !onRequestStageWord) return
    const stagedReq: StageWordRequest = {
      word: activeWordMenu.word,
      targetLang: activeWordMenu.lang,
      contextSentence: activeWordMenu.contextSentence,
      fallbackTranslation: translation?.translatedText,
    }
    setActiveWordMenu(null)
    onRequestStageWord(stagedReq)
  }

  const cleanWord = query.trim().replace(/^[.,!?;:()"“”«»\s]+|[.,!?;:()"“”«»\s]+$/g, '')

  // Linguee iframe URL
  const lingueeUrl = `https://www.linguee.com/french-english/translation/${encodeURIComponent(cleanWord || 'bonjour')}.html`

  // Cambridge popup URL
  const openCambridgePopup = (wordToSearch: string = cleanWord) => {
    const term = (wordToSearch || 'hello').toLowerCase()
    const url = `https://dictionary.cambridge.org/dictionary/french-english/${encodeURIComponent(term)}`
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

  /** Render text broken down into individually clickable word tokens */
  const renderWordTokens = (text: string, wordLang: Language) => {
    const tokens = text.split(/(\s+)/)
    return tokens.map((token, idx) => {
      if (/^\s+$/.test(token)) {
        return <React.Fragment key={idx}>{token}</React.Fragment>
      }
      const stripped = token.replace(/^[.,!?;:()"“”«»\s]+|[.,!?;:()"“”«»\s]+$/g, '')
      if (!stripped) {
        return <React.Fragment key={idx}>{token}</React.Fragment>
      }
      return (
        <span
          key={idx}
          className="quick-dict-word-token"
          onClick={(e) => handleWordTokenClick(stripped, e, wordLang, text)}
          title={`Cliquer pour prononcer ou enregistrer "${stripped}"`}
        >
          {token}
        </span>
      )
    })
  }

  if (!isOpen) return null

  return (
    <div ref={drawerRef} className="quick-dict-drawer" onClick={(e) => e.stopPropagation()}>
      {/* Head with discrete tabs and close button */}
      <div className="quick-dict-head">
        <div className="quick-dict-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`quick-dict-tab ${activeTab === 'deepl' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('deepl')
              setActiveWordMenu(null)
            }}
          >
            DeepL
          </button>
          <button
            type="button"
            role="tab"
            disabled={isMultiWord}
            className={`quick-dict-tab ${activeTab === 'linguee' ? 'active' : ''} ${isMultiWord ? 'disabled' : ''}`}
            onClick={() => {
              if (isMultiWord) return
              setActiveTab('linguee')
              setActiveWordMenu(null)
            }}
            title={isMultiWord ? (ui === 'fr' ? 'Uniquement pour un seul mot' : 'Only available for a single word') : undefined}
          >
            Linguee
          </button>
          <button
            type="button"
            role="tab"
            disabled={isMultiWord}
            className={`quick-dict-tab ${activeTab === 'cambridge' ? 'active' : ''} ${isMultiWord ? 'disabled' : ''}`}
            onClick={() => {
              if (isMultiWord) return
              setActiveTab('cambridge')
              setActiveWordMenu(null)
              openCambridgePopup(cleanWord)
            }}
            title={isMultiWord ? (ui === 'fr' ? 'Uniquement pour un seul mot' : 'Only available for a single word') : undefined}
          >
            Cambridge
          </button>
        </div>
        <button className="quick-dict-close" onClick={onClose} title="Fermer">
          <X size={14} />
        </button>
      </div>

      {/* Body: Translation / Dictionary frames */}
      <div className="quick-dict-body">
        {activeTab === 'deepl' && (
          <div className="quick-dict-deepl-view">
            {query.trim() ? (
              <>
                <div className="quick-dict-source-text">
                  {renderWordTokens(query, language === 'fr' ? 'en' : 'fr')}
                </div>
                <div className="quick-dict-divider" />
                {isLoading ? (
                  <div className="quick-dict-loading">
                    <Loader2 size={13} className="spin" />
                    <span>Traduction en cours…</span>
                  </div>
                ) : (
                  <div className="quick-dict-translated-wrap">
                    <div className="quick-dict-translated-text">
                      {translation?.translatedText ? (
                        renderWordTokens(translation.translatedText, language)
                      ) : (
                        'Traduction…'
                      )}
                    </div>
                    {translation && (
                      <div className="quick-dict-provider-tag">
                        {translation.provider === 'deepl' && '✓ DeepL officiel'}
                        {translation.provider === 'ai' && '✦ Agent IA'}
                        {translation.provider === 'fallback' && '○ Secours auto'}
                      </div>
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

        {/* Floating Discreet Word Context Menu matching in-place topic drawer style */}
        {activeWordMenu && (
          <div
            className="quick-dict-word-popover"
            style={{
              top: activeWordMenu.top,
              left: activeWordMenu.left,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="word-popover-header">
              <span className="word-popover-title">{activeWordMenu.word}</span>
              <button
                type="button"
                className="word-popover-close"
                onClick={() => setActiveWordMenu(null)}
                title="Fermer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="word-popover-actions">
              <button
                type="button"
                className="word-popover-btn"
                onClick={handlePronounce}
                title="Prononcer le mot avec la voix configurée"
              >
                <Volume2 size={15} className="popover-icon" />
                <span>Prononcer le mot</span>
              </button>

              <button
                type="button"
                className="word-popover-btn primary"
                onClick={handleSaveWord}
                title="Analyser par IA et ajouter aux mots à revoir"
              >
                <Sparkles size={15} className="popover-icon" />
                <span>Enregistrer le mot</span>
              </button>
            </div>
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
                if (activeWordMenu) {
                  setActiveWordMenu(null)
                } else if (query) {
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
