import React, { useState } from 'react'
import type { AppState, UiLanguage, WritingEntry } from '../../domain'
import { recordWordUsageInWriting, upsertWriting, deleteWriting } from '../../store'
import { type WritingConfig } from './WritingPromptSelector'
import { WritingEditor } from './WritingEditor'

type WritingPageProps = {
  state: AppState
  onChange: (next: AppState) => void
  ui: UiLanguage
  onNavigateToSpeaking?: (text: string) => void
  onDraftStateChange?: (guardState: { hasDraftMoreThan10Words: boolean; saveDraft: () => void } | null) => void
}

const DEFAULT_FREE_CONFIG: WritingConfig = {
  mode: 'free',
  title: 'Mon texte',
  promptWords: [],
}

export function WritingPage({
  state,
  onChange,
  ui,
  onNavigateToSpeaking,
  onDraftStateChange,
}: WritingPageProps) {
  const [activeConfig, setActiveConfig] = useState<WritingConfig>(DEFAULT_FREE_CONFIG)
  const [editingEntry, setEditingEntry] = useState<WritingEntry | undefined>(undefined)

  const handleNewSession = () => {
    setEditingEntry(undefined)
    setActiveConfig(DEFAULT_FREE_CONFIG)
  }

  const handleSelectEntry = (entry: WritingEntry) => {
    setEditingEntry(entry)
    setActiveConfig({
      mode: entry.mode || 'free',
      title: entry.title,
      promptWords: entry.promptWords || [],
      topicId: entry.topicId,
      topicTitle: entry.topicTitle,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSaveEntry = (entry: WritingEntry) => {
    let nextState = upsertWriting(state, entry)
    if (entry.wordsUsed && entry.wordsUsed.length > 0) {
      nextState = recordWordUsageInWriting(
        nextState,
        entry.wordsUsed,
        state.settings.learningLanguage,
      )
    }
    onChange(nextState)
    setEditingEntry(undefined)
    setActiveConfig(DEFAULT_FREE_CONFIG)
  }


  const handleDeleteEntry = (id: string) => {
    onChange(deleteWriting(state, id))
  }

  return (
    <div className="page writing-page-hub">
      <header className="page-header">
        <div>
          <h1>Journaling</h1>
        </div>
      </header>
      <WritingEditor
        key={editingEntry?.id ?? 'new-session'}
        config={activeConfig}
        state={state}
        initialEntry={editingEntry}
        onSave={handleSaveEntry}
        onSelectEntry={handleSelectEntry}
        onDeleteEntry={handleDeleteEntry}
        onNewSession={handleNewSession}
        onNavigateToSpeaking={onNavigateToSpeaking}
        onDraftStateChange={onDraftStateChange}
      />
    </div>
  )
}



