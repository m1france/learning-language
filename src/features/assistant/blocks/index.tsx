import React from 'react'
import type { MdBlock } from '../Markdown'
import { parseJsonLoose } from '../../../lib/llm'
import { ExerciseBlock, type ExerciseRequest } from './ExerciseBlock'
import { HtmlArtifact } from './HtmlArtifact'
import { CompareBlock, ConjugationBlock, DialogueBlock, MindmapBlock, SvgBlock, TimelineBlock, VocabBlock, type CompareData, type ConjugationData, type DialogueData, type MindmapData, type TimelineData, type VocabData } from './LearnBlocks'
import { FillBlock, FlashcardsBlock, MatchBlock, OrderBlock, QuizBlock, type FillData, type FlashcardsData, type MatchData, type OrderData, type QuizData } from './PracticeBlocks'
import { BlockShell, useBlockEnv } from './shared'

type CodeBlock = Extract<MdBlock, { type: 'code' }>

function Pending({ kind, index }: { kind: string; index: number }) {
  const env = useBlockEnv()
  return (
    <BlockShell kind={kind} index={index}>
      <div className="ab-building"><span className="ab-pulse" /> {env.c.preparing}</div>
    </BlockShell>
  )
}

function Broken({ kind, index, body }: { kind: string; index: number; body: string }) {
  const env = useBlockEnv()
  return (
    <BlockShell kind={kind} index={index}>
      <p className="ab-explain bad">{env.c.blockBroken}</p>
      <pre className="ab-source"><code>{body.slice(0, 1600)}</code></pre>
    </BlockShell>
  )
}

/** Turns an interactive fenced block into its component. */
export function SpecialBlock({ block }: { block: CodeBlock }) {
  const index = block.special ?? 0
  const kind = block.lang
  if (kind === 'html') return <HtmlArtifact code={block.body} index={index} partial={block.partial} />
  if (block.partial) return <Pending kind={kind} index={index} />
  if (kind === 'svg') return <SvgBlock code={block.body} index={index} />

  let data: unknown
  try {
    data = parseJsonLoose(block.body)
  } catch {
    return <Broken kind={kind} index={index} body={block.body} />
  }
  switch (kind) {
    case 'quiz': return <QuizBlock data={data as QuizData} index={index} />
    case 'fill': return <FillBlock data={data as FillData} index={index} />
    case 'match': return <MatchBlock data={data as MatchData} index={index} />
    case 'order': return <OrderBlock data={data as OrderData} index={index} />
    case 'flashcards': return <FlashcardsBlock data={data as FlashcardsData} index={index} />
    case 'vocab': return <VocabBlock data={data as VocabData} index={index} />
    case 'compare': return <CompareBlock data={data as CompareData} index={index} />
    case 'timeline': return <TimelineBlock data={data as TimelineData} index={index} />
    case 'conjugation': return <ConjugationBlock data={data as ConjugationData} index={index} />
    case 'dialogue': return <DialogueBlock data={data as DialogueData} index={index} />
    case 'mindmap': return <MindmapBlock data={data as MindmapData} index={index} />
    case 'exercise': return <ExerciseBlock data={data as ExerciseRequest} index={index} />
    default: return <Broken kind={kind} index={index} body={block.body} />
  }
}

/** Error boundary so one malformed block never breaks the whole conversation. */
export class BlockBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.warn('[assistant] block crashed', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
