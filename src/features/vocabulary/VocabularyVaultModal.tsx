import React, { useState, useMemo } from 'react'
import type { AppState, Language, LearnedWord, WordRelationType } from '../../domain'
import { ObsidianWordGraph } from './ObsidianWordGraph'
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
  Share2,
  Check,
  Tag,
  Layers,
  Layout,
  Filter,
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

const KNOWLEDGE_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#3b82f6',
  5: '#8b5cf6',
  6: '#10b981',
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

  // Form State
  const [formRaw, setFormRaw] = useState('')
  const [formTranslation, setFormTranslation] = useState('')
  const [formPronunciation, setFormPronunciation] = useState('')
  const [formParent, setFormParent] = useState('')
  const [formRelationType, setFormRelationType] = useState<WordRelationType>('derivative')
  const [formKnowledge, setFormKnowledge] = useState<number>(3)
  const [formSentence, setFormSentence] = useState('')
  const [formTags, setFormTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

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
    setFormRelationType('derivative')
    setFormKnowledge(3)
    setFormSentence('')
    setFormTags([])
    setTagInput('')
    setEditingWord(null)
    setIsAddingNew(true)
  }

  const openEditForm = (word: LearnedWord) => {
    setFormRaw(word.word)
    setFormTranslation(word.translation || '')
    setFormPronunciation(word.phonetic || '')
    setFormParent(word.parent || '')
    setFormRelationType(word.relationType || 'derivative')
    setFormKnowledge(word.knowledge ?? 3)
    setFormSentence(word.contextSentence || '')
    setFormTags(word.tags || [])
    setTagInput('')
    setEditingWord(word)
    setIsAddingNew(true)
  }

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRaw.trim()) return

    onSaveWord({
      raw: formRaw.trim(),
      translation: formTranslation.trim(),
      pronunciation: formPronunciation.trim(),
      parent: formParent.trim() || undefined,
      relationType: formParent.trim() ? formRelationType : undefined,
      knowledge: formKnowledge,
      sentence: formSentence.trim() || undefined,
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

  const handleAddTag = () => {
    const clean = tagInput.trim().replace(/^#/, '')
    if (clean && !formTags.includes(clean)) {
      setFormTags([...formTags, clean])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setFormTags(formTags.filter((t) => t !== tagToRemove))
  }

  return (
    <div className="vocab-vault-backdrop" onClick={onClose}>
      <div className="vocab-vault-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <header className="vocab-vault-header">
          <div className="header-title-box">
            <div className="header-icon-badge">
              <BookOpen size={18} />
            </div>
            <div>
              <h2>Mon Vocabulaire Enregistré</h2>
              <p className="vault-sub">
                {words.length} mots enregistrés · Graphe de connexions lexicales style Obsidian
              </p>
            </div>
          </div>

          <div className="vault-top-actions">
            {/* View Mode Switcher */}
            <div className="segmented-sm">
              <button
                type="button"
                className={viewLayout === 'split' ? 'active' : ''}
                onClick={() => setViewLayout('split')}
                title="Vue Mixte (Graphe & Liste)"
              >
                <Layout size={13} />
                <span>Mixte</span>
              </button>
              <button
                type="button"
                className={viewLayout === 'graph' ? 'active' : ''}
                onClick={() => setViewLayout('graph')}
                title="Graphe Obsidian seul"
              >
                <Sparkles size={13} />
                <span>Graphe</span>
              </button>
              <button
                type="button"
                className={viewLayout === 'list' ? 'active' : ''}
                onClick={() => setViewLayout('list')}
                title="Liste seule"
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

            <button type="button" className="close-btn" onClick={onClose} title="Fermer">
              <X size={18} />
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
                <Tag size={12} /> Tags :
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
          {/* Obsidian Graph Encart (shown in split and graph mode) */}
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
                  words={words}
                  selectedWordId={selectedWord?.normalized || selectedWord?.word.toLowerCase().trim()}
                  onSelectWord={(w) => {
                    setSelectedWord(w)
                    if (viewLayout === 'split') {
                      // auto scroll to word if in list
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Words List Panel (shown in split and list mode) */}
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
                      const kColor = KNOWLEDGE_COLORS[w.knowledge ?? 1] || '#8b5cf6'

                      return (
                        <div
                          key={w.id}
                          className={`vocab-word-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedWord(w)}
                        >
                          <div className="word-item-main">
                            <div className="word-header-line">
                              <strong className="word-title">{w.word}</strong>
                              {w.phonetic && <span className="word-ipa">[{w.phonetic}]</span>}
                              <span
                                className="knowledge-indicator-dot"
                                style={{ background: kColor }}
                                title={`Niveau de maîtrise : ${w.knowledge ?? 1} / 5`}
                              />
                            </div>

                            {w.translation && (
                              <p className="word-translation-text">{w.translation}</p>
                            )}

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
                                  <span key={t} className="tag-pill-sm">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="word-item-actions">
                            <button
                              type="button"
                              className={`action-btn-sm ${speakingWord === w.word ? 'playing' : ''}`}
                              onClick={(e) => void handleSpeak(e, w.word)}
                              title="Prononciation"
                            >
                              <Volume2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="action-btn-sm"
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
                              className="action-btn-sm delete"
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

        {/* Add / Edit Word Modal Form Drawer */}
        {isAddingNew && (
          <div className="vocab-form-drawer-overlay" onClick={() => setIsAddingNew(false)}>
            <div className="vocab-form-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="drawer-header">
                <h3>{editingWord ? 'Modifier le mot' : 'Ajouter un mot au vocabulaire'}</h3>
                <button className="close-btn" onClick={() => setIsAddingNew(false)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveForm} className="drawer-form">
                <div className="form-group">
                  <label>Mot dans la langue apprise *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Ex: ubiquitous, wanderlust..."
                    value={formRaw}
                    onChange={(e) => setFormRaw(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Traduction française *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: omniprésent, soif de voyage..."
                    value={formTranslation}
                    onChange={(e) => setFormTranslation(e.target.value)}
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Prononciation / API</label>
                    <input
                      type="text"
                      placeholder="Ex: /juːˈbɪk.wə.təs/"
                      value={formPronunciation}
                      onChange={(e) => setFormPronunciation(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Niveau de maîtrise (1 à 6)</label>
                    <select
                      value={formKnowledge}
                      onChange={(e) => setFormKnowledge(Number(e.target.value))}
                    >
                      <option value={1}>1 - Nouveau / Découvert</option>
                      <option value={2}>2 - Reconnaissance vague</option>
                      <option value={3}>3 - Compréhension passive</option>
                      <option value={4}>4 - Usage spontané</option>
                      <option value={5}>5 - Maîtrise parfaite</option>
                      <option value={6}>6 - Connu par cœur</option>
                    </select>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Mot racine / Famille lexicale</label>
                    <input
                      type="text"
                      placeholder="Ex: notice, act, joy..."
                      value={formParent}
                      onChange={(e) => setFormParent(e.target.value)}
                    />
                  </div>

                  {formParent && (
                    <div className="form-group">
                      <label>Type de relation</label>
                      <select
                        value={formRelationType}
                        onChange={(e) => setFormRelationType(e.target.value as WordRelationType)}
                      >
                        <option value="derivative">Dérivé morphologique</option>
                        <option value="compound">Mot composé</option>
                        <option value="expression">Expression liée</option>
                        <option value="synonym">Synonyme</option>
                        <option value="antonym">Antonyme</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Phrase d'exemple / Contexte</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Smartphones have become ubiquitous in modern society."
                    value={formSentence}
                    onChange={(e) => setFormSentence(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Tags & Catégories</label>
                  <div className="tags-input-box">
                    <div className="tags-chips-list">
                      {formTags.map((t) => (
                        <span key={t} className="tag-edit-chip">
                          #{t}
                          <button type="button" onClick={() => handleRemoveTag(t)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="tag-input-row">
                      <input
                        type="text"
                        placeholder="Nouveau tag (Appuyer sur Entrée)..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddTag()
                          }
                        }}
                      />
                      <button type="button" className="outline btn-xs" onClick={handleAddTag}>
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                <div className="drawer-footer">
                  {editingWord && (
                    <button
                      type="button"
                      className="danger-btn outline"
                      onClick={() => handleDelete(editingWord)}
                    >
                      <Trash2 size={14} />
                      <span>Supprimer</span>
                    </button>
                  )}
                  <div className="footer-right">
                    <button
                      type="button"
                      className="outline"
                      onClick={() => setIsAddingNew(false)}
                    >
                      Annuler
                    </button>
                    <button type="submit" className="primary">
                      <Check size={14} />
                      <span>{editingWord ? 'Enregistrer les modifications' : 'Ajouter le mot'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
