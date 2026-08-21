import React, { useState, useMemo, useRef } from 'react'
import type { AppState, Language, LearnedWord, WordRelationType } from '../../domain'
import { ObsidianWordGraph } from './ObsidianWordGraph'
import { renderPhoneticFormatted } from './phoneticUtils'
import { speak } from '../../ai'
import { downloadAnkiExport } from './ankiExporter'
import {
  BookOpen,
  Plus,
  Search,
  Volume2,
  Edit2,
  Trash2,
  X,
  Sparkles,
  Download,
  Layers,
  Layout,
  Check,
} from 'lucide-react'

type VocabularyVaultModalProps = {
  state: AppState
  language: Language
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
  onClose: () => void
}

const KNOWLEDGE_COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a']

/** Input de tag avec autocomplétion inline (identique à la page Lire). */
function TagInput({
  allTags,
  existingTags,
  onAdd,
  onRemove,
  label,
}: {
  allTags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  label: string
}) {
  const [input, setInput] = useState('')
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = input.trim().toLowerCase()
  const match =
    !dismissedSuggestion && query && allTags.length > 0
      ? allTags.find(
          (t) =>
            t.toLowerCase().startsWith(query) &&
            !existingTags.some((ex) => ex.toLowerCase() === t.toLowerCase()),
        )
      : undefined

  const ghostSuffix =
    match && input && match.toLowerCase().startsWith(input.toLowerCase())
      ? match.slice(input.length)
      : ''

  const handleCommit = (tagToCommit?: string) => {
    const finalTag = tagToCommit || match || input.trim()
    if (finalTag) {
      onAdd(finalTag)
      setInput('')
      setDismissedSuggestion(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCommit()
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      if (match) {
        e.preventDefault()
        setInput(match)
      }
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (ghostSuffix && !dismissedSuggestion) {
        e.preventDefault()
        setDismissedSuggestion(true)
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

export function VocabularyVaultModal({
  state,
  language,
  onSaveWord,
  onDeleteWord,
  onClose,
}: VocabularyVaultModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [viewLayout, setViewLayout] = useState<'split' | 'graph' | 'list'>('split')
  const [selectedWord, setSelectedWord] = useState<LearnedWord | null>(null)
  const [editingWord, setEditingWord] = useState<LearnedWord | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [speakingWord, setSpeakingWord] = useState<string | null>(null)

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
    words.forEach((w) => (w.tags || []).forEach((t) => set.add(t)))
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
    if (window.confirm(`Supprimer définitivement le mot "${word.word}" ?`)) {
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
    <div className="vocab-vault-overlay" onClick={onClose}>
      <div className="vocab-vault-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <header className="vocab-vault-header">
          <div className="vault-header-title-area">
            <div className="vault-header-icon">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="vault-title-row">
                <h2>Mon Vocabulaire Enregistré</h2>
                <span className="count-pill">{words.length} mots</span>
              </div>
              <p className="vault-subtitle">
                Graphe de connexions lexicales & révision active
              </p>
            </div>
          </div>

          <div className="vault-top-actions">
            <div className="segmented-sm">
              <button
                type="button"
                className={viewLayout === 'split' ? 'active' : ''}
                onClick={() => setViewLayout('split')}
              >
                <Layout size={13} />
                <span>Mixte</span>
              </button>
              <button
                type="button"
                className={viewLayout === 'graph' ? 'active' : ''}
                onClick={() => setViewLayout('graph')}
              >
                <Sparkles size={13} />
                <span>Graphe</span>
              </button>
              <button
                type="button"
                className={viewLayout === 'list' ? 'active' : ''}
                onClick={() => setViewLayout('list')}
              >
                <Layers size={13} />
                <span>Liste</span>
              </button>
            </div>

            <button
              type="button"
              className="outline icon-btn-sm"
              onClick={() => downloadAnkiExport(words, state.resources, `vocab-export-${language}.tsv`)}
              title="Exporter tout en TSV Anki"
            >
              <Download size={14} />
              <span>Export Anki</span>
            </button>

            <button type="button" className="primary btn-sm" onClick={openAddForm}>
              <Plus size={14} />
              <span>Nouveau mot</span>
            </button>

            <button type="button" className="vault-modal-close-btn" onClick={onClose} title="Fermer">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Filter Bar */}
        <div className="vocab-vault-filter-bar">
          <div className="search-field">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Filtrer par mot, traduction ou racine..."
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
              <span className="tag-filter-label">
                Tags :
              </span>
              <button
                type="button"
                className={`tag-chip-btn ${!selectedTag ? 'active' : ''}`}
                onClick={() => setSelectedTag('')}
              >
                Tous
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tag-chip-btn ${selectedTag === t ? 'active' : ''}`}
                  onClick={() => setSelectedTag(selectedTag === t ? '' : t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content Workspace */}
        <div className={`vocab-vault-workspace layout-${viewLayout}`}>
          {(viewLayout === 'split' || viewLayout === 'graph') && (
            <div className="vault-graph-panel">
              <div className="panel-title-bar">
                <div className="panel-title-left">
                  <Sparkles size={14} className="text-purple" />
                  <h4>Obsidian Graph View</h4>
                </div>
                <span className="panel-hint">
                  Glisse les nœuds, zoome à la molette et clique pour inspecter
                </span>
              </div>

              <div className="graph-embed-container">
                <ObsidianWordGraph
                  words={filteredWords}
                  selectedWordId={selectedWord?.normalized || selectedWord?.word.toLowerCase().trim()}
                  onSelectWord={setSelectedWord}
                />
              </div>
            </div>
          )}

          {(viewLayout === 'split' || viewLayout === 'list') && (
            <div className="vault-list-panel">
              <div className="panel-title-bar">
                <h4>
                  Liste des mots <span className="counter-badge">{filteredWords.length}</span>
                </h4>
              </div>

              <div className="words-table-scroll">
                {filteredWords.length === 0 ? (
                  <div className="empty-vocab-msg">
                    <BookOpen size={28} className="empty-icon" />
                    <p>Aucun mot ne correspond à ta recherche.</p>
                  </div>
                ) : (
                  <div className="words-cards-list">
                    {filteredWords.map((w) => {
                      const isSelected = selectedWord?.id === w.id
                      const kColor = w.knowledge === 6 ? '#16a34a' : (w.knowledge ? KNOWLEDGE_COLORS[w.knowledge - 1] : '#8b5cf6')

                      return (
                        <div
                          key={w.id}
                          className={`vocab-word-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedWord(w)}
                        >
                          <div className="word-item-main">
                            <div className="word-header-line">
                              <strong className="word-title">{w.word}</strong>
                              {w.phonetic && <span className="word-ipa">{renderPhoneticFormatted(w.phonetic)}</span>}
                              <span
                                className="knowledge-indicator-dot"
                                style={{ background: kColor }}
                                title={w.knowledge === 6 ? 'Connu par cœur' : `Niveau de maîtrise : ${w.knowledge ?? 1} / 5`}
                              />
                            </div>

                            {w.translation && <p className="word-translation-text">{w.translation}</p>}

                            {w.parent && (
                              <span className="word-root-badge">Racine : {w.parent}</span>
                            )}

                            {w.contextSentence && (
                              <blockquote className="word-context-quote">
                                « {w.contextSentence} »
                              </blockquote>
                            )}

                            {w.tags && w.tags.length > 0 && (
                              <div className="word-tags-row">
                                {w.tags.map((t) => (
                                  <span key={t} className="word-tag-pill">#{t}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="word-item-actions">
                            <button
                              type="button"
                              className="icon-action-btn"
                              onClick={(e) => handleSpeak(e, w.word)}
                              title="Écouter la prononciation"
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
                              title="Modifier"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="icon-action-btn danger"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(w)
                              }}
                              title="Supprimer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Add / Edit Word Modal Popup matching Reader Word Card */}
        {isAddingNew && (
          <div className="vocab-form-drawer-overlay" onClick={() => setIsAddingNew(false)}>
            <div className="vocab-word-panel-card" onClick={(e) => e.stopPropagation()}>
              <div className="word-panel-top-bar">
                <h3>{editingWord ? 'Modifier le mot' : 'Enregistrer un mot'}</h3>
                <button
                  type="button"
                  className="vault-modal-close-btn"
                  onClick={() => setIsAddingNew(false)}
                  title="Fermer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 1. Knowledge Rating Header (1 to 5 + Known by heart Check) */}
              <div className="wp-field">
                <div className="wp-knowledge">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={formKnowledge === n ? 'kl-btn active' : 'kl-btn'}
                      style={{ ['--kl' as string]: KNOWLEDGE_COLORS[n - 1] }}
                      onClick={() => setFormKnowledge(formKnowledge === n ? undefined : n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={formKnowledge === 6 ? 'kl-btn known active' : 'kl-btn known'}
                    title="Connu par cœur"
                    aria-label="Connu par cœur"
                    onClick={() => setFormKnowledge(formKnowledge === 6 ? undefined : 6)}
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>

              {/* 2. Word Input */}
              <div className="wp-field">
                <span>Mot</span>
                <input
                  type="text"
                  value={formRaw}
                  placeholder="Mot à enregistrer"
                  autoFocus
                  onChange={(e) => setFormRaw(e.target.value)}
                />
              </div>

              {/* 3. Reference Word (Parent / Lemma) */}
              <div className="wp-field">
                <span>Mot de référence</span>
                <input
                  type="text"
                  value={formParent}
                  placeholder="Mot de référence"
                  onChange={(e) => setFormParent(e.target.value)}
                />
              </div>

              {/* 4. Pronunciation */}
              <div className="wp-field">
                <span>Prononciation</span>
                <input
                  type="text"
                  value={formPronunciation}
                  placeholder="Prononciation"
                  onChange={(e) => setFormPronunciation(e.target.value)}
                />
              </div>

              {/* 5. Translation */}
              <div className="wp-field">
                <span>Traduction</span>
                <textarea
                  value={formTranslation}
                  placeholder="Traduction"
                  rows={2}
                  onChange={(e) => setFormTranslation(e.target.value)}
                />
              </div>

              {/* 6. Tags */}
              <div className="wp-field">
                <TagInput
                  allTags={allTags}
                  existingTags={formTags}
                  onAdd={(t) => {
                    const clean = t.trim().replace(/^#/, '')
                    if (clean && !formTags.includes(clean)) {
                      setFormTags([...formTags, clean])
                    }
                  }}
                  onRemove={(t) => setFormTags(formTags.filter((x) => x !== t))}
                  label="Tags"
                />
              </div>

              {/* 7. Save / Delete actions */}
              <div className="wp-footer" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="wp-save-btn-full primary"
                  disabled={!formRaw.trim()}
                  onClick={handleSaveForm}
                >
                  <span className="wp-save-btn-label">
                    {editingWord ? <><Check size={14} /> Enregistrer les modifications</> : <><Plus size={14} /> Enregistrer le mot</>}
                  </span>
                  {formRaw.trim() && <em className="wp-save-btn-word">{formRaw.trim()}</em>}
                </button>

                {editingWord && (
                  <button
                    type="button"
                    className="danger-btn outline"
                    style={{ marginTop: 8, width: '100%', justifyContent: 'center', borderRadius: 8, padding: '7px 12px', fontSize: 12 }}
                    onClick={() => handleDelete(editingWord)}
                  >
                    <Trash2 size={13} />
                    <span>Supprimer ce mot</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
