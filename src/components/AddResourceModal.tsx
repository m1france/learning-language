import React, { useRef, useState } from 'react'
import type { AppState, Difficulty, Resource } from '../domain'
import { BUILTIN_CATEGORIES } from '../domain'
import type { AppCopy } from '../i18n'
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
  close,
  onAdd,
  onAiTaskChange,
}: {
  t: AppCopy
  state: AppState
  close: () => void
  onAdd: (r: Resource) => void
  onChange?: (state: AppState) => void
  onAiTaskChange?: (running: boolean) => void
}) {
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
      // 1. GENERATION IA : Quitter la popup immédiatement et exécuter en arrière-plan
      const promptToRun = isRandomPrompt ? undefined : aiPrompt
      const isRandom = isRandomPrompt
      const difficultyToRun = aiDifficulty
      const lengthToRun = aiLength
      const languageToRun = state.settings.learningLanguage
      const apiSettings = state.settings.api

      close()
      onAiTaskChange?.(true)

      // Exécution en tâche de fond
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
            console.error('[AddResourceModal] Erreur IA:', aiResult.error)
          }
        } catch (err) {
          console.error('[AddResourceModal] Erreur de génération:', err)
        } finally {
          onAiTaskChange?.(false)
        }
      })()
      return
    }

    if (format === 'url') {
      if (!url.trim()) {
        setErrorMessage('Veuillez saisir une URL.')
        return
      }
      setStatus('loading')
      onAiTaskChange?.(true)
      try {
        const result = await importFromUrl(url.trim(), state.settings.learningLanguage, {
          type: category,
          difficulty: difficulty === 'auto' ? undefined : difficulty,
          api: state.settings.api,
          customCategories: existingCategoriesList,
        })
        if (result.ok) {
          onAdd(result.resource)
          close()
        } else {
          setStatus('failed')
          setErrorMessage(t.importError)
        }
      } catch (err) {
        setStatus('failed')
        setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de l’importation.')
      } finally {
        onAiTaskChange?.(false)
      }
      return
    }

    if (format === 'file') {
      if (!selectedFile) {
        setErrorMessage('Veuillez sélectionner un fichier.')
        return
      }
      setStatus('loading')
      try {
        const result = await importFromFile(selectedFile, state.settings.learningLanguage, {
          type: category,
          difficulty: difficulty === 'auto' ? undefined : difficulty,
        })
        if (result.ok) {
          onAdd(result.resource)
          close()
        } else {
          setStatus('failed')
          setErrorMessage('Impossible de lire le fichier sélectionné.')
        }
      } catch (err) {
        setStatus('failed')
        setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de la lecture du fichier.')
      }
      return
    }

    if (format === 'text') {
      const paragraphs = pastedText
        .split(/\n{2,}|\r?\n(?=\S)/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 1)

      if (!paragraphs.length) {
        setErrorMessage('Veuillez saisir ou coller un texte.')
        return
      }

      const newRes = paragraphsToResource({
        title: pastedTitle.trim() || t.pastedTitle,
        paragraphs,
        language: state.settings.learningLanguage,
        type: category,
        difficulty: difficulty === 'auto' ? undefined : difficulty,
      })
      onAdd(newRes)
      close()
    }
  }

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setSelectedFile(f)
      setErrorMessage(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="add-resource-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Fermer">
          <X size={18} />
        </button>

        <header className="add-res-header">
          <h2 className="add-res-title">Ajoute une nouvelle ressource</h2>
        </header>

        {/* Sélection du format sous forme de dropdown épuré */}
        <div className="add-res-format-section">
          <label className="add-res-field-label">
            <span>Format</span>
            <div className="add-res-select-wrap">
              <select
                className="add-res-format-dropdown"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as ImportFormat)
                  setErrorMessage(null)
                }}
              >
                <option value="ai">Génération IA</option>
                <option value="text">Coller un texte</option>
                <option value="file">Fichiers (.txt, .md, .epub, .pdf)</option>
                <option value="url">URL</option>
              </select>
            </div>
          </label>
        </div>

        {/* 1. FORMAT GENERATION IA */}
        {format === 'ai' && (
          <div className="add-res-content-pane">
            <div className="add-res-prompt-wrap">
              <label className="add-res-field-label">
                <span>Sujet / Consignes</span>
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
                      ? 'Thème aléatoire surprise choisi par l’IA.'
                      : 'Instructions ou sujet du texte...'
                  }
                />
                <button
                  type="button"
                  className={`add-res-random-btn ${isRandomPrompt ? 'active' : ''}`}
                  title={
                    isRandomPrompt
                      ? 'Désactiver le thème aléatoire'
                      : 'Générer un thème aléatoire'
                  }
                  onClick={() => setIsRandomPrompt((prev) => !prev)}
                >
                  <Shuffle size={14} />
                </button>
              </div>
            </div>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>Longueur</span>
                <select
                  value={aiLength}
                  onChange={(e) => setAiLength(e.target.value as StoryLength)}
                >
                  <option value="short">Histoire courte (~3 pages)</option>
                  <option value="medium">Histoire moyenne (~7 pages)</option>
                  <option value="long">Histoire longue (~15 pages)</option>
                  <option value="novel">Roman (+30 pages)</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>Niveau</span>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as Difficulty)}
                >
                  <option value="beginner">Débutant (A1 - A2)</option>
                  <option value="intermediate">Intermédiaire (B1 - B2)</option>
                  <option value="advanced">Avancé (C1)</option>
                  <option value="native">Natif (C2)</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* 2. FORMAT TEXTE / COLLER */}
        {format === 'text' && (
          <div className="add-res-content-pane">
            <label className="add-res-field-label">
              <span>Titre (optionnel)</span>
              <input
                type="text"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
                placeholder="Mon texte..."
              />
            </label>

            <label className="add-res-field-label">
              <span>Contenu</span>
              <textarea
                className="add-res-textarea"
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Colle ton texte ici..."
              />
            </label>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>{t.difficultyLabel}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'auto')}
                >
                  <option value="auto">{t.auto}</option>
                  <option value="beginner">{t.difficulty.beginner}</option>
                  <option value="intermediate">{t.difficulty.intermediate}</option>
                  <option value="advanced">{t.difficulty.advanced}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{t.categoryLabel}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((catId) => (
                    <option value={catId} key={catId}>
                      {t.categories[catId] ?? catId}
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
              <strong>{selectedFile ? selectedFile.name : t.pickFile}</strong>
              <small>{selectedFile ? `${Math.round(selectedFile.size / 1024)} Ko` : '.txt, .md, .epub, .pdf'}</small>
            </button>

            <div className="add-res-meta-row">
              <label className="add-res-field-label">
                <span>{t.difficultyLabel}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'auto')}
                >
                  <option value="auto">{t.auto}</option>
                  <option value="beginner">{t.difficulty.beginner}</option>
                  <option value="intermediate">{t.difficulty.intermediate}</option>
                  <option value="advanced">{t.difficulty.advanced}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{t.categoryLabel}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((catId) => (
                    <option value={catId} key={catId}>
                      {t.categories[catId] ?? catId}
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
                <span>{t.difficultyLabel}</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | 'auto')}
                >
                  <option value="auto">{t.auto}</option>
                  <option value="beginner">{t.difficulty.beginner}</option>
                  <option value="intermediate">{t.difficulty.intermediate}</option>
                  <option value="advanced">{t.difficulty.advanced}</option>
                </select>
              </label>

              <label className="add-res-field-label">
                <span>{t.categoryLabel}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((catId) => (
                    <option value={catId} key={catId}>
                      {t.categories[catId] ?? catId}
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
                <span>Importation en cours…</span>
              </>
            ) : (
              <>
                <span>Créer la ressource</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
