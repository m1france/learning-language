import React, { useRef, useState } from 'react'
import type { AppState, Difficulty, Resource, UiLanguage } from '../domain'
import { BUILTIN_CATEGORIES } from '../domain'
import type { AppCopy } from '../i18n'
import { resourcesCopy } from '../i18n'
import { importFromFile, importFromUrl, paragraphsToResource } from '../importer'
import { generateResourceWithAi, type StoryLength } from '../features/resourceAiService'
import {
  X,
  Upload,
  ArrowRight,
  Loader2,
  Shuffle,
  AlertCircle,
} from 'lucide-react'

type ImportFormat = 'ai' | 'text' | 'file' | 'url'

export function AddResourceModal({
  t,
  state,
  ui = 'fr',
  close,
  onAdd,
  onAiTaskChange,
}: {
  t: AppCopy
  state: AppState
  ui?: UiLanguage
  close: () => void
  onAdd: (r: Resource) => void
  onChange?: (state: AppState) => void
  onAiTaskChange?: (running: boolean) => void
}) {
  const resT = resourcesCopy[ui] || resourcesCopy.fr
  const [format, setFormat] = useState<ImportFormat>('ai')

  // AI Story generation state
  const [aiPrompt, setAiPrompt] = useState('')
  const [isRandomPrompt, setIsRandomPrompt] = useState(false)
  const [aiLength, setAiLength] = useState<StoryLength>('medium')
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('intermediate')

  // Text Paste state
  const [pastedTitle, setPastedTitle] = useState('')
  const [pastedText, setPastedText] = useState('')

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // URL state
  const [url, setUrl] = useState('')

  // Common Metadata for manual formats
  const [difficulty, setDifficulty] = useState<Difficulty | 'auto'>('auto')
  const [category, setCategory] = useState<string>('article')

  // Status for synchronous actions (file, paste, url)
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const existingCategoriesList = state.customCategories.map((c) => c.id)

  const handleSubmit = async () => {
    setErrorMessage(null)

    if (format === 'ai') {
      const promptToRun = isRandomPrompt ? undefined : aiPrompt
      const isRandom = isRandomPrompt
      const difficultyToRun = aiDifficulty
      const lengthToRun = aiLength
      const languageToRun = state.settings.learningLanguage
      const apiSettings = state.settings.api

      close()
      onAiTaskChange?.(true)

      void (async () => {
        try {
          const aiResult = await generateResourceWithAi({
            prompt: promptToRun,
            isRandom,
            difficulty: difficultyToRun,
            length: lengthToRun,
            language: languageToRun,
            existingCategories: existingCategoriesList,
            api: apiSettings,
          })

          if (aiResult.ok) {
            const newRes = paragraphsToResource({
              title: aiResult.resourceData.title,
              author: aiResult.resourceData.author,
              paragraphs: aiResult.resourceData.paragraphs,
              language: languageToRun,
              type: aiResult.resourceData.category,
              difficulty: aiResult.resourceData.difficulty,
              coverImage: aiResult.resourceData.coverImage,
              isAiGenerated: true,
            })
            onAdd(newRes)
          } else {
            console.error('[AddResourceModal] AI generation failed:', aiResult.error)
          }
        } catch (err) {
          console.error('[AddResourceModal] Unexpected error in background generation:', err)
        } finally {
          onAiTaskChange?.(false)
        }
      })()

      return
    }

    if (format === 'text') {
      const text = pastedText.trim()
      if (!text) {
        setErrorMessage(resT.importError)
        return
      }

      setStatus('loading')
      try {
        const title = pastedTitle.trim() || text.slice(0, 40).replace(/\n/g, ' ') + '...'
        const res = paragraphsToResource({
          title,
          author: state.settings.name || 'Moi',
          paragraphs: text.split(/\n+/).map((p) => p.trim()).filter(Boolean),
          language: state.settings.learningLanguage,
          type: category,
          difficulty: difficulty === 'auto' ? 'intermediate' : difficulty,
        })
        onAdd(res)
        close()
      } catch (err: any) {
        setErrorMessage(err.message || resT.importError)
        setStatus('failed')
      }
      return
    }

    if (format === 'file') {
      if (!selectedFile) {
        setErrorMessage(resT.pickFile)
        return
      }

      setStatus('loading')
      try {
        const result = await importFromFile(selectedFile, state.settings.learningLanguage, {
          difficulty: difficulty === 'auto' ? undefined : difficulty,
          type: category,
        })
        if (result.ok) {
          onAdd(result.resource)
          close()
        } else {
          setErrorMessage(resT.importError)
          setStatus('failed')
        }
      } catch (err: any) {
        setErrorMessage(err.message || resT.importError)
        setStatus('failed')
      }
      return
    }

    if (format === 'url') {
      if (!url.trim()) {
        setErrorMessage(resT.importError)
        return
      }

      setStatus('loading')
      try {
        const result = await importFromUrl(url.trim(), state.settings.learningLanguage, {
          difficulty: difficulty === 'auto' ? undefined : difficulty,
          type: category,
          api: state.settings.api,
        })
        if (result.ok) {
          onAdd(result.resource)
          close()
        } else {
          setErrorMessage(resT.importError)
          setStatus('failed')
        }
      } catch (err: any) {
        setErrorMessage(err.message || resT.importError)
        setStatus('failed')
      }
    }
  }

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setErrorMessage(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="add-resource-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label={resT.cancelBtn}>
          <X size={18} />
        </button>

        <header className="add-res-header">
          <h2 className="add-res-title">{resT.addResourceTitle}</h2>
        </header>

        {/* Sélection du format sous forme de dropdown épuré */}
        <div className="add-res-format-section">
          <label className="add-res-field-label">
            <span>{resT.formatLabel}</span>
            <div className="add-res-select-wrap">
              <select
                className="add-res-format-dropdown"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as ImportFormat)
                  setErrorMessage(null)
                }}
              >
                <option value="ai">{resT.formatAi}</option>
                <option value="text">{resT.formatText}</option>
                <option value="file">{resT.formatFile}</option>
                <option value="url">{resT.formatUrl}</option>
              </select>
            </div>
          </label>
        </div>

        {/* 1. FORMAT GENERATION IA */}
        {format === 'ai' && (
          <div className="add-res-content-pane">
            <div className="add-res-prompt-wrap">
              <label className="add-res-field-label">
                <span>{resT.aiPromptLabel}</span>
              </label>
              <div className={`add-res-prompt-box ${isRandomPrompt ? 'is-random' : ''}`}>
                <textarea
                  className="add-res-textarea"
                  rows={3}
                  value={isRandomPrompt ? '' : aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  disabled={isRandomPrompt}
                  placeholder={
                    isRandomPrompt
                      ? resT.aiRandomPromptDesc
                      : resT.aiPromptPlaceholder
                  }
                />
                <button
                  type="button"
                  className={`add-res-random-btn ${isRandomPrompt ? 'active' : ''}`}
                  title={
                    isRandomPrompt
                      ? resT.disableRandomPrompt
                      : resT.enableRandomPrompt
                  }
                  onClick={() => setIsRandomPrompt((prev) => !prev)}
                >
                  <Shuffle size={14} />
                </button>
              </div>
            </div>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>{resT.lengthLabel}</span>
                <select
                  value={aiLength}
                  onChange={(e) => setAiLength(e.target.value as StoryLength)}
                >
                  <option value="short">{resT.lengthShort}</option>
                  <option value="medium">{resT.lengthMedium}</option>
                  <option value="long">{resT.lengthLong}</option>
                  <option value="novel">{resT.lengthNovel}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{resT.levelLabel}</span>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as Difficulty)}
                >
                  <option value="beginner">{resT.levelBeginner}</option>
                  <option value="intermediate">{resT.levelIntermediate}</option>
                  <option value="advanced">{resT.levelAdvanced}</option>
                  <option value="native">{resT.levelNative}</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* 2. FORMAT TEXTE / COLLER */}
        {format === 'text' && (
          <div className="add-res-content-pane">
            <label className="add-res-field-label">
              <span>{resT.titleOptional}</span>
              <input
                type="text"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
                placeholder={resT.titlePlaceholder}
              />
            </label>

            <label className="add-res-field-label">
              <span>{resT.contentLabel}</span>
              <textarea
                className="add-res-textarea"
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={resT.contentPlaceholder}
              />
            </label>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>{resT.difficultyLabel}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'auto')}
                >
                  <option value="auto">{resT.auto}</option>
                  <option value="beginner">{resT.levelBeginner}</option>
                  <option value="intermediate">{resT.levelIntermediate}</option>
                  <option value="advanced">{resT.levelAdvanced}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{resT.categoryLabel}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((catId) => (
                    <option value={catId} key={catId}>
                      {resT.categories[catId] ?? catId}
                    </option>
                  ))}
                  {state.customCategories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* 3. FORMAT FICHIERS */}
        {format === 'file' && (
          <div className="add-res-content-pane">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.epub,.pdf,text/plain"
              hidden
              onChange={handleFilePicked}
            />

            <button
              type="button"
              className={`add-res-dropzone ${selectedFile ? 'has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={22} />
              <strong>{selectedFile ? selectedFile.name : resT.pickFile}</strong>
              <small>{selectedFile ? `${Math.round(selectedFile.size / 1024)} Ko` : '.txt, .md, .epub, .pdf'}</small>
            </button>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>{resT.difficultyLabel}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'auto')}
                >
                  <option value="auto">{resT.auto}</option>
                  <option value="beginner">{resT.levelBeginner}</option>
                  <option value="intermediate">{resT.levelIntermediate}</option>
                  <option value="advanced">{resT.levelAdvanced}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{resT.categoryLabel}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((catId) => (
                    <option value={catId} key={catId}>
                      {resT.categories[catId] ?? catId}
                    </option>
                  ))}
                  {state.customCategories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* 4. FORMAT URL */}
        {format === 'url' && (
          <div className="add-res-content-pane">
            <label className="add-res-field-label">
              <span>URL</span>
              <input
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSubmit()
                }}
              />
            </label>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>{resT.difficultyLabel}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'auto')}
                >
                  <option value="auto">{resT.auto}</option>
                  <option value="beginner">{resT.levelBeginner}</option>
                  <option value="intermediate">{resT.levelIntermediate}</option>
                  <option value="advanced">{resT.levelAdvanced}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{resT.categoryLabel}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((catId) => (
                    <option value={catId} key={catId}>
                      {resT.categories[catId] ?? catId}
                    </option>
                  ))}
                  {state.customCategories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="add-res-error-badge">
            <AlertCircle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Actions footer */}
        <footer className="add-res-footer">
          <button
            type="button"
            className="primary full add-res-submit-btn"
            disabled={status === 'loading'}
            onClick={() => void handleSubmit()}
          >
            {status === 'loading' ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>{resT.importing}</span>
              </>
            ) : (
              <>
                <span>{resT.createResourceBtn}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
