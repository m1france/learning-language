import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Lightbulb, Plus, RotateCcw, Volume2, X } from 'lucide-react'
import { Inline } from '../Markdown'
import { BlockShell, hashSeed, sameAnswer, scramble, shuffle, useBlockEnv } from './shared'

// ── Quiz ────────────────────────────────────────────────────────────────────

export type QuizData = { title?: string; questions: { q: string; options: string[]; answer: number; explain?: string }[] }

export function QuizBlock({ data, index }: { data: QuizData; index: number }) {
  const env = useBlockEnv()
  const questions = (data.questions ?? []).filter((q) => q?.q && Array.isArray(q.options) && q.options.length)
  const [picked, setPicked] = useState<Record<number, number>>({})
  const saved = env.getBlock(index)
  const answered = Object.keys(picked).length
  const correct = questions.filter((q, i) => picked[i] === q.answer).length
  const done = answered === questions.length && questions.length > 0

  const choose = (qIndex: number, option: number) => {
    setPicked((prev) => (prev[qIndex] !== undefined ? prev : { ...prev, [qIndex]: option }))
  }

  // Report the score once, when the last question is answered.
  const reported = useRef(false)
  useEffect(() => {
    if (!done) { reported.current = false; return }
    if (reported.current) return
    reported.current = true
    env.setBlock(index, { score: correct, total: questions.length, done: true })
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BlockShell kind="quiz" title={data.title} index={index} onReset={answered ? () => setPicked({}) : undefined}
      score={done ? { score: correct, total: questions.length } : saved?.total && !answered ? { score: saved.score ?? 0, total: saved.total } : null}>
      <ol className="ab-quiz">
        {questions.map((question, qIndex) => {
          const choice = picked[qIndex]
          return (
            <li key={qIndex}>
              <p className="ab-q"><Inline text={question.q} ctx={{ onSpeak: env.speak }} /></p>
              <div className="ab-options">
                {question.options.map((option, oIndex) => {
                  const state = choice === undefined ? '' : oIndex === question.answer ? 'right' : oIndex === choice ? 'wrong' : 'dim'
                  return (
                    <button key={oIndex} type="button" className={`ab-option ${state}`} onClick={() => choose(qIndex, oIndex)} disabled={choice !== undefined}>
                      <span className="ab-letter">{String.fromCharCode(65 + oIndex)}</span>
                      <span><Inline text={option} ctx={{}} /></span>
                      {state === 'right' && <Check size={15} />}
                      {state === 'wrong' && <X size={15} />}
                    </button>
                  )
                })}
              </div>
              {choice !== undefined && question.explain && (
                <p className={`ab-explain ${choice === question.answer ? 'good' : 'bad'}`}><Inline text={question.explain} ctx={{ onSpeak: env.speak }} /></p>
              )}
            </li>
          )
        })}
      </ol>
    </BlockShell>
  )
}

// ── Fill in the blanks ─────────────────────────────────────────────────────

export type FillData = {
  title?: string
  instructions?: string
  items: { text: string; answer: string; alternatives?: string[]; hint?: string; explain?: string }[]
  bank?: string[]
}

export function FillBlock({ data, index }: { data: FillData; index: number }) {
  const env = useBlockEnv()
  const items = (data.items ?? []).filter((item) => item?.text && item.answer)
  const [values, setValues] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const [hints, setHints] = useState<Record<number, boolean>>({})
  const [focus, setFocus] = useState(0)
  const bank = useMemo(() => shuffle(data.bank?.length ? data.bank : [], hashSeed(JSON.stringify(items))), [data.bank, items])
  const isRight = (i: number) => {
    const item = items[i]
    return [item.answer, ...(item.alternatives ?? [])].some((answer) => sameAnswer(values[i] ?? '', answer))
  }
  const score = items.filter((_, i) => isRight(i)).length

  const check = () => {
    setChecked(true)
    env.setBlock(index, { score, total: items.length, done: true })
  }

  const useWord = (word: string) => {
    const target = values[focus] ? items.findIndex((_, i) => !values[i]) : focus
    const slot = target === -1 ? focus : target
    setValues({ ...values, [slot]: word })
    setChecked(false)
  }

  return (
    <BlockShell kind="fill" title={data.title} index={index}
      onReset={Object.keys(values).length ? () => { setValues({}); setChecked(false) } : undefined}
      score={checked ? { score, total: items.length } : null}
      footer={
        <>
          {bank.length > 0 && (
            <div className="ab-bank">
              {bank.map((word, i) => (
                <button key={i} type="button" className={Object.values(values).includes(word) ? 'used' : ''} onClick={() => useWord(word)}>{word}</button>
              ))}
            </div>
          )}
          <button type="button" className="ab-primary" onClick={check} disabled={!Object.values(values).some(Boolean)}>{checked ? env.c.checkAgain : env.c.check}</button>
        </>
      }>
      {data.instructions && <p className="ab-instructions">{data.instructions}</p>}
      <ol className="ab-fill">
        {items.map((item, i) => {
          const [before, ...afterParts] = item.text.split(/_{2,}/)
          const after = afterParts.join('___')
          const state = checked ? (isRight(i) ? 'right' : 'wrong') : ''
          return (
            <li key={i} className={state}>
              <p>
                {before}
                <input
                  className={`ab-blank ${state}`}
                  value={values[i] ?? ''}
                  size={Math.max(4, Math.min(24, (values[i] || item.answer).length + 1))}
                  onFocus={() => setFocus(i)}
                  onChange={(event) => { setValues({ ...values, [i]: event.target.value }); if (checked) setChecked(false) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') check() }}
                  aria-label={`${i + 1}`}
                  autoComplete="off"
                  spellCheck={false}
                />
                {after}
                {!checked && item.hint && (
                  <button type="button" className="ab-hint-btn" onClick={() => setHints({ ...hints, [i]: !hints[i] })} aria-label={env.c.hint}><Lightbulb size={13} /></button>
                )}
              </p>
              {hints[i] && !checked && <p className="ab-hint">{item.hint}</p>}
              {checked && (
                <p className={`ab-explain ${state === 'right' ? 'good' : 'bad'}`}>
                  {state === 'wrong' && <><b>{item.answer}</b>{item.explain ? ' — ' : ''}</>}
                  {item.explain && <Inline text={item.explain} ctx={{ onSpeak: env.speak }} />}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </BlockShell>
  )
}

// ── Match pairs ────────────────────────────────────────────────────────────

export type MatchData = { title?: string; left?: string; right?: string; pairs: { a: string; b: string; explain?: string }[] }

export function MatchBlock({ data, index }: { data: MatchData; index: number }) {
  const env = useBlockEnv()
  const pairs = (data.pairs ?? []).filter((pair) => pair?.a && pair.b)
  const rightOrder = useMemo(() => shuffle(pairs.map((_, i) => i), hashSeed(JSON.stringify(pairs))), [pairs])
  const [selected, setSelected] = useState<number | null>(null)
  const [matched, setMatched] = useState<Record<number, boolean>>({})
  const [mistakes, setMistakes] = useState<Record<number, number>>({})
  const [flash, setFlash] = useState<number | null>(null)
  const done = pairs.length > 0 && Object.keys(matched).length === pairs.length
  const firstTry = pairs.filter((_, i) => !mistakes[i]).length

  const pickRight = (rightIndex: number) => {
    if (selected === null || matched[rightIndex]) return
    if (rightIndex === selected) {
      const next = { ...matched, [rightIndex]: true }
      setMatched(next)
      setSelected(null)
      if (Object.keys(next).length === pairs.length) env.setBlock(index, { score: pairs.filter((_, i) => !mistakes[i]).length, total: pairs.length, done: true })
    } else {
      setMistakes({ ...mistakes, [selected]: (mistakes[selected] ?? 0) + 1 })
      setFlash(rightIndex)
      window.setTimeout(() => setFlash(null), 450)
    }
  }

  return (
    <BlockShell kind="match" title={data.title} index={index}
      onReset={Object.keys(matched).length ? () => { setMatched({}); setMistakes({}); setSelected(null) } : undefined}
      score={done ? { score: firstTry, total: pairs.length } : null}>
      <div className="ab-match">
        <div className="ab-match-col">
          {data.left && <span className="ab-col-label">{data.left}</span>}
          {pairs.map((pair, i) => (
            <button key={i} type="button" className={`ab-tile${matched[i] ? ' matched' : selected === i ? ' selected' : ''}`}
              disabled={matched[i]} onClick={() => { setSelected(i); env.speak(pair.a) }}>
              {pair.a}
            </button>
          ))}
        </div>
        <div className="ab-match-col">
          {data.right && <span className="ab-col-label">{data.right}</span>}
          {rightOrder.map((i) => (
            <button key={i} type="button" className={`ab-tile${matched[i] ? ' matched' : flash === i ? ' shake' : ''}`}
              disabled={matched[i] || selected === null} onClick={() => pickRight(i)}>
              {pairs[i].b}
            </button>
          ))}
        </div>
      </div>
      {done && pairs.some((pair) => pair.explain) && (
        <ul className="ab-notes">
          {pairs.filter((pair) => pair.explain).map((pair, i) => <li key={i}><b>{pair.a} → {pair.b}</b> · <Inline text={pair.explain!} ctx={{}} /></li>)}
        </ul>
      )}
    </BlockShell>
  )
}

// ── Put in order ───────────────────────────────────────────────────────────

export type OrderData = { title?: string; items: { sentence: string; translation?: string; tip?: string }[] }

const tokenize = (sentence: string) => sentence.trim().split(/\s+/).filter(Boolean)

function OrderItem({ item, seed, onResult }: { item: OrderData['items'][number]; seed: number; onResult: (ok: boolean) => void }) {
  const env = useBlockEnv()
  const tokens = useMemo(() => tokenize(item.sentence), [item.sentence])
  const pool = useMemo(() => scramble(tokens.map((_, i) => i), seed), [tokens, seed])
  const [chosen, setChosen] = useState<number[]>([])
  const [result, setResult] = useState<boolean | null>(null)
  const complete = chosen.length === tokens.length

  const check = () => {
    const ok = sameAnswer(chosen.map((i) => tokens[i]).join(' '), tokens.join(' '))
    setResult(ok)
    onResult(ok)
  }

  return (
    <li className={result === null ? '' : result ? 'right' : 'wrong'}>
      <div className="ab-order-line" aria-label="answer">
        {chosen.length === 0 && <span className="ab-placeholder">{env.c.tapWords}</span>}
        {chosen.map((tokenIndex, position) => (
          <button key={`${tokenIndex}-${position}`} type="button" className="ab-chip placed" disabled={result === true}
            onClick={() => { setChosen(chosen.filter((_, p) => p !== position)); setResult(null) }}>{tokens[tokenIndex]}</button>
        ))}
      </div>
      <div className="ab-order-pool">
        {pool.map((tokenIndex) => (
          <button key={tokenIndex} type="button" className="ab-chip" disabled={chosen.includes(tokenIndex) || result === true}
            onClick={() => { setChosen([...chosen, tokenIndex]); setResult(null) }}>{tokens[tokenIndex]}</button>
        ))}
        {complete && result === null && <button type="button" className="ab-primary small" onClick={check}>{env.c.check}</button>}
      </div>
      {result !== null && (
        <p className={`ab-explain ${result ? 'good' : 'bad'}`}>
          {!result && <><b>{item.sentence}</b> · </>}
          <button type="button" className="ab-inline-play" onClick={() => env.speak(item.sentence)} aria-label={env.c.listen}><Volume2 size={13} /></button>
          {item.translation && <span className="ab-muted"> {item.translation}</span>}
          {item.tip && <span> — {item.tip}</span>}
          {!result && <button type="button" className="ab-link" onClick={() => { setChosen([]); setResult(null) }}><RotateCcw size={11} /> {env.c.retry}</button>}
        </p>
      )}
    </li>
  )
}

export function OrderBlock({ data, index }: { data: OrderData; index: number }) {
  const env = useBlockEnv()
  const items = (data.items ?? []).filter((item) => item?.sentence)
  const [results, setResults] = useState<Record<number, boolean>>({})
  const [round, setRound] = useState(0)
  const answered = Object.keys(results).length
  const score = Object.values(results).filter(Boolean).length
  const record = (i: number, ok: boolean) => {
    const next = { ...results, [i]: results[i] ?? ok }
    setResults(next)
    if (Object.keys(next).length === items.length) env.setBlock(index, { score: Object.values(next).filter(Boolean).length, total: items.length, done: true })
  }
  return (
    <BlockShell kind="order" title={data.title} index={index} onReset={answered ? () => { setResults({}); setRound(round + 1) } : undefined}
      score={answered === items.length && items.length ? { score, total: items.length } : null}>
      <ol className="ab-order" key={round}>
        {items.map((item, i) => <OrderItem key={i} item={item} seed={hashSeed(item.sentence) + round} onResult={(ok) => record(i, ok)} />)}
      </ol>
    </BlockShell>
  )
}

// ── Flashcards ─────────────────────────────────────────────────────────────

export type FlashcardsData = { title?: string; cards: { front: string; back: string; example?: string; ipa?: string }[] }

export function FlashcardsBlock({ data, index }: { data: FlashcardsData; index: number }) {
  const env = useBlockEnv()
  const cards = (data.cards ?? []).filter((card) => card?.front && card.back)
  const [position, setPosition] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState<Record<number, boolean>>({})
  const card = cards[position]
  if (!card) return null
  const unsaved = cards.filter((item) => !env.hasWord(item.front))
  const go = (delta: number) => { setFlipped(false); setPosition((position + delta + cards.length) % cards.length) }
  const mark = (value: boolean) => {
    const next = { ...known, [position]: value }
    setKnown(next)
    if (Object.keys(next).length === cards.length) env.setBlock(index, { score: Object.values(next).filter(Boolean).length, total: cards.length, done: true })
    if (position < cards.length - 1) go(1)
  }
  return (
    <BlockShell kind="flashcards" title={data.title} index={index}
      footer={
        <>
          <span className="ab-dots">{cards.map((_, i) => <i key={i} className={i === position ? 'on' : known[i] === true ? 'good' : known[i] === false ? 'bad' : ''} />)}</span>
          {unsaved.length > 0
            ? <button type="button" className="ab-ghost" onClick={() => unsaved.forEach((item) => env.saveWord({ word: item.front, translation: item.back, ipa: item.ipa, example: item.example }))}><Plus size={13} /> {env.c.saveAll(unsaved.length)}</button>
            : <span className="ab-muted small"><Check size={12} /> {env.c.allSaved}</span>}
        </>
      }>
      <div className="ab-flash-stage">
        <button type="button" className="ab-nav" onClick={() => go(-1)} aria-label={env.c.previous}><ChevronLeft size={18} /></button>
        <button type="button" className={`ab-card${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(!flipped)} aria-label={env.c.flip}>
          <span className="ab-card-face front">
            <b>{card.front}</b>
            {card.ipa && <small className="ab-ipa">{card.ipa}</small>}
            <span className="ab-card-hint">{env.c.flip}</span>
          </span>
          <span className="ab-card-face back">
            <b>{card.back}</b>
            {card.example && <em>{card.example}</em>}
          </span>
        </button>
        <button type="button" className="ab-nav" onClick={() => go(1)} aria-label={env.c.next}><ChevronRight size={18} /></button>
      </div>
      <div className="ab-flash-actions">
        <button type="button" className="ab-ghost" onClick={() => env.speak(card.front)}><Volume2 size={14} /> {env.c.listen}</button>
        {flipped && (
          <>
            <button type="button" className="ab-ghost bad" onClick={() => mark(false)}>{env.c.again}</button>
            <button type="button" className="ab-ghost good" onClick={() => mark(true)}>{env.c.knewIt}</button>
          </>
        )}
      </div>
    </BlockShell>
  )
}
