import React, { useState } from 'react'
import type { AppState, UiLanguage, WritingEntry } from '../../domain'
import { recordWordUsageInWriting, upsertWriting, deleteWriting } from '../../store'
import { WritingPromptSelector, type WritingConfig } from './WritingPromptSelector'
import { WritingEditor } from './WritingEditor'
import { WritingHistory } from './WritingHistory'

type WritingPageProps = {
  state: AppState
  onChange: (next: AppState) => void
  ui: UiLanguage
  onNavigateToSpeaking?: (text: string) => void
}

type ViewMode = 'selector' | 'editor' | 'history'

export function WritingPage({
  state,
  onChange,
  ui,
  onNavigateToSpeaking,
}: WritingPageProps) {
  const [view, setView] = useState<ViewMode>('selector')
  const [activeConfig, setActiveConfig] = useState<WritingConfig | null>(null)
  const [editingEntry, setEditingEntry] = useState<WritingEntry | undefined>(undefined)

  const handleStartSession = (config: WritingConfig) => {
    setActiveConfig(config)
    setEditingEntry(undefined)
    setView('editor')
  }

  const handleSelectEntry = (entry: WritingEntry) => {
    setEditingEntry(entry)
    setActiveConfig({
      mode: entry.mode,
      title: entry.title,
      promptWords: entry.promptWords,
      topicId: entry.topicId,
      topicTitle: entry.topicTitle,
    })
    setView('editor')
  }

  const handleSaveEntry = (entry: WritingEntry) => {
    let nextState = upsertWriting(state, entry)
    // Boost knowledge of used words in SRS
    if (entry.wordsUsed && entry.wordsUsed.length > 0) {
      nextState = recordWordUsageInWriting(
        nextState,
        entry.wordsUsed,
        state.settings.learningLanguage,
      )
    }
    onChange(nextState)
  }

  const handleDeleteEntry = (id: string) => {
    onChange(deleteWriting(state, id))
  }

  return (
    <div className="page writing-page-hub">
      {view === 'selector' && (
        <WritingPromptSelector
          state={state}
          onStartSession={handleStartSession}
          onOpenHistory={() => setView('history')}
        />
      )}

      {view === 'editor' && activeConfig && (
        <WritingEditor
          config={activeConfig}
          state={state}
          initialEntry={editingEntry}
          onSave={handleSaveEntry}
          onBack={() => setView('selector')}
          onNavigateToSpeaking={onNavigateToSpeaking}
        />
      )}

      {view === 'history' && (
        <WritingHistory
          state={state}
          onSelectEntry={handleSelectEntry}
          onDeleteEntry={handleDeleteEntry}
          onNewSession={() => setView('selector')}
          onNavigateToSpeaking={onNavigateToSpeaking}
        />
      )}
    </div>
  )
}
