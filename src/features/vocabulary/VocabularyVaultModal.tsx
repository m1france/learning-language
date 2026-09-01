import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { AppState, Language, LearnedWord, UiLanguage, WordRelationType } from '../../domain'
import { ObsidianWordGraph } from './ObsidianWordGraph'
import { renderPhoneticFormatted, renderStyledMarkdown } from './phoneticUtils'
import { speak } from '../../ai'
import { downloadAnkiExport } from './ankiExporter'
import { vocabCopy } from '../../i18n'
import {
  BookOpen,
  Plus,
  Search,
  Volume2,
  Edit2,
  Trash2,
  X,
  Download,
  Check,
  ListChecks,
  Tag,
  Award,
} from 'lucide-react'

type VocabularyVaultModalProps = {
  state: AppState
  language: Language
  ui?: UiLanguage
  onSaveWord: (args: {
    raw: string
    sentence?: string
    language: Language
    translation: string
    parent?: string
    relationType?: WordRelationType
    pronunciation?: string
    knowledge?: number
    tags?: string[]
  }) => void
  onDeleteWord: (raw: string, language: Language) => void
  onBatchDeleteWords?: (raws: string[], language: Language) => void
  onBatchUpdateTags?: (raws: string[], language: Language, tags: string[], mode: 'replace' | 'add' | 'remove') => void
  onBatchUpdateKnowledge?: (raws: string[], language: Language, knowledge: number) => void
  onClose: () => void
}

const KNOWLEDGE_COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a']

/** Input de tag avec autocomplétion inline (identique à la page Lire). */
function TagInput({
  allTags,
  existingTags,
  onAdd,
  onRemove,
  label = 'Tags associés',
}: {
  allTags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  label?: string
}) {
  const [tagInput, setTagInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase().replace(/^#/, '')
    if (!q) return []
    return allTags.filter((t) => t.toLowerCase().includes(q) && !existingTags.includes(t))
  }, [allTags, existingTags, tagInput])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const clean = tagInput.trim().replace(/^#/, '').replace(/,/g, '')
      if (clean && !existingTags.includes(clean)) {
        onAdd(clean)
        setTagInput('')
        setShowSuggestions(false)
      }
    } else if (e.key === 'Backspace' && !tagInput && existingTags.length > 0) {
      onRemove(existingTags[existingTags.length - 1])
    }
  }

  const handleSelectSuggestion = (tag: string) => {
    onAdd(tag)
    setTagInput('')
    setShowSuggestions(false)
  }

  return (
    <div className="wp-tag-field" ref={wrapperRef}>
      <span>{label}</span>
      <div className="wp-tag-container">
        {existingTags.map((tag) => (
          <span key={tag} className="wp-tag-pill">
            #{tag}
            <button
              type="button"
              className="wp-tag-remove"
              onClick={() => onRemove(tag)}
              title="Supprimer le tag"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={tagInput}
          placeholder={existingTags.length === 0 ? 'Ajouter un tag (#verbe, #idiom...)' : 'Ajouter...'}
          onChange={(e) => {
            setTagInput(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="wp-tag-suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="wp-tag-suggestion-item"
              onClick={() => handleSelectSuggestion(s)}
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function VocabularyVaultModal({
  state,
  language,
  ui,
  onSaveWord,
  onDeleteWord,
  onBatchDeleteWords,
  onBatchUpdateTags,
  onBatchUpdateKnowledge,
  onClose,
}: VocabularyVaultModalProps) {
  const currentUi = ui || state.settings.uiLanguage || 'fr'
  const t = vocabCopy[currentUi] || vocabCopy.fr

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [selectedWord, setSelectedWord] = useState<LearnedWord | null>(null)
  const [editingWord, setEditingWord] = useState<LearnedWord | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [speakingWord, setSpeakingWord] = useState<string | null>(null)

  // Multi-selection state
  const [isMultiSelectActive, setIsMultiSelectActive] = useState(false)
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set())
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false)
  const [batchKnowledgeModalOpen, setBatchKnowledgeModalOpen] = useState(false)
  const [batchTags, setBatchTags] = useState<string[]>([])
  const [batchTagMode, setBatchTagMode] = useState<'replace' | 'add'>('replace')

  // Center clicked word from graph in the word list on the right
  useEffect(() => {
    if (selectedWord) {
      const el = document.getElementById(`vocab-item-${selectedWord.id}`)
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }
  }, [selectedWord])

  // Form State (matching Reader popup fields)
  const [formRaw, setFormRaw] = useState('')
  const [formTranslation, setFormTranslation] = useState('')
  const [formPronunciation, setFormPronunciation] = useState('')
  const [formParent, setFormParent] = useState('')
  const [formKnowledge, setFormKnowledge] = useState<number | undefined>(1)
  const [formTags, setFormTags] = useState<string[]>([])

  // Filter words by language
  const words = useMemo(
    () => (state.words ?? []).filter((w) => w.language === language),
    [state.words, language],
  )

  // Available tags
  const allTags = useMemo(() => {
    const set = new Set<string>()
    words.forEach((w) => (w.tags || []).forEach((tagItem) => set.add(tagItem)))
    return Array.from(set)
  }, [words])

  // Filtered words
  const filteredWords = useMemo(() => {
    return words.filter((w) => {
      const matchesSearch =
        !searchQuery.trim() ||
        w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.translation && w.translation.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (w.parent && w.parent.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesTag = !selectedTag || (w.tags && w.tags.includes(selectedTag))

      return matchesSearch && matchesTag
    })
  }, [words, searchQuery, selectedTag])

  const getWordKey = (w: LearnedWord) => w.normalized || w.word.toLowerCase().trim()

  const toggleMultiSelectMode = () => {
    if (isMultiSelectActive) {
      setIsMultiSelectActive(false)
      setSelectedWordIds(new Set())
    } else {
      setIsMultiSelectActive(true)
    }
  }

  const toggleWordSelection = (word: LearnedWord) => {
    const key = getWordKey(word)
    setSelectedWordIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const getSelectedWordsList = () => {
    return words.filter((w) => selectedWordIds.has(getWordKey(w)))
  }

  const handleBatchDelete = () => {
    const selectedList = getSelectedWordsList()
    if (selectedList.length === 0) return
    if (window.confirm(t.batchDeleteConfirm(selectedList.length))) {
      const raws = selectedList.map((w) => w.word)
      if (onBatchDeleteWords) {
        onBatchDeleteWords(raws, language)
      } else {
        for (const w of selectedList) {
          onDeleteWord(w.word, language)
        }
      }
      setSelectedWordIds(new Set())
      setIsMultiSelectActive(false)
    }
  }

  const handleApplyBatchTags = () => {
    const selectedList = getSelectedWordsList()
    if (selectedList.length === 0) return
    const raws = selectedList.map((w) => w.word)
    if (onBatchUpdateTags) {
      onBatchUpdateTags(raws, language, batchTags, batchTagMode)
    } else {
      for (const w of selectedList) {
        let nextTags = batchTags
        if (batchTagMode === 'add') {
          nextTags = Array.from(new Set([...(w.tags || []), ...batchTags]))
        }
        onSaveWord({
          raw: w.word,
          translation: w.translation || '',
          pronunciation: w.phonetic,
          parent: w.parent,
          knowledge: w.knowledge,
          tags: nextTags,
          language,
        })
      }
    }
    setSelectedWordIds(new Set())
    setIsMultiSelectActive(false)
    setBatchTagModalOpen(false)
    setBatchTags([])
  }

  const handleApplyBatchKnowledge = (lvl: number) => {
    const selectedList = getSelectedWordsList()
    if (selectedList.length === 0) return
    const raws = selectedList.map((w) => w.word)
    if (onBatchUpdateKnowledge) {
      onBatchUpdateKnowledge(raws, language, lvl)
    } else {
      for (const w of selectedList) {
        onSaveWord({
          raw: w.word,
          translation: w.translation || '',
          pronunciation: w.phonetic,
          parent: w.parent,
          knowledge: lvl,
          tags: w.tags,
          language,
        })
      }
    }
    setSelectedWordIds(new Set())
    setIsMultiSelectActive(false)
    setBatchKnowledgeModalOpen(false)
  }

  const openAddForm = () => {
    setFormRaw('')
    setFormTranslation('')
    setFormPronunciation('')
    setFormParent('')
    setFormKnowledge(1)
    setFormTags([])
    setEditingWord(null)
    setIsAddingNew(true)
  }

  const openEditForm = (word: LearnedWord) => {
    setFormRaw(word.word)
    setFormTranslation(word.translation || '')
    setFormPronunciation(word.phonetic || '')
    setFormParent(word.parent || '')
    setFormKnowledge(word.knowledge ?? 1)
    setFormTags(word.tags || [])
    setEditingWord(word)
    setIsAddingNew(true)
  }

  const handleSaveForm = () => {
    if (!formRaw.trim()) return

    onSaveWord({
      raw: formRaw.trim(),
      translation: formTranslation.trim(),
      pronunciation: formPronunciation.trim() || undefined,
      parent: formParent.trim() || undefined,
      knowledge: formKnowledge,
      tags: formTags.length > 0 ? formTags : undefined,
      language,
    })

    setIsAddingNew(false)
    setEditingWord(null)
  }

  const handleDelete = (word: LearnedWord) => {
    if (window.confirm(`${t.deleteWordConfirm} "${word.word}" ?`)) {
      onDeleteWord(word.word, language)
      if (selectedWord?.id === word.id) setSelectedWord(null)
      if (editingWord?.id === word.id) {
        setEditingWord(null)
        setIsAddingNew(false)
      }
    }
  }

  const handleSpeak = async (e: React.MouseEvent, word: string) => {
    e.stopPropagation()
    setSpeakingWord(word)
    try {
      await speak(word, language, state.settings.api)
    } finally {
      setSpeakingWord(null)
    }
  }

  return (
    <div className="vocab-vault-backdrop vocab-vault-overlay" onClick={onClose}>
      <div className="vocab-vault-modal" onClick={(e) => e.stopPropagation()}>
        <header className="vocab-vault-toolbar">
          <div className="search-field">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-btn" onClick={() => setSearchQuery('')}>
                ×
              </button>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="tags-filter-row">
              <button
                type="button"
                className={`tag-chip-btn ${!selectedTag ? 'active' : ''}`}
                onClick={() => setSelectedTag('')}
              >
                {t.allTags}
              </button>
              {allTags.map((tagItem) => (
                <button
                  key={tagItem}
                  type="button"
                  className={`tag-chip-btn ${selectedTag === tagItem ? 'active' : ''}`}
                  onClick={() => setSelectedTag(selectedTag === tagItem ? '' : tagItem)}
                >
                  #{tagItem}
                </button>
              ))}
            </div>
          )}

          <div className="vault-top-actions">
            {isMultiSelectActive && selectedWordIds.size >= 2 && (
              <div className="batch-actions-capsule">
                <button
                  type="button"
                  className="batch-capsule-sub-btn delete"
                  onClick={handleBatchDelete}
                  title={t.batchDeleteTitle(selectedWordIds.size)}
                >
                  <Trash2 size={14} />
                </button>
                <div className="batch-capsule-divider" />
                <button
                  type="button"
                  className="batch-capsule-sub-btn tags"
                  onClick={() => {
                    setBatchTags([])
                    setBatchTagMode('replace')
                    setBatchTagModalOpen(true)
                  }}
                  title={t.batchEditTagsTitle(selectedWordIds.size)}
                >
                  <Tag size={14} />
                </button>
                <div className="batch-capsule-divider" />
                <button
                  type="button"
                  className="batch-capsule-sub-btn level"
                  onClick={() => setBatchKnowledgeModalOpen(true)}
                  title={t.batchEditLevelTitle(selectedWordIds.size)}
                >
                  <Award size={14} />
                </button>
              </div>
            )}

            <button
              type="button"
              className={`vault-select-mode-btn ${isMultiSelectActive ? 'active' : ''}`}
              onClick={toggleMultiSelectMode}
              title={t.selectionMode}
            >
              <ListChecks size={15} />
            </button>

            <button
              type="button"
              className="outline icon-btn-sm"
              onClick={() => downloadAnkiExport(words, state.resources, `vocab-export-${language}.tsv`)}
              title={t.exportAnkiTitle}
            >
              <Download size={14} />
              <span>{t.exportAnki}</span>
            </button>

            <button type="button" className="primary btn-sm" onClick={openAddForm}>
              <Plus size={14} />
              <span>{t.newWord}</span>
            </button>

            <button type="button" className="vault-modal-close-btn" onClick={onClose} title={t.close}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="vocab-vault-workspace layout-split">
          <div className="vault-graph-panel">
            <div className="graph-embed-container">
              <ObsidianWordGraph
                words={filteredWords}
                selectedWordId={selectedWord?.normalized || selectedWord?.word.toLowerCase().trim()}
                selectedWordIds={Array.from(selectedWordIds)}
                isMultiSelectMode={isMultiSelectActive}
                onSelectWord={setSelectedWord}
                onToggleWordSelection={toggleWordSelection}
                ui={currentUi}
              />
            </div>
          </div>

          <div className="vault-list-panel">
            <div className="panel-title-bar">
              <h4>
                {t.wordsListTitle} <span className="counter-badge">{filteredWords.length}</span>
              </h4>
            </div>

            <div className="words-table-scroll">
                {filteredWords.length === 0 ? (
                  <div className="empty-vocab-msg">
                    <BookOpen size={28} className="empty-icon" />
                    <p>{t.noWordsFound}</p>
                  </div>
                ) : (
                  <div className="words-cards-list">
                    {filteredWords.map((w) => {
                      const isSelected = selectedWord?.id === w.id
                      const key = getWordKey(w)
                      const isMultiSelected = selectedWordIds.has(key)
                      const kColor = w.knowledge === 6 ? '#16a34a' : (w.knowledge ? KNOWLEDGE_COLORS[w.knowledge - 1] : '#8b5cf6')

                      return (
                        <div
                          key={w.id || w.word}
                          id={`vocab-item-${w.id}`}
                          className={`vocab-word-item ${isSelected && !isMultiSelectActive ? 'selected' : ''} ${isMultiSelectActive ? 'in-select-mode' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
                          onClick={() => {
                            if (isMultiSelectActive) {
                              toggleWordSelection(w)
                            } else {
                              setSelectedWord(w)
                            }
                          }}
                        >
                          {isMultiSelectActive && (
                            <div className={`word-select-checkbox ${isMultiSelected ? 'checked' : ''}`}>
                              {isMultiSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          )}

                          <div className="word-item-main">
                            <div className="word-header-line">
                              <strong className="word-title">{w.word}</strong>
                              {w.phonetic && <span className="word-ipa">{renderPhoneticFormatted(w.phonetic)}</span>}
                              <span
                                className="knowledge-indicator-dot"
                                style={{ background: kColor }}
                                title={w.knowledge === 6 ? t.masteryKnown : `${t.masteryLevel} ${w.knowledge ?? 1} / 5`}
                              />
                            </div>

                            {w.translation && <p className="word-translation-text">{renderStyledMarkdown(w.translation)}</p>}

                            {w.parent && (
                              <span className="word-root-badge">{t.rootWord} {w.parent}</span>
                            )}

                            {w.contextSentence && (
                              <blockquote className="word-context-quote">
                                « {renderStyledMarkdown(w.contextSentence)} »
                              </blockquote>
                            )}
                          </div>

                          {!isMultiSelectActive && (
                            <div className="word-item-actions">
                              <button
                                type="button"
                                className="icon-action-btn"
                                onClick={(e) => handleSpeak(e, w.word)}
                                title={t.listenPronunciation}
                              >
                                <Volume2 size={14} className={speakingWord === w.word ? 'spinning' : ''} />
                              </button>
                              <button
                                type="button"
                                className="icon-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditForm(w)
                                }}
                                title={t.editWord}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-action-btn delete"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(w)
                                }}
                                title={t.deleteWord}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>
          </div>
        </div>

        {isAddingNew && (
          <div className="vocab-form-drawer-overlay" onClick={() => setIsAddingNew(false)}>
            <div className="vocab-word-panel-card" onClick={(e) => e.stopPropagation()}>
              <div className="word-panel-top-bar">
                <h3>{editingWord ? t.editWordTitle : t.saveWordTitle}</h3>
                <button
                  type="button"
                  className="modal-close-icon-btn"
                  onClick={() => setIsAddingNew(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="wp-field">
                <span>{t.wordField}</span>
                <input
                  type="text"
                  value={formRaw}
                  placeholder={t.wordField}
                  onChange={(e) => setFormRaw(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="wp-field">
                <span>{t.referenceWordField}</span>
                <input
                  type="text"
                  value={formParent}
                  placeholder={t.referenceWordPlaceholder}
                  onChange={(e) => setFormParent(e.target.value)}
                />
              </div>

              <div className="wp-field">
                <span>{t.masteryField}</span>
                <div className="wp-knowledge">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      className={`kl-btn ${formKnowledge === lvl ? 'active' : ''}`}
                      style={{ ['--kl' as string]: KNOWLEDGE_COLORS[lvl - 1] }}
                      onClick={() => setFormKnowledge(lvl)}
                    >
                      {lvl}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`kl-btn known ${formKnowledge === 6 ? 'active' : ''}`}
                    title={t.masteryKnown}
                    aria-label={t.masteryKnown}
                    onClick={() => setFormKnowledge(6)}
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>

              <div className="wp-field">
                <span>{t.pronunciationField}</span>
                <input
                  type="text"
                  value={formPronunciation}
                  placeholder="/.../"
                  onChange={(e) => setFormPronunciation(e.target.value)}
                />
                {formPronunciation && (formPronunciation.includes('*') || formPronunciation.includes('_')) && (
                  <div className="wp-input-preview">
                    {renderPhoneticFormatted(formPronunciation)}
                  </div>
                )}
              </div>

              <div className="wp-field">
                <span>{t.translationField}</span>
                <textarea
                  value={formTranslation}
                  placeholder={t.translationField}
                  rows={2}
                  onChange={(e) => setFormTranslation(e.target.value)}
                />
                {formTranslation && (formTranslation.includes('*') || formTranslation.includes('_') || formTranslation.includes('<')) && (
                  <div className="wp-input-preview">
                    {renderStyledMarkdown(formTranslation)}
                  </div>
                )}
              </div>

              <div className="wp-field">
                <TagInput
                  allTags={allTags}
                  existingTags={formTags}
                  onAdd={(tagItem) => {
                    const clean = tagItem.trim().replace(/^#/, '')
                    if (clean && !formTags.includes(clean)) {
                      setFormTags([...formTags, clean])
                    }
                  }}
                  onRemove={(tagItem) => setFormTags(formTags.filter((x) => x !== tagItem))}
                  label={t.associatedTags}
                />
              </div>

              <div className="wp-footer" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="wp-save-btn-full primary"
                  disabled={!formRaw.trim()}
                  onClick={handleSaveForm}
                >
                  <span className="wp-save-btn-label">
                    {editingWord ? <><Check size={14} /> {t.save}</> : <><Plus size={14} /> {t.save}</>}
                  </span>
                  {formRaw.trim() && <em className="wp-save-btn-word">{formRaw.trim()}</em>}
                </button>
              </div>
            </div>
          </div>
        )}

        {batchTagModalOpen && (
          <div className="vocab-form-drawer-overlay" onClick={() => setBatchTagModalOpen(false)}>
            <div className="batch-edit-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="batch-modal-head">
                <div className="batch-modal-title">
                  <Tag size={16} />
                  <h3>{t.batchEditTagsModalTitle} ({selectedWordIds.size} {t.wordsCount})</h3>
                </div>
                <button type="button" className="modal-close-icon-btn" onClick={() => setBatchTagModalOpen(false)}>
                  <X size={15} />
                </button>
              </div>

              <div className="batch-tag-mode-switch">
                <button
                  type="button"
                  className={`batch-mode-tab ${batchTagMode === 'replace' ? 'active' : ''}`}
                  onClick={() => setBatchTagMode('replace')}
                >
                  {t.replaceTagsMode}
                </button>
                <button
                  type="button"
                  className={`batch-mode-tab ${batchTagMode === 'add' ? 'active' : ''}`}
                  onClick={() => setBatchTagMode('add')}
                >
                  {t.addTagsMode}
                </button>
              </div>

              <div className="batch-modal-body">
                <TagInput
                  allTags={allTags}
                  existingTags={batchTags}
                  onAdd={(tagItem) => {
                    const clean = tagItem.trim().replace(/^#/, '')
                    if (clean && !batchTags.includes(clean)) {
                      setBatchTags([...batchTags, clean])
                    }
                  }}
                  onRemove={(tagItem) => setBatchTags(batchTags.filter((x) => x !== tagItem))}
                  label={t.associatedTags}
                />
              </div>

              <div className="batch-modal-footer">
                <button type="button" className="outline btn-sm" onClick={() => setBatchTagModalOpen(false)}>
                  {t.cancel}
                </button>
                <button type="button" className="primary btn-sm" onClick={handleApplyBatchTags}>
                  <Check size={14} />
                  <span>{t.apply}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {batchKnowledgeModalOpen && (
          <div className="vocab-form-drawer-overlay" onClick={() => setBatchKnowledgeModalOpen(false)}>
            <div className="batch-edit-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="batch-modal-head">
                <div className="batch-modal-title">
                  <Award size={16} />
                  <h3>{t.batchEditLevelModalTitle} ({selectedWordIds.size} {t.wordsCount})</h3>
                </div>
                <button type="button" className="modal-close-icon-btn" onClick={() => setBatchKnowledgeModalOpen(false)}>
                  <X size={15} />
                </button>
              </div>

              <div className="batch-levels-grid">
                {[1, 2, 3, 4, 5, 6].map((lvl) => {
                  const color = lvl === 6 ? '#059669' : ['#e11d48', '#ea580c', '#d97706', '#2563eb', '#7c3aed'][lvl - 1]
                  const label = lvl === 6 ? t.masteryKnown : `${t.masteryLevel} ${lvl} / 5`
                  return (
                    <button
                      key={lvl}
                      type="button"
                      className="batch-level-choice-btn"
                      onClick={() => handleApplyBatchKnowledge(lvl)}
                    >
                      <span className="batch-level-dot" style={{ background: color }} />
                      <span className="batch-level-label">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
