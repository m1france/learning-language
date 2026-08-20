import React, { useMemo, useState } from 'react'
import type { AppState, LearnedWord, Resource, WritingMode } from '../../domain'
import { GLOBAL_CATEGORIES, type GlobalTopicCategory, type NicheTopic } from '../speaking/speakingTopics'
import { prompts as defaultPrompts } from '../../data'
import {
  Sparkles,
  Zap,
  BookOpen,
  PenTool,
  Target,
  Compass,
  Clock,
  Shuffle,
  ChevronRight,
  Filter,
  Check,
  Tag,
  ArrowRight,
  RotateCcw,
} from 'lucide-react'

export type WritingConfig = {
  mode: WritingMode
  title: string
  promptWords: string[]
  topicId?: string
  topicTitle?: string
  sprintDurationMinutes?: number
  resourceId?: string
}

type WritingPromptSelectorProps = {
  state: AppState
  onStartSession: (config: WritingConfig) => void
  onOpenHistory: () => void
}

export function WritingPromptSelector({
  state,
  onStartSession,
  onOpenHistory,
}: WritingPromptSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<WritingMode>('reactivation')
  
  // Reactivation Mode Filters
  const [wordCount, setWordCount] = useState<number>(5)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'due' | 'resource' | 'tag'>('all')
  const [selectedResourceId, setSelectedResourceId] = useState<string>('')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [customSelectedWords, setCustomSelectedWords] = useState<string[]>([])
  
  // Guided Mode Topic Selection
  const [selectedCategory, setSelectedCategory] = useState<GlobalTopicCategory>(GLOBAL_CATEGORIES[0])
  const [selectedTopic, setSelectedTopic] = useState<NicheTopic>(GLOBAL_CATEGORIES[0].subtopics[0])

  // Sprint Mode Duration
  const [sprintMinutes, setSprintMinutes] = useState<number>(5)

  // Free Mode Title
  const [freeTitle, setFreeTitle] = useState<string>('')

  // Filter available words from state
  const learningLang = state.settings.learningLanguage
  const allSavedWords = useMemo(
    () => (state.words ?? []).filter((w) => w.language === learningLang),
    [state.words, learningLang],
  )

  const tagsList = useMemo(() => {
    const set = new Set<string>()
    allSavedWords.forEach((w) => w.tags?.forEach((t) => set.add(t)))
    return Array.from(set)
  }, [allSavedWords])

  // Filter words according to chosen filter
  const filteredWordsPool = useMemo(() => {
    if (sourceFilter === 'due') {
      const today = new Date().toISOString().slice(0, 10)
      const due = allSavedWords.filter((w) => !w.nextReview || w.nextReview <= today || (w.knowledge ?? 1) <= 3)
      return due.length > 0 ? due : allSavedWords
    }
    if (sourceFilter === 'resource' && selectedResourceId) {
      return allSavedWords.filter((w) => w.sourceResourceId === selectedResourceId)
    }
    if (sourceFilter === 'tag' && selectedTag) {
      return allSavedWords.filter((w) => w.tags?.includes(selectedTag))
    }
    return allSavedWords
  }, [allSavedWords, sourceFilter, selectedResourceId, selectedTag])

  // Pick N random words from the pool
  const pickWords = (count: number, pool: LearnedWord[]): string[] => {
    if (!pool.length) {
      // Fallback to default prompts if user hasn't saved words yet
      return defaultPrompts.slice(0, count)
    }
    const shuffled = [...pool].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((w) => w.word)
  }

  // Shuffle or initialize words
  const [activeWords, setActiveWords] = useState<string[]>(() => pickWords(5, allSavedWords))

  const handleShuffleWords = () => {
    setActiveWords(pickWords(wordCount, filteredWordsPool))
  }

  // Update words when wordCount or filter changes
  const handleCountChange = (count: number) => {
    setWordCount(count)
    setActiveWords(pickWords(count, filteredWordsPool))
  }

  const handleFilterChange = (filter: 'all' | 'due' | 'resource' | 'tag') => {
    setSourceFilter(filter)
    const newPool = filter === 'due' 
      ? allSavedWords.filter((w) => (w.knowledge ?? 1) <= 3)
      : allSavedWords
    setActiveWords(pickWords(wordCount, newPool))
  }

  const handleStart = () => {
    if (selectedMode === 'reactivation') {
      const wordsToUse = customSelectedWords.length > 0 ? customSelectedWords : activeWords
      onStartSession({
        mode: 'reactivation',
        title: `Défi Vocabulaire (${wordsToUse.length} mots)`,
        promptWords: wordsToUse,
        resourceId: selectedResourceId || undefined,
      })
    } else if (selectedMode === 'guided') {
      const topicWords = pickWords(4, allSavedWords)
      onStartSession({
        mode: 'guided',
        title: learningLang === 'fr' ? selectedTopic.title : selectedTopic.titleEn,
        promptWords: topicWords,
        topicId: selectedTopic.id,
        topicTitle: learningLang === 'fr' ? selectedTopic.title : selectedTopic.titleEn,
      })
    } else if (selectedMode === 'sprint') {
      const bonusWords = pickWords(3, allSavedWords)
      onStartSession({
        mode: 'sprint',
        title: `Sprint Écriture · ${sprintMinutes} min`,
        promptWords: bonusWords,
        sprintDurationMinutes: sprintMinutes,
      })
    } else {
      // Free essay
      onStartSession({
        mode: 'free',
        title: freeTitle.trim() || 'Essai Libre',
        promptWords: [],
      })
    }
  }

  return (
    <div className="writing-prompt-selector">
      {/* Top Header */}
      <div className="selector-hero">
        <div className="selector-hero-text">
          <p className="eyebrow">
            <PenTool size={14} /> ATELIER D'ÉCRITURE & PRODUCTION ACTIVE
          </p>
          <h1>Choisis ton mode d'écriture</h1>
          <p className="subhead">
            Transforme ton vocabulaire passif en réflexes spontanés par l'écriture ciblée et le journaling.
          </p>
        </div>
        <button className="history-link-btn" onClick={onOpenHistory}>
          <BookOpen size={16} />
          <span>Mes Écrits & Archives ({(state.writings ?? []).length})</span>
        </button>
      </div>

      {/* Mode Navigation Cards */}
      <div className="writing-modes-grid">
        {/* Mode 1: Réactivation */}
        <button
          type="button"
          className={`writing-mode-card ${selectedMode === 'reactivation' ? 'active' : ''}`}
          onClick={() => setSelectedMode('reactivation')}
        >
          <div className="mode-icon-badge coral">
            <Target size={20} />
          </div>
          <div className="mode-meta">
            <h3>Atelier de Réactivation</h3>
            <p>Intègre 3 à 10 mots enregistrés dans une histoire ou un texte cohérent.</p>
          </div>
          <div className="mode-tag">Idéal SRS & Rétention</div>
        </button>

        {/* Mode 2: Journaling Guidé */}
        <button
          type="button"
          className={`writing-mode-card ${selectedMode === 'guided' ? 'active' : ''}`}
          onClick={() => setSelectedMode('guided')}
        >
          <div className="mode-icon-badge gold">
            <Compass size={20} />
          </div>
          <div className="mode-meta">
            <h3>Journaling & Thématiques</h3>
            <p>Réponds à des questions structurées connectées aux sujets du studio vocal.</p>
          </div>
          <div className="mode-tag">Idéal Expression</div>
        </button>

        {/* Mode 3: Sprint Contre-la-Montre */}
        <button
          type="button"
          className={`writing-mode-card ${selectedMode === 'sprint' ? 'active' : ''}`}
          onClick={() => setSelectedMode('sprint')}
        >
          <div className="mode-icon-badge blue">
            <Zap size={20} />
          </div>
          <div className="mode-meta">
            <h3>Sprint d'Écriture</h3>
            <p>Écris sans t'arrêter pendant 3 à 10 min pour débloquer la pensée directe.</p>
          </div>
          <div className="mode-tag">Fluidité & Vitesse</div>
        </button>

        {/* Mode 4: Essai Libre */}
        <button
          type="button"
          className={`writing-mode-card ${selectedMode === 'free' ? 'active' : ''}`}
          onClick={() => setSelectedMode('free')}
        >
          <div className="mode-icon-badge green">
            <PenTool size={20} />
          </div>
          <div className="mode-meta">
            <h3>Essai Libre & Notes</h3>
            <p>Page blanche avec statistiques de mots et tiroir de vocabulaire à portée de main.</p>
          </div>
          <div className="mode-tag">Liberté Totale</div>
        </button>
      </div>

      {/* Mode Configuration Workspace */}
      <div className="mode-config-panel">
        {/* CONFIG 1: RÉACTIVATION */}
        {selectedMode === 'reactivation' && (
          <div className="config-reactivation">
            <div className="config-row-head">
              <div>
                <h4>Personnaliser le défi de vocabulaire</h4>
                <p>
                  {allSavedWords.length > 0
                    ? `${allSavedWords.length} mots disponibles dans ton coffre de vocabulaire.`
                    : 'Aucun mot enregistré pour le moment. Quelques mots recommandés ont été sélectionnés.'}
                </p>
              </div>
              <button
                type="button"
                className="outline shuffle-btn"
                onClick={handleShuffleWords}
                title="Tirer de nouveaux mots au sort"
              >
                <Shuffle size={14} />
                <span>Mélanger</span>
              </button>
            </div>

            {/* Filter selectors */}
            <div className="filters-bar">
              <div className="filter-group">
                <span className="filter-label">Nombre de mots :</span>
                <div className="segmented-sm">
                  {[3, 5, 8, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={wordCount === n ? 'active' : ''}
                      onClick={() => handleCountChange(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Source des mots :</span>
                <div className="segmented-sm">
                  <button
                    type="button"
                    className={sourceFilter === 'all' ? 'active' : ''}
                    onClick={() => handleFilterChange('all')}
                  >
                    Tous
                  </button>
                  <button
                    type="button"
                    className={sourceFilter === 'due' ? 'active' : ''}
                    onClick={() => handleFilterChange('due')}
                    title="Mots récemment découverts ou à réviser"
                  >
                    À réviser (SRS)
                  </button>
                  {state.resources.length > 0 && (
                    <button
                      type="button"
                      className={sourceFilter === 'resource' ? 'active' : ''}
                      onClick={() => handleFilterChange('resource')}
                    >
                      Par Livre / Texte
                    </button>
                  )}
                  {tagsList.length > 0 && (
                    <button
                      type="button"
                      className={sourceFilter === 'tag' ? 'active' : ''}
                      onClick={() => handleFilterChange('tag')}
                    >
                      Par Tag
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sub-filters if resource or tag chosen */}
            {sourceFilter === 'resource' && (
              <div className="subfilter-row">
                <label>Sélectionner le texte source :</label>
                <select
                  value={selectedResourceId}
                  onChange={(e) => {
                    setSelectedResourceId(e.target.value)
                    const pool = allSavedWords.filter((w) => w.sourceResourceId === e.target.value)
                    setActiveWords(pickWords(wordCount, pool.length ? pool : allSavedWords))
                  }}
                >
                  <option value="">-- Choisir une ressource --</option>
                  {state.resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sourceFilter === 'tag' && (
              <div className="subfilter-row">
                <label>Sélectionner le tag :</label>
                <select
                  value={selectedTag}
                  onChange={(e) => {
                    setSelectedTag(e.target.value)
                    const pool = allSavedWords.filter((w) => w.tags?.includes(e.target.value))
                    setActiveWords(pickWords(wordCount, pool.length ? pool : allSavedWords))
                  }}
                >
                  <option value="">-- Choisir un tag --</option>
                  {tagsList.map((tag) => (
                    <option key={tag} value={tag}>
                      #{tag}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Live Words Preview */}
            <div className="words-preview-tray">
              <span className="tray-title">Mots sélectionnés pour cette session :</span>
              <div className="tray-chips">
                {activeWords.map((word, i) => {
                  const item = allSavedWords.find((w) => w.word.toLowerCase() === word.toLowerCase())
                  return (
                    <div key={`${word}-${i}`} className="tray-chip">
                      <span className="tray-chip-num">{i + 1}</span>
                      <strong>{word}</strong>
                      {item?.translation && <small>({item.translation})</small>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* CONFIG 2: GUIDED JOURNALING */}
        {selectedMode === 'guided' && (
          <div className="config-guided">
            <h4>Choisir un thème de réflexion</h4>
            <p>Ces thèmes sont synchronisés avec le studio de parole face caméra.</p>

            {/* Category tabs */}
            <div className="topic-categories-row">
              {GLOBAL_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`topic-cat-btn ${selectedCategory.id === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategory(cat)
                    setSelectedTopic(cat.subtopics[0])
                  }}
                >
                  <span className="cat-icon">{cat.icon}</span>
                  <span>{learningLang === 'fr' ? cat.title : cat.titleEn}</span>
                </button>
              ))}
            </div>

            {/* Subtopics list */}
            <div className="subtopics-cards-grid">
              {selectedCategory.subtopics.map((sub) => {
                const isCurrent = selectedTopic.id === sub.id
                return (
                  <div
                    key={sub.id}
                    className={`subtopic-card ${isCurrent ? 'selected' : ''}`}
                    onClick={() => setSelectedTopic(sub)}
                  >
                    <div className="subtopic-card-top">
                      <span className="badge-pill">{sub.badge}</span>
                      {isCurrent && <Check size={14} className="check-mark" />}
                    </div>
                    <h5>{learningLang === 'fr' ? sub.title : sub.titleEn}</h5>
                    <ul className="subtopic-angles">
                      {(learningLang === 'fr' ? sub.angles : sub.anglesEn).slice(0, 2).map((a, i) => (
                        <li key={i}>• {a}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* CONFIG 3: SPRINT */}
        {selectedMode === 'sprint' && (
          <div className="config-sprint">
            <h4>Durée du sprint contre-la-montre</h4>
            <p>
              Pendant le sprint, un chronomètre tourne. L'objectif est d'écrire en continu sans
              t'autocensurer ni hésiter.
            </p>
            <div className="sprint-duration-buttons">
              {[3, 5, 10].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`sprint-time-btn ${sprintMinutes === mins ? 'active' : ''}`}
                  onClick={() => setSprintMinutes(mins)}
                >
                  <Clock size={20} />
                  <strong>{mins} minutes</strong>
                  <span>{mins === 3 ? 'Échauffement' : mins === 5 ? 'Rythme standard' : 'Immersion profonde'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CONFIG 4: ESSAI LIBRE */}
        {selectedMode === 'free' && (
          <div className="config-free">
            <h4>Titre ou sujet de ta rédaction (facultatif)</h4>
            <input
              type="text"
              className="free-title-input"
              placeholder="Ex: Mes réflexions sur l'architecture, Résumé de lecture..."
              value={freeTitle}
              onChange={(e) => setFreeTitle(e.target.value)}
            />
          </div>
        )}

        {/* Launch Button */}
        <div className="config-footer">
          <button type="button" className="primary large launch-btn" onClick={handleStart}>
            <span>Commencer la session</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
