import { useEffect, useMemo, useRef, useState } from 'react'
import './writing.css'

/** A word saved from the reader deck and available to use while writing. */
export type LearnedWord = {
  id: string
  word: string
  definition?: string
  translation?: string
  partOfSpeech?: string
  sourceTitle?: string
  addedAt?: string
}

export type WritingStatus = 'draft' | 'published'

/**
 * The deliberately small persistence shape used by the writing studio.  The
 * application store can add fields without affecting this component.
 */
export type WritingRecord = {
  id: string
  title?: string
  content?: string
  /** `body` is accepted to make importing older stored drafts painless. */
  body?: string
  status?: WritingStatus
  createdAt?: string
  updatedAt?: string
  author?: string
  wordIds?: string[]
  coSignCount?: number
  coSignedByMe?: boolean
}

export type WritingInput = {
  id: string
  title: string
  content: string
  status: WritingStatus
  wordIds: string[]
  createdAt: string
  updatedAt: string
}

export type WritingProps = {
  learnedWords: LearnedWord[]
  writings: WritingRecord[]
  onSaveWriting: (writing: WritingInput) => void | Promise<void>
  onPublish: (writing: WritingInput) => void | Promise<void>
  onCosign: (writingId: string) => void | Promise<void>
  userName?: string
  locale?: 'fr' | 'en'
}

const labels = {
  fr: {
    eyebrow: 'ÉCRIRE · AUJOURD’HUI',
    title: 'Le Mur des Mots',
    subtitle: 'Écris une petite scène avec les mots que tu as choisi de garder.',
    words: 'Tes mots en apprentissage',
    emptyDeck: 'Ton deck est encore vide. Ajoute des mots depuis un texte et ils apparaîtront ici.',
    insert: 'Insérer',
    placeholder: 'Commence là où tu en es…',
    save: 'Enregistrer le brouillon',
    publish: 'Publier sur le Mur',
    saved: 'Brouillon enregistré.',
    published: 'Publié sur le Mur.',
    saveError: 'Impossible d’enregistrer pour le moment. Réessaie dans un instant.',
    publishError: 'Impossible de publier pour le moment. Réessaie dans un instant.',
    needText: 'Écris quelques mots avant de l’enregistrer.',
    wordCount: 'mots',
    target: 'mots du deck utilisés',
    nudgeEyebrow: 'UN PETIT ÉLAN',
    nudgeTitle: 'Il n’y a pas de première phrase parfaite.',
    nudgeText: 'Laisse les mots rejoindre un souvenir, une opinion ou un détail de ta journée.',
    drafts: 'Brouillons récents',
    newDraft: 'Nouveau brouillon',
    wallEyebrow: 'LE MUR · AUJOURD’HUI',
    wallTitle: 'Des mots qui deviennent à toi.',
    emptyWall: 'Quand tu publieras, ton texte apparaîtra ici — avec les mots qui l’ont fait vivre.',
    cosign: 'Co-signer',
    cosigned: 'Co-signé',
    used: 'utilisé',
    usedPlural: 'utilisés',
    noDrafts: 'Aucun brouillon pour le moment.',
    statusDraft: 'Brouillon',
    statusPublished: 'Publié',
  },
  en: {
    eyebrow: 'WRITE · TODAY',
    title: 'The Word Wall',
    subtitle: 'Write a small scene with the words you chose to keep.',
    words: 'Your living words',
    emptyDeck: 'Your deck is empty for now. Add words from a text and they will show up here.',
    insert: 'Insert',
    placeholder: 'Start wherever you are…',
    save: 'Save draft',
    publish: 'Publish to the Wall',
    saved: 'Draft saved.',
    published: 'Published to the Wall.',
    saveError: 'We could not save that just now. Please try again.',
    publishError: 'We could not publish that just now. Please try again.',
    needText: 'Write a few words before saving.',
    wordCount: 'words',
    target: 'deck words used',
    nudgeEyebrow: 'A GENTLE NUDGE',
    nudgeTitle: 'There is no perfect first line.',
    nudgeText: 'Let the words meet a memory, an opinion, or a small piece of today.',
    drafts: 'Recent drafts',
    newDraft: 'New draft',
    wallEyebrow: 'THE WALL · TODAY',
    wallTitle: 'Words becoming yours.',
    emptyWall: 'When you publish, your text will appear here — with the words that made it live.',
    cosign: 'Co-sign',
    cosigned: 'Co-signed',
    used: 'used',
    usedPlural: 'used',
    noDrafts: 'No drafts yet.',
    statusDraft: 'Draft',
    statusPublished: 'Published',
  },
} as const

type Notice = { tone: 'success' | 'error'; message: string } | null

const contentOf = (writing: WritingRecord) => writing.content ?? writing.body ?? ''
const isPublished = (writing: WritingRecord) => writing.status === 'published'

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsWord(text: string, word: string) {
  const trimmed = word.trim()
  if (!trimmed) return false
  const escaped = escapeForRegExp(trimmed)
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

function titleFrom(content: string, fallback: string) {
  const firstLine = content.split(/\n/).find((line) => line.trim())?.trim() || fallback
  return firstLine.length > 62 ? `${firstLine.slice(0, 59).trimEnd()}…` : firstLine
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `writing-${crypto.randomUUID()}`
  return `writing-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatDate(value: string | undefined, locale: 'fr' | 'en') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }).format(date)
}

/**
 * The writing studio intentionally owns only its editor state.  Persistence
 * and the shared deck remain with the parent application through callbacks.
 */
export function Writing({
  learnedWords,
  writings,
  onSaveWriting,
  onPublish,
  onCosign,
  userName = 'Mathis',
  locale = 'fr',
}: WritingProps) {
  const t = labels[locale]
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<WritingStatus | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [localPublished, setLocalPublished] = useState<WritingRecord | null>(null)
  const [optimisticCosigns, setOptimisticCosigns] = useState<Record<string, boolean>>({})

  const drafts = useMemo(
    () => writings.filter((writing) => !isPublished(writing)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [writings],
  )
  const usedWords = useMemo(
    () => learnedWords.filter((word) => containsWord(text, word.word)),
    [learnedWords, text],
  )
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const target = Math.min(5, learnedWords.length)
  const published = useMemo(() => {
    const remote = writings.filter(isPublished)
    if (localPublished && !remote.some((writing) => writing.id === localPublished.id)) return [localPublished, ...remote]
    return remote
  }, [localPublished, writings])

  useEffect(() => {
    if (activeId && writings.some((writing) => writing.id === activeId)) return
    if (!activeId && drafts[0]) openWriting(drafts[0])
    // Loading the first saved draft improves return visits; it deliberately does
    // not overwrite an unsaved editor once the user has started one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, drafts])

  function openWriting(writing: WritingRecord) {
    setActiveId(writing.id)
    setCreatedAt(writing.createdAt ?? new Date().toISOString())
    setText(contentOf(writing))
    setNotice(null)
  }

  function startNewDraft() {
    setActiveId(null)
    setCreatedAt(null)
    setText('')
    setNotice(null)
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  function insertWord(word: string) {
    const textarea = editorRef.current
    if (!textarea) {
      setText((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}${word} `)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = text.slice(0, start)
    const after = text.slice(end)
    const leadingSpace = before && !/\s$/.test(before) ? ' ' : ''
    const trailingSpace = after && !/^\s/.test(after) ? ' ' : ''
    const insertion = `${leadingSpace}${word}${trailingSpace}`
    setText(`${before}${insertion}${after}`)
    requestAnimationFrame(() => {
      textarea.focus()
      const caret = start + insertion.length
      textarea.setSelectionRange(caret, caret)
    })
  }

  function writingPayload(status: WritingStatus): WritingInput {
    const now = new Date().toISOString()
    return {
      id: activeId ?? makeId(),
      title: titleFrom(text, locale === 'fr' ? 'Sans titre' : 'Untitled'),
      content: text.trim(),
      status,
      wordIds: usedWords.map((word) => word.id),
      createdAt: createdAt ?? now,
      updatedAt: now,
    }
  }

  async function save(status: WritingStatus) {
    if (!text.trim()) {
      setNotice({ tone: 'error', message: t.needText })
      return
    }

    const payload = writingPayload(status)
    setBusy(status)
    setNotice(null)
    try {
      if (status === 'published') await onPublish(payload)
      else await onSaveWriting(payload)
      setActiveId(payload.id)
      setCreatedAt(payload.createdAt)
      if (status === 'published') {
        setLocalPublished({ ...payload, author: userName, coSignCount: 0, coSignedByMe: false })
      }
      setNotice({ tone: 'success', message: status === 'published' ? t.published : t.saved })
    } catch {
      setNotice({ tone: 'error', message: status === 'published' ? t.publishError : t.saveError })
    } finally {
      setBusy(null)
    }
  }

  async function cosign(writing: WritingRecord) {
    if (writing.coSignedByMe || optimisticCosigns[writing.id]) return
    setOptimisticCosigns((current) => ({ ...current, [writing.id]: true }))
    try {
      await onCosign(writing.id)
    } catch {
      setOptimisticCosigns((current) => ({ ...current, [writing.id]: false }))
      setNotice({ tone: 'error', message: locale === 'fr' ? 'Le co-signature n’a pas pu être enregistrée.' : 'We could not save your co-sign just now.' })
    }
  }

  return (
    <div className="page writing-page writing-v2">
      <header className="page-header writing-v2__header">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="subhead">{t.subtitle}</p>
        </div>
        <button className="outline writing-v2__new" onClick={startNewDraft} type="button">＋ {t.newDraft}</button>
      </header>

      <section className="writing-v2__words" aria-labelledby="writing-words-heading">
        <div className="writing-v2__section-heading">
          <div>
            <p className="eyebrow">{t.words.toUpperCase()}</p>
            <h2 id="writing-words-heading">{learnedWords.length} {locale === 'fr' ? 'mot' : 'word'}{learnedWords.length !== 1 ? 's' : ''}</h2>
          </div>
          <span className="writing-v2__used-count">{usedWords.length} {usedWords.length === 1 ? t.used : t.usedPlural}</span>
        </div>
        {learnedWords.length ? (
          <div className="writing-v2__word-list">
            {learnedWords.map((word, index) => {
              const isUsed = usedWords.some((item) => item.id === word.id)
              return <button className={`writing-v2__word ${isUsed ? 'is-used' : ''}`} key={word.id} onClick={() => insertWord(word.word)} type="button" title={`${t.insert}: ${word.word}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{word.word}</strong>
                {word.definition && <small>{word.definition}</small>}
                <i aria-hidden="true">{isUsed ? '✓' : '+'}</i>
              </button>
            })}
          </div>
        ) : <p className="writing-v2__empty-deck">{t.emptyDeck}</p>}
      </section>

      <section className="writing-v2__workspace">
        <div className="writing-v2__editor">
          <label className="sr-only" htmlFor="writing-editor">{t.title}</label>
          <textarea id="writing-editor" ref={editorRef} value={text} onChange={(event) => setText(event.target.value)} placeholder={t.placeholder} />
          <footer>
            <span>{wordCount} {t.wordCount}</span>
            <strong>{usedWords.length}/{target} {t.target}</strong>
          </footer>
        </div>

        <aside className="writing-v2__actions">
          <p className="eyebrow">{t.nudgeEyebrow}</p>
          <h2>{t.nudgeTitle}</h2>
          <p>{t.nudgeText}</p>
          <button className="outline full" disabled={busy !== null} onClick={() => void save('draft')} type="button">{busy === 'draft' ? '…' : t.save}</button>
          <button className="primary full" disabled={busy !== null || !text.trim()} onClick={() => void save('published')} type="button">{busy === 'published' ? '…' : t.publish} <span>→</span></button>
          {notice && <p className={`writing-v2__notice ${notice.tone}`} role="status">{notice.tone === 'success' ? '✓ ' : '!' }{notice.message}</p>}
        </aside>
      </section>

      <section className="writing-v2__drafts" aria-labelledby="writing-drafts-heading">
        <div className="writing-v2__section-heading">
          <div><p className="eyebrow">{t.drafts.toUpperCase()}</p><h2 id="writing-drafts-heading">{t.drafts}</h2></div>
        </div>
        {drafts.length ? <div className="writing-v2__draft-list">{drafts.slice(0, 4).map((draft) => <button className={draft.id === activeId ? 'is-active' : ''} onClick={() => openWriting(draft)} key={draft.id} type="button"><span>{t.statusDraft}</span><strong>{draft.title || titleFrom(contentOf(draft), locale === 'fr' ? 'Sans titre' : 'Untitled')}</strong><small>{formatDate(draft.updatedAt || draft.createdAt, locale)}</small></button>)}</div> : <p className="writing-v2__no-drafts">{t.noDrafts}</p>}
      </section>

      <section className="writing-v2__wall" aria-labelledby="word-wall-heading">
        <p className="eyebrow">{t.wallEyebrow}</p>
        <h2 id="word-wall-heading">{t.wallTitle}</h2>
        {published.length ? <div className="writing-v2__wall-list">{published.slice(0, 4).map((post) => {
          const signed = post.coSignedByMe || optimisticCosigns[post.id]
          const signCount = (post.coSignCount ?? 0) + (optimisticCosigns[post.id] && !post.coSignedByMe ? 1 : 0)
          return <article key={post.id}>
            <div className="writing-v2__post-meta"><span>{post.author || userName}</span><small>{formatDate(post.updatedAt || post.createdAt, locale)}</small></div>
            <h3>{post.title || titleFrom(contentOf(post), locale === 'fr' ? 'Sans titre' : 'Untitled')}</h3>
            <p>{contentOf(post)}</p>
            <button className={signed ? 'is-cosigned' : ''} onClick={() => void cosign(post)} type="button" aria-pressed={signed}>{signed ? '✓ ' : '♡ '}{signed ? t.cosigned : t.cosign} <span>{signCount}</span></button>
          </article>
        })}</div> : <p className="writing-v2__empty-wall">{t.emptyWall}</p>}
      </section>
    </div>
  )
}

export default Writing
