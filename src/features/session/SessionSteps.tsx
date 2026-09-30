import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Check, CheckCircle2, Loader2, Mic, Plus, RotateCcw, Snail, Sparkles, Square, Volume2 } from 'lucide-react'
import type { AppState, DailySession, UiLanguage, WritingEntry } from '../../domain'
import { id, todayKey } from '../../domain'
import { speak } from '../../ai'
import { learnCopy } from '../../i18n'
import { getLanguageBcp47 } from '../../languages'
import { upsertWriting } from '../../store'
import { getResourceWordStats } from '../readingProgressUtils'
import { Cover } from '../Reader'
import { getAgentConfig } from '../speaking/wordAiService'
import { analyzeWritingWithAi, type CorrectionItem, type WritingCorrectionResult } from '../writing/writingCorrectionAiService'
import { WritingCorrectionOverlay } from '../writing/WritingCorrectionOverlay'
import { MarkdownText } from '../vocabulary/RichInputField'
import { isWordInText } from '../writing/wordMatcher'
import { dayKey } from '../srs/fsrs'
import { compareSpoken } from '../srs/reviewHelpers'
import { ReviewRunner } from '../srs/ReviewRunner'
import { buildReviewQueue, computeStreak, forecast, learningSettings, meaningOf, patchActivity, recordWritingRecall } from '../srs/srsStore'
import { WeekDots } from '../srs/ReviewStats'
import { WRITING_SENTENCES, addStepStats, closeStep, rememberStruggled, setWritingId, wordsSavedWhileReading } from './sessionPlan'

type Change = (update: (prev: AppState) => AppState) => void
type StepProps = { state: AppState; session: DailySession; ui: UiLanguage; onChange: Change }

const countSentences = (text: string) =>
  (text.match(/[^.!?…\n]+[.!?…]*/g) ?? []).filter((sentence) => sentence.trim().split(/\s+/).length >= 3).length

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export function ReviewStep({ state, ui, onChange, onPause, wordIds }: StepProps & { onPause: () => void; wordIds?: string[] }) {
  const c = learnCopy(ui)
  // Frozen at mount: resuming later rebuilds the queue from what is still due.
  const [ids] = useState(() => wordIds ?? buildReviewQueue(state, new Date(), { cap: learningSettings(state).sessionReviewCap }).ids)

  if (!ids.length) {
    return (
      <div className="ss-panel ss-center">
        <CheckCircle2 size={30} className="lx-ok" />
        <h2>{c.allDone}</h2>
        <button type="button" className="primary" onClick={() => onChange((prev) => closeStep(prev, 'done'))}>{c.next} <ArrowRight size={15} /></button>
      </div>
    )
  }

  return (
    <ReviewRunner
      state={state}
      ui={ui}
      wordIds={ids}
      onChange={onChange}
      onComplete={(summary) => onChange((prev) => closeStep(rememberStruggled(prev, summary.struggledIds), 'done', { cards: summary.reviewed, correct: summary.correct }))}
      onExit={(summary) => {
        onChange((prev) => addStepStats(rememberStruggled(prev, summary.struggledIds), { cards: summary.reviewed, correct: summary.correct }))
        onPause()
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function ReadingStep({ state, session, ui, onOpenReader, onFinish, onAddText }: StepProps & {
  onOpenReader: (resourceId: string) => void
  onFinish: () => void
  onAddText: () => void
}) {
  const c = learnCopy(ui)
  const resource = state.resources.find((item) => item.id === session.resourceId)
  const saved = wordsSavedWhileReading(state, session)

  if (!resource) {
    return (
      <div className="ss-panel ss-center">
        <BookOpen size={28} />
        <p>{c.noResource}</p>
        <button type="button" className="primary" onClick={onAddText}><Plus size={15} /> {c.addText}</button>
      </div>
    )
  }

  const stats = getResourceWordStats(state, resource)
  return (
    <div className="ss-panel">
      <h2 className="ss-title">{c.readingTitle}</h2>
      <p className="ss-hint">{c.readingHint}</p>
      <button type="button" className="ss-resource" onClick={() => onOpenReader(resource.id)}>
        <div className="ss-resource-cover"><Cover cover={resource.cover} coverImage={resource.coverImage} type="" /></div>
        <div className="ss-resource-meta">
          <h3>{resource.title}</h3>
          {stats.totalUnique > 0 && (
            <>
              <div className="tiny-progress"><i style={{ width: `${stats.percentage}%` }} /></div>
              <small>{stats.knownCount} / {stats.totalUnique} · {stats.percentage} %</small>
            </>
          )}
        </div>
        <ArrowRight size={18} />
      </button>
      {saved.length > 0 && (
        <p className="ss-saved"><Check size={14} /> {c.wordsSaved(saved.length)} : {saved.slice(0, 6).map((word) => word.word).join(', ')}{saved.length > 6 ? '…' : ''}</p>
      )}
      <div className="ss-actions">
        <button type="button" className="primary" onClick={() => onOpenReader(resource.id)}>
          {session.readingStartedAt ? c.continueReader : c.openReader} <ArrowRight size={15} />
        </button>
        {session.readingStartedAt && <button type="button" className="outline" onClick={onFinish}><Check size={15} /> {c.readingDone}</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export function WritingStep({ state, session, ui, onChange }: StepProps) {
  const c = learnCopy(ui)
  const draftKey = `vivre-session-draft:${session.day}`
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) ?? '' } catch { return '' } })
  const [correction, setCorrection] = useState<WritingCorrectionResult | null>(null)
  const [rawView, setRawView] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const words = (session.writingWordIds ?? []).map((wordId) => state.words.find((word) => word.id === wordId)).filter(Boolean) as AppState['words']
  const hasAi = Boolean(getAgentConfig(state.settings.api, state.settings.api.taskModelWritingCorrection))
  const sentences = countSentences(text)
  const used = words.filter((word) => isWordInText(word.word, text) || (word.parent ? isWordInText(word.parent, text) : false))

  useEffect(() => { try { localStorage.setItem(draftKey, text) } catch { /* private mode */ } }, [text, draftKey])

  const correct = async () => {
    setCorrecting(true)
    setError(null)
    const result = await analyzeWritingWithAi({ text, learningLanguage: state.settings.learningLanguage, uiLanguage: ui, api: state.settings.api })
    setCorrecting(false)
    if (result.ok) { setCorrection(result.result); setRawView(false) }
    else setError(result.error)
  }

  // Same behaviour as the Écrire page: accepting a suggestion edits the text in place.
  const applyOne = (item: CorrectionItem) => {
    const index = text.indexOf(item.original)
    if (!item.original || index === -1) return
    const next = text.slice(0, index) + item.corrected + text.slice(index + item.original.length)
    setText(next)
    setCorrection((current) => current && { ...current, originalText: next, corrections: current.corrections.filter((entry) => entry.id !== item.id) })
  }
  const applyAll = (next: string) => {
    setText(next)
    setCorrection((current) => current && { ...current, originalText: next, corrections: [] })
  }
  const dismissOne = (correctionId: string) =>
    setCorrection((current) => current && { ...current, corrections: current.corrections.filter((entry) => entry.id !== correctionId) })

  const validate = () => {
    const content = text.trim()
    if (!content) return
    const now = new Date()
    const wordCount = content.split(/\s+/).length
    const entry: WritingEntry = {
      id: id('writing'),
      title: c.sessionWritingTitle(now.toLocaleDateString(ui === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' })),
      date: todayKey(),
      mode: 'reactivation',
      promptWords: words.map((word) => word.word),
      wordsUsed: used.map((word) => word.word),
      content,
      published: false,
      cosignCount: 0,
      coSigned: false,
      wordCount,
      timeSpentSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    onChange((prev) => {
      let next = upsertWriting(prev, entry)
      next = recordWritingRecall(next, used.map((word) => word.id), now)
      next = patchActivity(next, { writtenWords: wordCount }, now)
      next = setWritingId(next, entry.id)
      return closeStep(next, 'done', { words: wordCount, used: used.length, ...(correction?.score !== undefined ? { score: correction.score } : {}) }, now)
    })
    try { localStorage.removeItem(draftKey) } catch { /* private mode */ }
  }

  return (
    <div className="ss-panel">
      <h2 className="ss-title">{c.writingTitle(WRITING_SENTENCES)}</h2>
      <p className="ss-hint">{words.length ? c.writingHint : c.writingFree}</p>
      {words.length > 0 && (
        <ul className="ss-word-chips">
          {words.map((word) => {
            const isUsed = used.includes(word)
            return (
              <li key={word.id} className={isUsed ? 'used' : undefined}>
                {isUsed && <Check size={13} />}
                <b>{word.word}</b>
                {meaningOf(word) && <MarkdownText text={meaningOf(word)} />}
              </li>
            )
          })}
        </ul>
      )}
      {correction && (
        <div className="ss-correction-overlay">
          <WritingCorrectionOverlay
            correctionResult={correction}
            onApplyAll={applyAll}
            onApplySingle={applyOne}
            onDismissSingle={dismissOne}
            onClose={() => setCorrection(null)}
            isEditorView={rawView}
            onToggleEditorView={() => setRawView((value) => !value)}
            ui={ui}
          />
        </div>
      )}
      {(!correction || rawView) && (
        <textarea
          className="ss-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={c.writingPlaceholder}
          lang={state.settings.learningLanguage}
          rows={6}
          autoFocus
        />
      )}
      <div className="ss-writing-bar">
        <span className={sentences >= WRITING_SENTENCES ? 'ss-goal done' : 'ss-goal'}>{c.sentencesProgress(Math.min(sentences, WRITING_SENTENCES), WRITING_SENTENCES)}</span>
        <div className="ss-actions">
          <button type="button" className="outline" disabled={!hasAi || correcting || !text.trim()} onClick={correct} title={hasAi ? undefined : c.aiMissing}>
            {correcting ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {correcting ? c.aiCorrecting : c.aiCorrect}
          </button>
          <button type="button" className="primary" disabled={!text.trim()} onClick={validate}>{c.validate} <ArrowRight size={15} /></button>
        </div>
      </div>
      {!hasAi && <p className="ss-note">{c.aiMissing}</p>}
      {error && <p className="ss-error">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Speaking (shadowing)
// ---------------------------------------------------------------------------

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function SpeakingStep({ state, session, ui, onChange }: StepProps) {
  const c = learnCopy(ui)
  const sentences = session.speakingSentences ?? []
  const [index, setIndex] = useState(0)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scores, setScores] = useState<number[]>([])
  const recognition = useRef<Recognition | null>(null)
  const Ctor = useMemo(recognitionCtor, [])
  const sentence = sentences[index] ?? ''
  const result = transcript && !listening ? compareSpoken(sentence, transcript) : null
  const language = state.settings.learningLanguage

  useEffect(() => () => recognition.current?.abort(), [])

  const listen = (rate = 1) => { void speak(sentence, language, state.settings.api, { rate }) }

  const record = () => {
    if (!Ctor) return
    if (listening) { recognition.current?.stop(); return }
    setError(null)
    setTranscript('')
    const rec = new Ctor()
    rec.lang = getLanguageBcp47(language)
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      let text = ''
      for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript
      setTranscript(text)
    }
    rec.onerror = (event) => { if (event.error !== 'no-speech' && event.error !== 'aborted') setError(c.micError) }
    rec.onend = () => setListening(false)
    recognition.current = rec
    setListening(true)
    rec.start()
  }

  const finish = (finalScores: number[]) => {
    const scored = finalScores.filter((score) => score >= 0)
    const average = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : undefined
    onChange((prev) => closeStep(
      patchActivity(prev, { spokenSentences: sentences.length }),
      'done',
      { sentences: sentences.length, ...(average !== undefined ? { score: average } : {}) },
    ))
  }

  const next = () => {
    recognition.current?.abort()
    const nextScores = [...scores]
    nextScores[index] = result ? Math.max(result.score, scores[index] ?? 0) : (scores[index] ?? -1)
    setScores(nextScores)
    setTranscript('')
    if (index + 1 >= sentences.length) finish(nextScores)
    else setIndex(index + 1)
  }

  if (!sentences.length) {
    return (
      <div className="ss-panel ss-center">
        <p>{c.noResource}</p>
        <button type="button" className="primary" onClick={() => onChange((prev) => closeStep(prev, 'skipped'))}>{c.next} <ArrowRight size={15} /></button>
      </div>
    )
  }

  return (
    <div className="ss-panel">
      <h2 className="ss-title">{c.speakingTitle}</h2>
      <p className="ss-hint">{c.speakingHint}</p>
      <div className="ss-shadow-card">
        <p className="ss-shadow-count">{c.sentenceOf(index + 1, sentences.length)}</p>
        <p className="ss-shadow-sentence" lang={language}>
          {result
            ? result.parts.map((part, i) => <span key={i} className={part.ok ? undefined : 'missed'}>{part.text}</span>)
            : sentence}
        </p>
        <div className="ss-shadow-controls">
          <button type="button" className="outline" onClick={() => listen(1)}><Volume2 size={15} /> {c.listen}</button>
          <button type="button" className="outline" onClick={() => listen(0.75)}><Snail size={15} /> {c.slow}</button>
          {Ctor && (
            <button type="button" className={listening ? 'primary ss-recording' : 'primary'} onClick={record}>
              {listening ? <><Square size={13} /> {c.stop}</> : <><Mic size={15} /> {c.record}</>}
            </button>
          )}
        </div>
        {listening && transcript && <p className="ss-transcript">{transcript}</p>}
        {result && (
          <div className="ss-shadow-result">
            <span className={`ss-score ${result.score >= 85 ? 'good' : result.score >= 60 ? 'ok' : 'low'}`}>{c.accuracy} {result.score} %</span>
            <span className="ss-transcript">« {transcript} »</span>
          </div>
        )}
        {!Ctor && <p className="ss-note">{c.noMic}</p>}
        {error && <p className="ss-error">{error}</p>}
      </div>
      <div className="ss-actions end">
        {result && <button type="button" className="outline" onClick={() => setTranscript('')}><RotateCcw size={14} /> {c.retry}</button>}
        <button type="button" className="primary" onClick={next} disabled={listening}>
          {Ctor ? c.nextSentence : c.repeated} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function SessionSummary({ state, session, ui, onHome }: StepProps & { onHome: () => void }) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const statsOf = (stepId: string) => session.steps.find((step) => step.id === stepId && step.status === 'done')?.stats ?? {}
  const review = statsOf('review')
  const newWords = statsOf('newWords')
  const cards = (review.cards ?? 0) + (newWords.cards ?? 0)
  const correct = (review.correct ?? 0) + (newWords.correct ?? 0)
  const writing = statsOf('writing')
  const speaking = statsOf('speaking')
  const minutes = Math.round((state.activity?.[dayKey()]?.seconds ?? 0) / 60)
  const streak = computeStreak(state.activity, settings.dailyMinutes)
  const tomorrow = forecast(state, 2)[1]?.count ?? 0

  const tiles: { value: string; label: string }[] = [
    { value: String(minutes), label: c.summaryMinutes },
    ...(cards ? [{ value: String(cards), label: c.summaryCards }, { value: `${Math.round((correct / cards) * 100)} %`, label: c.summaryAccuracy }] : []),
    ...(writing.words ? [{ value: String(writing.words), label: c.summaryWords }] : []),
    ...(speaking.score !== undefined ? [{ value: `${speaking.score} %`, label: c.summarySpoken }] : []),
  ]

  return (
    <div className="ss-panel ss-summary">
      <CheckCircle2 size={36} className="lx-finish-icon" />
      <h1>{c.summaryTitle}</h1>
      <p className="ss-hint">{c.summarySub}</p>
      <div className="lx-finish-grid">
        {tiles.map((tile) => <div key={tile.label}><b>{tile.value}</b><span>{tile.label}</span></div>)}
      </div>
      <div className="ss-summary-streak">
        <b>{c.summaryStreak(streak.current)}</b>
        <WeekDots state={state} ui={ui} />
      </div>
      <p className="ss-hint">{c.summaryTomorrow(tomorrow)}</p>
      <button type="button" className="primary" onClick={onHome}>{c.backHome} <ArrowRight size={15} /></button>
    </div>
  )
}
