import React, { useMemo, useState } from 'react'
import { Check, Eye, EyeOff, Pause, Play, Plus, Volume2 } from 'lucide-react'
import { Inline } from '../Markdown'
import { BlockShell, useBlockEnv } from './shared'

// ── Vocabulary list ────────────────────────────────────────────────────────

export type VocabData = { title?: string; words: { word: string; ipa?: string; pos?: string; translation?: string; example?: string; note?: string }[] }

export function VocabBlock({ data, index }: { data: VocabData; index: number }) {
  const env = useBlockEnv()
  const words = (data.words ?? []).filter((word) => word?.word)
  const unsaved = words.filter((word) => !env.hasWord(word.word))
  return (
    <BlockShell kind="vocab" title={data.title} index={index}
      footer={unsaved.length > 1
        ? <button type="button" className="ab-ghost" onClick={() => unsaved.forEach((word) => env.saveWord({ word: word.word, translation: word.translation ?? '', ipa: word.ipa, example: word.example, pos: word.pos }))}><Plus size={13} /> {env.c.saveAll(unsaved.length)}</button>
        : undefined}>
      <ul className="ab-vocab">
        {words.map((word, i) => {
          const saved = env.hasWord(word.word)
          return (
            <li key={i}>
              <button type="button" className="ab-play" onClick={() => env.speak(word.word)} aria-label={env.c.listen}><Volume2 size={14} /></button>
              <div className="ab-vocab-main">
                <p className="ab-vocab-word">
                  <b>{word.word}</b>
                  {word.ipa && <span className="ab-ipa">{word.ipa}</span>}
                  {word.pos && <span className="ab-pos">{word.pos}</span>}
                </p>
                {word.translation && <p className="ab-vocab-tr">{word.translation}</p>}
                {word.example && (
                  <p className="ab-vocab-ex">
                    <button type="button" onClick={() => env.speak(word.example!)} aria-label={env.c.listen}><Inline text={word.example} ctx={{}} /></button>
                  </p>
                )}
                {word.note && <p className="ab-vocab-note"><Inline text={word.note} ctx={{}} /></p>}
              </div>
              <button type="button" className={`ab-save${saved ? ' saved' : ''}`} disabled={saved}
                onClick={() => env.saveWord({ word: word.word, translation: word.translation ?? '', ipa: word.ipa, example: word.example, pos: word.pos })}
                title={saved ? env.c.inDeck : env.c.addToDeck} aria-label={saved ? env.c.inDeck : env.c.addToDeck}>
                {saved ? <Check size={14} /> : <Plus size={14} />}
              </button>
            </li>
          )
        })}
      </ul>
    </BlockShell>
  )
}

// ── Wrong vs right ─────────────────────────────────────────────────────────

export type CompareData = { title?: string; items: { wrong: string; right: string; why?: string }[] }

export function CompareBlock({ data, index }: { data: CompareData; index: number }) {
  const env = useBlockEnv()
  return (
    <BlockShell kind="compare" title={data.title} index={index}>
      <ul className="ab-compare">
        {(data.items ?? []).filter((item) => item?.right).map((item, i) => (
          <li key={i}>
            <p className="ab-wrong"><span aria-hidden>✕</span> <s>{item.wrong}</s></p>
            <p className="ab-right">
              <span aria-hidden>✓</span> <button type="button" onClick={() => env.speak(item.right)}>{item.right} <Volume2 size={12} /></button>
            </p>
            {item.why && <p className="ab-why"><Inline text={item.why} ctx={{ onSpeak: env.speak }} /></p>}
          </li>
        ))}
      </ul>
    </BlockShell>
  )
}

// ── Tense timeline ─────────────────────────────────────────────────────────

export type TimelineData = { title?: string; tenses: { name: string; example?: string; from?: number; to?: number; point?: boolean }[] }

const PALETTE = ['#e0735a', '#5b7fb8', '#d49a2c', '#3f8f7a', '#7c6fb0', '#c2577f']

export function TimelineBlock({ data, index }: { data: TimelineData; index: number }) {
  const env = useBlockEnv()
  const pos = (value: number | undefined) => ((Math.max(-1, Math.min(1, Number(value) || 0)) + 1) / 2) * 100
  return (
    <BlockShell kind="timeline" title={data.title} index={index} wide>
      <div className="ab-timeline">
        <div className="ab-tl-axis-labels" aria-hidden>
          <span>{env.c.past}</span><span>{env.c.now}</span><span>{env.c.future}</span>
        </div>
        {(data.tenses ?? []).filter((tense) => tense?.name).map((tense, i) => {
          const from = pos(tense.from)
          const to = pos(tense.to ?? tense.from)
          const point = tense.point || Math.abs(to - from) < 2
          const color = PALETTE[i % PALETTE.length]
          return (
            <div key={i} className="ab-tl-row">
              <div className="ab-tl-label">
                <b style={{ color }}>{tense.name}</b>
                {tense.example && <button type="button" onClick={() => env.speak(tense.example!)}><Inline text={tense.example} ctx={{}} /></button>}
              </div>
              <div className="ab-tl-track">
                <span className="ab-tl-now" />
                {point
                  ? <span className="ab-tl-point" style={{ left: `${from}%`, background: color }} />
                  : <span className="ab-tl-bar" style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%`, background: color }} />}
              </div>
            </div>
          )
        })}
      </div>
    </BlockShell>
  )
}

// ── Conjugation table ──────────────────────────────────────────────────────

export type ConjugationData = { title?: string; verb?: string; tenses: { name: string; forms: [string, string][] }[] }

export function ConjugationBlock({ data, index }: { data: ConjugationData; index: number }) {
  const env = useBlockEnv()
  const tenses = (data.tenses ?? []).filter((tense) => tense?.name && Array.isArray(tense.forms))
  return (
    <BlockShell kind="conjugation" title={data.title || data.verb} index={index} wide={tenses.length > 2}>
      <div className="ab-conj">
        {tenses.map((tense, i) => (
          <div key={i} className="ab-conj-card">
            <h5>{tense.name}</h5>
            <table>
              <tbody>
                {tense.forms.map((form, j) => (
                  <tr key={j} onClick={() => env.speak(`${form[0]} ${form[1]}`)} title={env.c.listen}>
                    <td>{form[0]}</td>
                    <td><b>{form[1]}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </BlockShell>
  )
}

// ── Dialogue ───────────────────────────────────────────────────────────────

export type DialogueData = { title?: string; setting?: string; lines: { speaker: string; text: string; translation?: string }[] }

export function DialogueBlock({ data, index }: { data: DialogueData; index: number }) {
  const env = useBlockEnv()
  const lines = (data.lines ?? []).filter((line) => line?.text)
  const speakers = useMemo(() => [...new Set(lines.map((line) => line.speaker))], [lines])
  const [showTr, setShowTr] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)
  const stopRef = React.useRef(false)

  const playAll = async () => {
    if (playing !== null) { stopRef.current = true; setPlaying(null); return }
    stopRef.current = false
    for (let i = 0; i < lines.length; i += 1) {
      if (stopRef.current) break
      setPlaying(i)
      await env.speakAndWait(lines[i].text)
    }
    setPlaying(null)
  }

  return (
    <BlockShell kind="dialogue" title={data.title} index={index}
      footer={
        <>
          <button type="button" className="ab-ghost" onClick={() => void playAll()}>{playing !== null ? <><Pause size={13} /> {env.c.stop}</> : <><Play size={13} /> {env.c.playAll}</>}</button>
          {lines.some((line) => line.translation) && (
            <button type="button" className="ab-ghost" onClick={() => setShowTr(!showTr)}>{showTr ? <EyeOff size={13} /> : <Eye size={13} />} {env.c.translation}</button>
          )}
        </>
      }>
      {data.setting && <p className="ab-instructions">{data.setting}</p>}
      <div className="ab-dialogue">
        {lines.map((line, i) => (
          <div key={i} className={`ab-line ${speakers.indexOf(line.speaker) % 2 ? 'right' : 'left'}${playing === i ? ' playing' : ''}`}>
            <span className="ab-speaker">{line.speaker}</span>
            <button type="button" className="ab-bubble" onClick={() => env.speak(line.text)}>
              <Inline text={line.text} ctx={{}} />
              {showTr && line.translation && <small>{line.translation}</small>}
            </button>
          </div>
        ))}
      </div>
    </BlockShell>
  )
}

// ── Mind map (word families, semantic fields) ─────────────────────────────

export type MindmapData = { title?: string; center: string; branches: { label: string; items: string[] }[] }

export function MindmapBlock({ data, index }: { data: MindmapData; index: number }) {
  const env = useBlockEnv()
  const branches = (data.branches ?? []).filter((branch) => branch?.label)
  return (
    <BlockShell kind="mindmap" title={data.title} index={index} wide>
      <div className="ab-map">
        <button type="button" className="ab-map-center" onClick={() => env.speak(data.center)}>{data.center}</button>
        <div className="ab-map-branches" style={{ ['--n' as string]: branches.length }}>
          {branches.map((branch, i) => (
            <div key={i} className="ab-map-branch" style={{ ['--c' as string]: PALETTE[i % PALETTE.length] }}>
              <span className="ab-map-label">{branch.label}</span>
              <div className="ab-map-items">
                {(branch.items ?? []).map((item, j) => <button key={j} type="button" onClick={() => env.speak(item)}>{item}</button>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BlockShell>
  )
}

// ── SVG visual ─────────────────────────────────────────────────────────────

/** Rendered as an <img>: scripts and event handlers can never run. */
export function SvgBlock({ code, index }: { code: string; index: number }) {
  const env = useBlockEnv()
  const src = useMemo(() => {
    const svg = code.trim().replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '')
    const withNs = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`
  }, [code])
  return (
    <BlockShell kind="svg" index={index} wide>
      <figure className="ab-svg"><img src={src} alt={env.c.blockKinds.svg} /></figure>
    </BlockShell>
  )
}
