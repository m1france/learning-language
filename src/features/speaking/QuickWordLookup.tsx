import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { ApiSettings, Language } from '../../domain'
import { translateText, type DeepLTranslationResult } from './deeplService'
import { analyzeWordWithAi, type StagedWord } from './wordAiService'
import { speak } from '../../ai'
import {
  Search,
  X,
  ExternalLink,
  Loader2,
  Volume2,
  BookmarkPlus,
  Check,
  Sparkles,
} from 'lucide-react'

type TabType = 'deepl' | 'linguee' | 'cambridge'

type QuickWordLookupProps = {
  isOpen: boolean
  onClose: () => void
  language: Language
  ui?: 'fr' | 'en'
  api: ApiSettings
  existingTags?: string[]
  onStageWord?: (word: StagedWord) => void
}

export function QuickWordLookup({
  isOpen,
  onClose,
  language,
  ui = 'fr',
  api,
  existingTags = [],
  onStageWord,
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
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [savedSuccessWord, setSavedSuccessWord] = useState<string | null>(null)
  const [isPlayingTts, setIsPlayingTts] = useState(false)

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
      setSavedSuccessWord(null)
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
    setActiveWordMenu(null)
    setSavedSuccessWord(null)

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
    setActiveWordMenu(null)
    setSavedSuccessWord(null)
    inputRef.current?.focus()
  }

  const handleWordClick = (
    word: string,
    event: React.MouseEvent<HTMLElement>,
    lang: Language,
    contextSentence: string,
  ) => {
    event.stopPropagation()
    const targetElement = event.currentTarget
    const rect = targetElement.getBoundingClientRect()
    const drawerRect = drawerRef.current?.getBoundingClientRect()

    // Calculate relative coordinates inside drawer
    const top = (drawerRect ? rect.bottom - drawerRect.top : rect.bottom) + 6
    const left = Math.max(12, Math.min((drawerRect ? rect.left - drawerRect.left : rect.left) - 30, (drawerRect?.width || 340) - 210))

    setSavedSuccessWord(null)
    setActiveWordMenu({
      word,
      top,
      left,
      lang,
      contextSentence,
    })
  }

  const handlePronounceWord = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeWordMenu?.word) return
    setIsPlayingTts(true)
    try {
      await speak(activeWordMenu.word, activeWordMenu.lang, api)
    } finally {
      setIsPlayingTts(false)
    }
  }

  const handleSaveWordWithAi = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeWordMenu?.word || !onStageWord) return
    setIsAiAnalyzing(true)

    try {
      const analysis = await analyzeWordWithAi({
        word: activeWordMenu.word,
        targetLang: activeWordMenu.lang,
        uiLang: ui,
        existingTags,
        api,
        contextSentence: activeWordMenu.contextSentence,
        fallbackTranslation: translation?.translatedText,
      })

      const staged: StagedWord = {
        id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        word: analysis.word || activeWordMenu.word,
        translation: analysis.translation,
        pronunciation: analysis.pronunciation,
        parent: analysis.parent,
        partOfSpeech: analysis.partOfSpeech,
        tags: analysis.tags,
        contextSentence: activeWordMenu.contextSentence,
        language: activeWordMenu.lang,
        timestamp: new Date().toISOString(),
      }

      onStageWord(staged)
      setSavedSuccessWord(activeWordMenu.word)
      setTimeout(() => {
        setActiveWordMenu(null)
        setSavedSuccessWord(null)
      }, 1400)
    } catch (err) {
      console.error('[QuickWordLookup] Error analyzing and staging word:', err)
    } finally {
      setIsAiAnalyzing(false)
    }
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

  /** Render text broken down into individually clickable word tokens */
  const renderWordTokens = (text: string, textLang: Language) => {
    const tokens = text.split(/([\s.,!?;:()"“”«»]+)/)
    return tokens.map((token, idx) => {
      const clean = token.replace(/^[.,!?;:()"“”«»\s]+|[.,!?;:()"“”«»\s]+$/g, '')
      if (!clean) {
        return <span key={idx}>{token}</span>
      }
      return (
        <span
          key={idx}
          className="quick-dict-word-token"
          onClick={(e) => handleWordClick(clean, e, textLang, text)}
          title={`Cliquer pour prononcer ou enregistrer "${clean}"`}
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
            className={`quick-dict-tab ${activeTab === 'linguee' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('linguee')
              setActiveWordMenu(null)
            }}
          >
            Linguee
          </button>
          <button
            type="button"
            role="tab"
            className={`quick-dict-tab ${activeTab === 'cambridge' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('cambridge')
              setActiveWordMenu(null)
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

        {/* Floating Discreet Word Context Menu */}
        {activeWordMenu && (
          <div
            className="quick-dict-word-popover glass"
            style={{
              top: activeWordMenu.top,
              left: activeWordMenu.left,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="word-popover-header">
              <strong>{activeWordMenu.word}</strong>
              <button
                type="button"
                className="word-popover-close"
                onClick={() => setActiveWordMenu(null)}
              >
                <X size={12} />
              </button>
            </div>

            {savedSuccessWord === activeWordMenu.word ? (
              <div className="word-popover-success">
                <Check size={14} />
                <span>Enregistré pour la revue !</span>
              </div>
            ) : (
              <div className="word-popover-actions">
                <button
                  type="button"
                  className={`word-popover-btn ${isPlayingTts ? 'active' : ''}`}
                  onClick={handlePronounceWord}
                  title="Écouter la prononciation"
                >
                  <Volume2 size={14} />
                  <span>Prononcer le mot</span>
                </button>

                <button
                  type="button"
                  className="word-popover-btn primary"
                  onClick={handleSaveWordWithAi}
                  disabled={isAiAnalyzing}
                  title="Analyser par IA et ajouter aux mots à revoir"
                >
                  {isAiAnalyzing ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      <span>Analyse IA…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Enregistrer le mot</span>
                    </>
                  )}
                </button>
              </div>
            )}
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
