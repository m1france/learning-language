import React from 'react'
import type { AppState, WritingMode } from '../../domain'
import { BookOpen, PenTool, Target, Zap, ArrowRight } from 'lucide-react'

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
  onSelectMode: (mode: WritingMode) => void
  onOpenHistory: () => void
}

export function WritingPromptSelector({
  state,
  onSelectMode,
  onOpenHistory,
}: WritingPromptSelectorProps) {
  const writingsCount = (state.writings ?? []).length

  return (
    <div className="writing-prompt-selector-centered">
      {/* Top Header */}
      <div className="selector-hero centered-hero">
        <div className="selector-hero-text">
          <h1>Choisis ton mode d'écriture</h1>
          <p className="subhead">
            Pratique ton expression écrite avec des défis de vocabulaire, des sprints ou en liberté totale.
          </p>
        </div>
        <button className="history-link-btn" onClick={onOpenHistory} type="button">
          <BookOpen size={16} />
          <span>Mon journal ({writingsCount})</span>
        </button>
      </div>

      {/* Centered 3 Modes Grid */}
      <div className="writing-modes-grid-centered">
        {/* Mode 1: Étudier les mots appris */}
        <button
          type="button"
          className="writing-mode-card mode-interactive-card"
          onClick={() => onSelectMode('reactivation')}
        >
          <div className="mode-card-top">
            <div className="mode-icon-badge coral">
              <Target size={22} />
            </div>
          </div>
          <div className="mode-meta">
            <h3>Étudier les mots appris</h3>
            <p>Intègre 3 à 10 mots enregistrés dans une histoire ou un texte cohérent.</p>
          </div>
          <div className="mode-card-footer">
            <span>Configurer & Écrire</span>
            <ArrowRight size={15} />
          </div>
        </button>

        {/* Mode 2: Chronométré */}
        <button
          type="button"
          className="writing-mode-card mode-interactive-card"
          onClick={() => onSelectMode('sprint')}
        >
          <div className="mode-card-top">
            <div className="mode-icon-badge blue">
              <Zap size={22} />
            </div>
          </div>
          <div className="mode-meta">
            <h3>Chronométré</h3>
            <p>Écris sans t'arrêter pendant 3 à 10 min pour débloquer la pensée directe.</p>
          </div>
          <div className="mode-card-footer">
            <span>Configurer & Écrire</span>
            <ArrowRight size={15} />
          </div>
        </button>

        {/* Mode 3: Écriture libre */}
        <button
          type="button"
          className="writing-mode-card mode-interactive-card"
          onClick={() => onSelectMode('free')}
        >
          <div className="mode-card-top">
            <div className="mode-icon-badge green">
              <PenTool size={22} />
            </div>
          </div>
          <div className="mode-meta">
            <h3>Écriture libre</h3>
            <p>Page blanche avec statistiques de mots et tiroir de connecteurs à portée de main.</p>
          </div>
          <div className="mode-card-footer">
            <span>Ouvrir l'éditeur</span>
            <ArrowRight size={15} />
          </div>
        </button>
      </div>
    </div>
  )
}
