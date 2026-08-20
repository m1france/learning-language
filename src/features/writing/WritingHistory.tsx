import React, { useMemo, useState } from 'react'
import type { AppState, WritingEntry } from '../../domain'
import {
  BookOpen,
  Search,
  Trash2,
  Edit2,
  Video,
  Clock,
  Check,
  Plus,
  ArrowLeft,
  Calendar,
  Sparkles,
  FileText,
} from 'lucide-react'

type WritingHistoryProps = {
  state: AppState
  onSelectEntry: (entry: WritingEntry) => void
  onDeleteEntry: (id: string) => void
  onNewSession: () => void
  onNavigateToSpeaking?: (text: string) => void
}

export function WritingHistory({
  state,
  onSelectEntry,
  onDeleteEntry,
  onNewSession,
  onNavigateToSpeaking,
}: WritingHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModeFilter, setSelectedModeFilter] = useState<string>('all')

  const writings = state.writings ?? []

  // Global metrics
  const stats = useMemo(() => {
    const totalWritings = writings.length
    const totalWords = writings.reduce((sum, w) => sum + (w.wordCount || 0), 0)
    const totalWordsUsed = writings.reduce((sum, w) => sum + (w.wordsUsed?.length || 0), 0)
    return { totalWritings, totalWords, totalWordsUsed }
  }, [writings])

  // Filtered entries
  const filtered = useMemo(() => {
    return writings.filter((entry) => {
      const matchesSearch =
        !searchQuery.trim() ||
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.promptWords?.some((pw) => pw.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesMode =
        selectedModeFilter === 'all' || entry.mode === selectedModeFilter

      return matchesSearch && matchesMode
    })
  }, [writings, searchQuery, selectedModeFilter])

  return (
    <div className="writing-history-view">
      {/* Top Header */}
      <div className="history-head">
        <div className="head-title-block">
          <button type="button" className="outline icon-btn" onClick={onNewSession} title="Retour">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1>Mes Écrits & Archives</h1>
            <p className="subhead">Consulte, modifie et transforme tes textes rédigés en sessions orales.</p>
          </div>
        </div>

        <button type="button" className="primary new-session-btn" onClick={onNewSession}>
          <Plus size={16} />
          <span>Nouvelle Rédaction</span>
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="history-metrics-bar">
        <div className="metric-card">
          <FileText size={18} className="metric-icon coral" />
          <div className="metric-meta">
            <strong>{stats.totalWritings}</strong>
            <span>Textes rédigés</span>
          </div>
        </div>

        <div className="metric-card">
          <Sparkles size={18} className="metric-icon gold" />
          <div className="metric-meta">
            <strong>{stats.totalWords}</strong>
            <span>Mots écrits au total</span>
          </div>
        </div>

        <div className="metric-card">
          <Check size={18} className="metric-icon green" />
          <div className="metric-meta">
            <strong>{stats.totalWordsUsed}</strong>
            <span>Mots cibles activés</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="history-search-bar">
        <div className="search-input-wrap">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Rechercher par titre, contenu ou mot cible..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="segmented-sm">
          <button
            type="button"
            className={selectedModeFilter === 'all' ? 'active' : ''}
            onClick={() => setSelectedModeFilter('all')}
          >
            Tous
          </button>
          <button
            type="button"
            className={selectedModeFilter === 'reactivation' ? 'active' : ''}
            onClick={() => setSelectedModeFilter('reactivation')}
          >
            Réactivation
          </button>
          <button
            type="button"
            className={selectedModeFilter === 'guided' ? 'active' : ''}
            onClick={() => setSelectedModeFilter('guided')}
          >
            Journaling
          </button>
          <button
            type="button"
            className={selectedModeFilter === 'sprint' ? 'active' : ''}
            onClick={() => setSelectedModeFilter('sprint')}
          >
            Sprint
          </button>
          <button
            type="button"
            className={selectedModeFilter === 'free' ? 'active' : ''}
            onClick={() => setSelectedModeFilter('free')}
          >
            Essai Libre
          </button>
        </div>
      </div>

      {/* Writings Cards Grid */}
      {filtered.length === 0 ? (
        <div className="empty-history-state">
          <BookOpen size={40} className="empty-icon" />
          <h3>Aucun écrit trouvé</h3>
          <p>
            {writings.length === 0
              ? "Tu n'as pas encore enregistré de texte. Lance ta première session d'écriture !"
              : 'Aucun texte ne correspond à ta recherche.'}
          </p>
          <button type="button" className="primary" onClick={onNewSession}>
            <Plus size={16} />
            <span>Commencer une session</span>
          </button>
        </div>
      ) : (
        <div className="writings-cards-grid">
          {filtered.map((entry) => (
            <article key={entry.id} className="writing-history-card">
              <div className="card-top-row">
                <div className="card-badge-row">
                  <span className={`mode-badge ${entry.mode}`}>
                    {entry.mode === 'reactivation'
                      ? 'Réactivation'
                      : entry.mode === 'guided'
                      ? 'Journaling'
                      : entry.mode === 'sprint'
                      ? 'Sprint'
                      : 'Essai Libre'}
                  </span>
                  <span className="card-date">
                    <Calendar size={12} /> {entry.date}
                  </span>
                </div>

                <div className="card-actions">
                  {onNavigateToSpeaking && entry.content.trim() && (
                    <button
                      type="button"
                      className="card-action-btn"
                      onClick={() => onNavigateToSpeaking(entry.content)}
                      title="Pratiquer au prompteur face caméra"
                    >
                      <Video size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="card-action-btn"
                    onClick={() => onSelectEntry(entry)}
                    title="Modifier ce texte"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    className="card-action-btn danger"
                    onClick={() => onDeleteEntry(entry.id)}
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <h3 className="card-title" onClick={() => onSelectEntry(entry)}>
                {entry.title}
              </h3>

              <p className="card-excerpt">{entry.content.slice(0, 180)}...</p>

              {/* Target Words Chips */}
              {entry.promptWords && entry.promptWords.length > 0 && (
                <div className="card-words-row">
                  {entry.promptWords.map((pw) => {
                    const isUsed = entry.wordsUsed?.includes(pw)
                    return (
                      <span
                        key={pw}
                        className={`mini-word-chip ${isUsed ? 'used' : 'missed'}`}
                      >
                        {isUsed && <Check size={10} />}
                        {pw}
                      </span>
                    )
                  })}
                </div>
              )}

              <div className="card-footer">
                <span>{entry.wordCount || 0} mots</span>
                <span>·</span>
                <span>
                  {entry.wordsUsed?.length || 0}/{entry.promptWords?.length || 0} cibles placées
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
