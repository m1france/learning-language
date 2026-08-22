import React, { useRef, useState } from 'react'
import type { AppState, Difficulty, Resource } from '../domain'
import { BUILTIN_CATEGORIES } from '../domain'
import type { AppCopy } from '../i18n'
import { importFromFile, importFromUrl, paragraphsToResource } from '../importer'
import { generateResourceWithAi } from '../features/resourceAiService'
import {
  X,
  Upload,
  ArrowRight,
  Loader2,
  Sparkles,
  Shuffle,
  Globe,
  FileText,
  PenTool,
  Check,
  AlertCircle,
} from 'lucide-react'

type ImportFormat = 'url' | 'file' | 'text'
type TextMode = 'paste' | 'ai'

export function AddResourceModal({
  t,
  state,
  close,
  onAdd,
  onChange,
}: {
  t: AppCopy
  state: AppState
  close: () => void
  onAdd: (r: Resource) => void
  onChange: (state: AppState) => void
}) {
  const [format, setFormat] = useState<ImportFormat>('text')
  const [textMode, setTextMode] = useState<TextMode>('ai')

  // URL state
  const [url, setUrl] = useState('')

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Text Paste state
  const [pastedTitle, setPastedTitle] = useState('')
  const [pastedText, setPastedText] = useState('')

  // AI Write state
  const [aiPrompt, setAiPrompt] = useState('')
  const [isRandomPrompt, setIsRandomPrompt] = useState(false)
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('intermediate')

  // Common Metadata
  const [difficulty, setDifficulty] = useState<Difficulty | 'auto'>('auto')
  const [category, setCategory] = useState<string>('article')

  // Loading & error state
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const existingCategoriesList = state.customCategories.map((c) => c.id)

  const handleSubmit = async () => {
    setStatus('loading')
    setErrorMessage(null)

    try {
      if (format === 'url') {
        if (!url.trim()) {
          setStatus('idle')
          setErrorMessage('Veuillez saisir une URL valide.')
          return
        }
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
      } else if (format === 'file') {
        if (!selectedFile) {
          setStatus('idle')
          setErrorMessage('Veuillez sélectionner un fichier (.txt, .md, .epub, .pdf).')
          return
        }
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
      } else if (format === 'text') {
        if (textMode === 'ai') {
          // Écrire avec l'IA
          const aiResult = await generateResourceWithAi({
            prompt: isRandomPrompt ? undefined : aiPrompt,
            isRandom: isRandomPrompt,
            difficulty: aiDifficulty,
            language: state.settings.learningLanguage,
            existingCategories: existingCategoriesList,
            api: state.settings.api,
          })

          if (aiResult.ok) {
            const newRes = paragraphsToResource({
              title: aiResult.resourceData.title,
              author: aiResult.resourceData.author,
              paragraphs: aiResult.resourceData.paragraphs,
              language: state.settings.learningLanguage,
              type: aiResult.resourceData.category,
              difficulty: aiResult.resourceData.difficulty,
            })
            onAdd(newRes)
            close()
          } else {
            setStatus('failed')
            setErrorMessage(aiResult.error)
          }
        } else {
          // Coller directement un texte
          const paragraphs = pastedText
            .split(/\n{2,}|\r?\n(?=\S)/)
            .map((p) => p.replace(/\s+/g, ' ').trim())
            .filter((p) => p.length > 1)

          if (!paragraphs.length) {
            setStatus('idle')
            setErrorMessage('Veuillez coller un texte contenant au moins un paragraphe.')
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
    } catch (err) {
      setStatus('failed')
      setErrorMessage(err instanceof Error ? err.message : 'Une erreur inattendue est survenue.')
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

        {/* Dropdown de sélection du format */}
        <div className="add-res-format-section">
          <label className="add-res-field-label">
            <span>Format d’importation</span>
            <div className="add-res-select-wrap">
              <select
                className="add-res-format-dropdown"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as ImportFormat)
                  setErrorMessage(null)
                }}
              >
                <option value="text">📝 Texte & Écriture IA</option>
                <option value="file">📁 Fichiers (.txt, .md, .epub, .pdf)</option>
                <option value="url">🌐 URL de page web</option>
              </select>
            </div>
          </label>
        </div>

        {/* 1. FORMAT TEXTE */}
        {format === 'text' && (
          <div className="add-res-content-pane">
            <div className="add-res-subtabs">
              <button
                type="button"
                className={`add-res-subtab ${textMode === 'ai' ? 'active' : ''}`}
                onClick={() => {
                  setTextMode('ai')
                  setErrorMessage(null)
                }}
              >
                <Sparkles size={14} /> Écrire avec l'IA
              </button>
              <button
                type="button"
                className={`add-res-subtab ${textMode === 'paste' ? 'active' : ''}`}
                onClick={() => {
                  setTextMode('paste')
                  setErrorMessage(null)
                }}
              >
                <PenTool size={14} /> Coller un texte
              </button>
            </div>

            {textMode === 'ai' ? (
              <div className="add-res-ai-form">
                <div className="add-res-prompt-wrap">
                  <label className="add-res-field-label">
                    <span>Instructions ou genre d’histoire</span>
                  </label>
                  <div className={`add-res-prompt-box ${isRandomPrompt ? 'is-random' : ''}`}>
                    <textarea
                      className="add-res-textarea"
                      rows={4}
                      value={isRandomPrompt ? '' : aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      disabled={isRandomPrompt || status === 'loading'}
                      placeholder={
                        isRandomPrompt
                          ? '🎲 Thème aléatoire surprise choisi et rédigé par l’IA !'
                          : 'Décris ce que tu souhaites (ex. Une aventure mystérieuse à Tokyo, une fable philosophique, un article sur l’astronomie, des dialogues du quotidien...)'
                      }
                    />
                    <button
                      type="button"
                      className={`add-res-random-btn ${isRandomPrompt ? 'active' : ''}`}
                      title={
                        isRandomPrompt
                          ? 'Désactiver le thème aléatoire et écrire mes propres consignes'
                          : 'Générer un thème aléatoire surprise'
                      }
                      onClick={() => setIsRandomPrompt((prev) => !prev)}
                    >
                      <Shuffle size={15} />
                      <span className="add-res-random-tooltip">
                        {isRandomPrompt ? 'Thème aléatoire activé' : 'Texte aléatoire'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="add-res-meta-row">
                  <label className="add-res-field-label">
                    <span>Niveau souhaité (l’IA s’y adaptera)</span>
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value as Difficulty)}
                      disabled={status === 'loading'}
                    >
                      <option value="beginner">Débutant (A1 - A2)</option>
                      <option value="intermediate">Intermédiaire (B1 - B2)</option>
                      <option value="advanced">Avancé (C1)</option>
                      <option value="native">Natif (C2)</option>
                    </select>
                  </label>
                </div>

                <p className="add-res-hint">
                  <Sparkles size={13} />
                  <span>La catégorie sera automatiquement attribuée par l’IA selon le style du récit.</span>
                </p>
              </div>
            ) : (
              <div className="add-res-paste-form">
                <label className="add-res-field-label">
                  <span>Titre de la ressource (optionnel)</span>
                  <input
                    type="text"
                    value={pastedTitle}
                    onChange={(e) => setPastedTitle(e.target.value)}
                    placeholder="Mon texte personnel..."
                  />
                </label>

                <label className="add-res-field-label">
                  <span>Contenu du texte</span>
                  <textarea
                    className="add-res-textarea"
                    rows={6}
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
          </div>
        )}

        {/* 2. FORMAT FICHIERS */}
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
              <Upload size={24} />
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

        {/* 3. FORMAT URL */}
        {format === 'url' && (
          <div className="add-res-content-pane">
            <label className="add-res-field-label">
              <span>Lien de l’article ou de l’histoire</span>
              <input
                type="url"
                placeholder="https://example.com/mon-article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSubmit()
                }}
              />
            </label>

            <p className="add-res-hint">
              <Globe size={13} />
              <span>L'IA analyse la page web pour récupérer uniquement le contenu pertinent et éliminer menus, bannières et publicités.</span>
            </p>

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

        {/* Error message display */}
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
                <span>
                  {format === 'text' && textMode === 'ai'
                    ? 'Génération par l’IA en cours…'
                    : 'Importation en cours…'}
                </span>
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
