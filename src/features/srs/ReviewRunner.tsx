import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, Ear, Eye, Headphones, PenLine, Undo2, Volume2, X } from 'lucide-react'
import type { AppState, LearnedWord, ReviewMode, UiLanguage } from '../../domain'
import { speak } from '../../ai'
import { learnCopy } from '../../i18n'
import { renderPhoneticFormatted } from '../vocabulary/phoneticUtils'
import { type Rating, RATINGS, dayKey, formatInterval } from './fsrs'
import {
  type ReviewUndo,
  applyReview,
  isNewCard,
  learningSettings,
  meaningOf,
  newLogId,
  pickReviewMode,
  previewAll,
  schedulerOptions,
  undoReview,
  updateWordFields,
} from './srsStore'
import { type AnswerCheck, checkAnswer, splitAroundWord } from './reviewHelpers'

export type ReviewSummary = {
  reviewed: number
  correct: number
  again: number
  newLearned: number
  seconds: number
  /** Words answered "À revoir" or "Difficile" at least once. */
  struggledIds: string[]
}

type HistoryItem = { queue: string[]; summary: ReviewSummary; undo?: ReviewUndo; restoreWord?: LearnedWord }

const EMPTY_SUMMARY: ReviewSummary = { reviewed: 0, correct: 0, again: 0, newLearned: 0, seconds: 0, struggledIds: [] }

const MODE_ICONS: Record<ReviewMode, React.ReactNode> = {
  recognition: <Eye size={13} />,
  recall: <PenLine size={13} />,
  listening: <Ear size={13} />,
}

/**
 * Runs through a queue of vocabulary cards. Each answer is saved immediately
 * (so leaving midway loses nothing); "À revoir" puts the card back a few
 * positions later, like Anki's learning steps.
 */
export function ReviewRunner({
  state,
  wordIds,
  ui,
  practice = false,
  onChange,
  onExit,
  onComplete,
}: {
  state: AppState
  wordIds: string[]
  ui: UiLanguage
  /** Free practice: answers never touch the schedule. */
  practice?: boolean
  onChange: (update: (prev: AppState) => AppState) => void
  onExit: (summary: ReviewSummary) => void
  onComplete: (summary: ReviewSummary) => void
}) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const [queue, setQueue] = useState<string[]>(() => wordIds.filter((wordId) => state.words.some((word) => word.id === wordId)))
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<AnswerCheck | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [summary, setSummary] = useState<ReviewSummary>(EMPTY_SUMMARY)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [presentation, setPresentation] = useState(0)
  const startedAt = useRef(Date.now())
  const cardStartedAt = useRef(Date.now())
  const completed = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const word = state.words.find((item) => item.id === queue[0])
  // The card's presentation is chosen once per appearance, not on every render.
  const mode = useMemo<ReviewMode>(
    () => (word ? pickReviewMode(word, settings.reviewMode) : 'recognition'),
    [word?.id, presentation], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const wantsTyping = settings.typeAnswer && mode !== 'recognition'
  const withSeconds = (current: ReviewSummary) => ({ ...current, seconds: Math.round((Date.now() - startedAt.current) / 1000) })

  // A word deleted elsewhere simply leaves the queue.
  useEffect(() => {
    if (queue.length && !word) setQueue((current) => current.slice(1))
  }, [queue, word])

  useEffect(() => {
    if (queue.length === 0 && !completed.current) {
      completed.current = true
      onComplete(withSeconds(summary))
    }
  }, [queue.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const playWord = () => { if (word) void speak(word.word, word.language, state.settings.api) }
  const playSentence = () => { if (word?.contextSentence) void speak(word.contextSentence, word.language, state.settings.api) }

  // Autoplay: the word is heard on the front when recognising or listening, on the back when recalling.
  useEffect(() => {
    if (!word || !settings.autoPlayAudio) return
    const onFront = mode === 'recognition' || mode === 'listening'
    if (revealed !== onFront) playWord()
  }, [presentation, revealed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wantsTyping && !revealed) inputRef.current?.focus()
  }, [presentation, wantsTyping, revealed])

  const previews = useMemo(
    () => (word && revealed ? previewAll(word.srs, new Date(), schedulerOptions(settings, word.id)) : null),
    [word, revealed], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const suggested: Rating = check === 'wrong' ? 1 : check === 'close' ? 2 : 3

  const nextCard = () => {
    setRevealed(false)
    setTyped('')
    setCheck(null)
    setEditing(null)
    setPresentation((value) => value + 1)
    cardStartedAt.current = Date.now()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  const reveal = () => {
    if (!word || revealed) return
    if (wantsTyping && typed.trim()) setCheck(checkAnswer(typed, word))
    else if (wantsTyping) setCheck('wrong')
    setRevealed(true)
    inputRef.current?.blur()
  }

  const grade = (rating: Rating) => {
    if (!word || !revealed) return
    const now = new Date()
    const wasNew = isNewCard(word)
    let undo: ReviewUndo | undefined
    if (!practice) {
      const logId = newLogId()
      undo = { word, logId, day: dayKey(now), wasNew, wasCorrect: rating > 1 }
      const durationMs = Date.now() - cardStartedAt.current
      onChange((prev) => applyReview(prev, { wordId: word.id, rating, mode, durationMs, now, logId }))
    }
    setHistory((items) => [...items, { queue, summary, undo }])
    const rest = queue.slice(1)
    if (rating === 1) {
      const position = Math.min(3, rest.length)
      setQueue([...rest.slice(0, position), word.id, ...rest.slice(position)])
    } else {
      setQueue(rest)
    }
    setSummary((current) => ({
      ...current,
      reviewed: current.reviewed + 1,
      correct: current.correct + (rating > 1 ? 1 : 0),
      again: current.again + (rating === 1 ? 1 : 0),
      newLearned: current.newLearned + (wasNew && !practice ? 1 : 0),
      struggledIds: rating <= 2 && !current.struggledIds.includes(word.id) ? [...current.struggledIds, word.id] : current.struggledIds,
    }))
    nextCard()
  }

  const undoLast = () => {
    const last = history[history.length - 1]
    if (!last) return
    if (last.undo) onChange((prev) => undoReview(prev, last.undo!))
    if (last.restoreWord) {
      const restored = last.restoreWord
      onChange((prev) => ({ ...prev, words: prev.words.map((item) => (item.id === restored.id ? restored : item)) }))
    }
    setQueue(last.queue)
    setSummary(last.summary)
    setHistory((items) => items.slice(0, -1))
    nextCard()
  }

  const markKnown = () => {
    if (!word) return
    setHistory((items) => [...items, { queue, summary, restoreWord: word }])
    onChange((prev) => updateWordFields(prev, word.id, { knowledge: 6 }))
    setQueue((current) => current.filter((item) => item !== word.id))
    nextCard()
  }

  const saveTranslation = () => {
    if (!word || editing === null) return
    const translation = editing.trim()
    onChange((prev) => updateWordFields(prev, word.id, { translation }))
    setEditing(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (inField || editing !== null) return
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') { event.preventDefault(); undoLast(); return }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (!revealed && (key === ' ' || key === 'enter')) { event.preventDefault(); reveal(); return }
      if (revealed && ['1', '2', '3', '4'].includes(key)) { event.preventDefault(); grade(Number(key) as Rating); return }
      if (revealed && (key === ' ' || key === 'enter')) { event.preventDefault(); grade(suggested); return }
      if (key === 'z') undoLast()
      else if (key === 'p') playWord()
      else if (key === 'escape') onExit(withSeconds(summary))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const uniqueLeft = [...new Set(queue)].map((wordId) => state.words.find((item) => item.id === wordId)).filter(Boolean) as LearnedWord[]
  const newLeft = uniqueLeft.filter(isNewCard).length
  const learningLeft = uniqueLeft.filter((item) => item.srs?.state === 'learning' || item.srs?.state === 'relearning').length
  const reviewLeft = uniqueLeft.length - newLeft - learningLeft
  const progress = summary.reviewed + queue.length > 0 ? (summary.reviewed / (summary.reviewed + queue.length)) * 100 : 100

  if (!word) return <div className="rv-runner" />

  const meaning = meaningOf(word)
  const parts = splitAroundWord(word.contextSentence, word, word.language)
  const hasTarget = parts.some((part) => part.target)
  const source = state.resources.find((resource) => resource.id === word.sourceResourceId)
  const cardState = word.srs?.state ?? 'new'
  const prompt = mode === 'recognition' ? c.promptRecognition : mode === 'recall' ? c.promptRecall : c.promptListening

  const sentence = (blank: boolean) => parts.length > 0 && (
    <p className="rv-sentence">
      {parts.map((part, index) => part.target
        ? <mark key={index} className={blank ? 'rv-blank' : undefined}>{blank ? ' '.repeat(2) + '_'.repeat(Math.max(4, part.text.length)) + ' '.repeat(2) : part.text}</mark>
        : <React.Fragment key={index}>{part.text}</React.Fragment>)}
    </p>
  )

  const translationBlock = (
    <div className="rv-meaning-row">
      {editing !== null ? (
        <form className="rv-edit" onSubmit={(event) => { event.preventDefault(); saveTranslation() }}>
          <input autoFocus value={editing} onChange={(event) => setEditing(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(null) } }} />
          <button type="submit" className="primary small">{c.save}</button>
          <button type="button" className="text-button" onClick={() => setEditing(null)}>{c.cancel}</button>
        </form>
      ) : (
        <>
          <p className={meaning ? 'rv-translation' : 'rv-translation empty'}>{meaning || c.noTranslation}</p>
          <button type="button" className="rv-icon-btn small" title={c.editTranslation} aria-label={c.editTranslation} onClick={() => setEditing(meaning)}>
            <PenLine size={14} />
          </button>
        </>
      )}
    </div>
  )

  const wordHeading = (
    <div className="rv-word-row">
      <h2 className="rv-word">{word.word}</h2>
      <button type="button" className="rv-icon-btn" onClick={playWord} title={c.play} aria-label={c.play}><Volume2 size={18} /></button>
    </div>
  )

  return (
    <div className="rv-runner">
      <header className="rv-top">
        <button type="button" className="rv-icon-btn" onClick={() => onExit(withSeconds(summary))} title={c.quit} aria-label={c.quit}><X size={18} /></button>
        <div className="rv-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="rv-counts" aria-label={`${uniqueLeft.length} ${c.remaining}`}>
          <span className="rv-count new" title={c.counts.new}>{newLeft}</span>
          <span className="rv-count learning" title={c.counts.learning}>{learningLeft}</span>
          <span className="rv-count review" title={c.counts.review}>{reviewLeft}</span>
        </div>
        <button type="button" className="rv-icon-btn" onClick={undoLast} disabled={!history.length} title={`${c.undo} (Z)`} aria-label={c.undo}><Undo2 size={17} /></button>
      </header>

      {practice && <p className="rv-practice-badge">{c.practiceBadge}</p>}

      <article className={`rv-card mode-${mode}${revealed ? ' revealed' : ''}`} key={presentation}>
        <div className="rv-card-meta">
          <span className={`rv-chip state-${cardState}`}>{c.states[cardState]}</span>
          <span className="rv-mode">{MODE_ICONS[mode]} {c.modes[mode]}</span>
        </div>

        <div className="rv-front">
          <p className="rv-prompt">{prompt}</p>
          {mode === 'recognition' && <>{wordHeading}{hasTarget ? sentence(false) : null}</>}
          {mode === 'recall' && <>
            <div className="rv-word-row">
              <h2 className="rv-word rv-meaning-front">{meaning}</h2>
              {revealed && editing === null && (
                <button type="button" className="rv-icon-btn small" title={c.editTranslation} aria-label={c.editTranslation} onClick={() => setEditing(meaning)}>
                  <PenLine size={14} />
                </button>
              )}
            </div>
            {!revealed && sentence(true)}
          </>}
          {mode === 'listening' && !revealed && (
            <button type="button" className="rv-listen-btn" onClick={playWord} aria-label={c.play}><Headphones size={30} /></button>
          )}
          {wantsTyping && (
            <form className="rv-type" onSubmit={(event) => { event.preventDefault(); reveal() }}>
              <input
                ref={inputRef}
                value={typed}
                readOnly={revealed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={c.typePlaceholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={check ? `check-${check}` : undefined}
                aria-label={c.typePlaceholder}
              />
            </form>
          )}
        </div>

        {revealed && (
          <div className="rv-back">
            {check && (
              <p className={`rv-check check-${check}`}>
                {check === 'correct' ? <Check size={15} /> : null}
                {c.answer[check]}
                {check !== 'correct' && typed.trim() && <span> · {c.youTyped} : <s>{typed.trim()}</s></span>}
              </p>
            )}
            {mode !== 'recognition' && wordHeading}
            {word.phonetic && <p className="rv-phonetic">{renderPhoneticFormatted(word.phonetic)}</p>}
            {mode !== 'recall' && translationBlock}
            {mode === 'recall' && editing !== null && translationBlock}
            <div className="rv-details">
              {word.partOfSpeech && <span className="rv-tag">{word.partOfSpeech}</span>}
              {word.tags?.filter((tag) => tag !== word.partOfSpeech).slice(0, 2).map((tag) => <span className="rv-tag" key={tag}>{tag}</span>)}
              {word.parent && <span className="rv-parent">{c.referenceWord} : <b>{word.parent}</b></span>}
            </div>
            {parts.length > 0 && (mode !== 'recognition' || !hasTarget) && (
              <div className="rv-sentence-row">
                {sentence(false)}
                <button type="button" className="rv-icon-btn small" onClick={playSentence} title={c.playSentence} aria-label={c.playSentence}><Volume2 size={14} /></button>
              </div>
            )}
            {mode === 'recognition' && hasTarget && (
              <button type="button" className="text-button rv-play-sentence" onClick={playSentence}><Volume2 size={13} /> {c.playSentence}</button>
            )}
            {source && <p className="rv-source"><BookOpen size={12} /> {source.title}</p>}
          </div>
        )}
      </article>

      <footer className="rv-actions">
        {!revealed ? (
          <button type="button" className="primary large rv-show" onClick={reveal}>
            {c.showAnswer} <kbd>␣</kbd>
          </button>
        ) : (
          <div className="rv-grades">
            {RATINGS.map((rating) => (
              <button type="button" key={rating} className={`rv-grade g${rating}${rating === suggested ? ' suggested' : ''}`} onClick={() => grade(rating)}>
                <span className="rv-grade-label">{c.ratings[rating]}</span>
                {!practice && previews && <span className="rv-grade-ival">{formatInterval(previews[rating].card.scheduledDays, ui === 'fr' ? 'fr' : 'en')}</span>}
                <kbd>{rating}</kbd>
              </button>
            ))}
          </div>
        )}
      </footer>

      <div className="rv-secondary">
        <button type="button" className="text-button" onClick={markKnown}><Check size={13} /> {c.alreadyKnown}</button>
        <span className="rv-shortcuts">{c.shortcuts}</span>
      </div>
    </div>
  )
}
