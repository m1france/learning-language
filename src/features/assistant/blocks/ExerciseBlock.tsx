import React, { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import type { Difficulty } from '../../../domain'
import { generateExerciseWithAi } from '../../exercises/exerciseAiService'
import type { ExerciseDefinition, ExerciseMode } from '../../exercises/exercisesDomain'
import { CrosswordBoard } from '../../exercises/components/CrosswordBoard'
import { MatchPairsBoard } from '../../exercises/components/MatchPairsBoard'
import { SentenceScrambleBoard } from '../../exercises/components/SentenceScrambleBoard'
import { HandwrittenCorrections } from '../../exercises/components/HandwrittenCorrections'
import { DialogueRoleplayBoard, ErrorHunterBoard, FillInBlanksBoard, GrammarDeepdiveBoard, ImageAssociationBoard } from '../../exercises/components/GeneralExerciseBoards'
import { BlockShell, useBlockEnv } from './shared'

export type ExerciseRequest = { mode?: ExerciseMode; request?: string; difficulty?: Difficulty }

const CEFR_TO_DIFFICULTY: Record<string, Difficulty> = { A1: 'beginner', A2: 'beginner', B1: 'intermediate', B2: 'intermediate', C1: 'advanced', C2: 'native' }

/** One generation per block, even if the message re-renders while it runs. */
const inflight = new Map<string, Promise<ExerciseDefinition | string>>()

export function ExerciseBlock({ data, index }: { data: ExerciseRequest; index: number }) {
  const env = useBlockEnv()
  const saved = env.getBlock(index)
  const exercise = saved?.data as ExerciseDefinition | undefined
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const key = `${env.turnId}:${index}:${attempt}`

  useEffect(() => {
    if (exercise) return
    let alive = true
    let job = inflight.get(key)
    if (!job) {
      job = generateExerciseWithAi({
        prompt: data.request || 'vocabulary practice',
        requestedMode: data.mode || 'auto',
        difficulty: data.difficulty || CEFR_TO_DIFFICULTY[env.level] || 'intermediate',
        learningLanguage: env.state.settings.learningLanguage,
        uiLanguage: env.ui,
        api: env.api,
      }).then((result) => (result.ok ? result.exercise : result.error))
      inflight.set(key, job)
    }
    void job.then((result) => {
      inflight.delete(key)
      if (typeof result === 'string') { if (alive) setError(result); return }
      env.setBlock(index, { data: result })
    })
    return () => { alive = false }
  }, [exercise, key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!exercise) {
    return (
      <BlockShell kind="exercise" title={data.request} index={index}>
        {error
          ? <p className="ab-explain bad">{error} <button type="button" className="ab-link" onClick={() => { setError(null); setAttempt(attempt + 1) }}><RotateCcw size={11} /> {env.c.retry}</button></p>
          : <div className="ab-building"><Loader2 size={14} className="ab-spin" /> {env.c.buildingExercise}</div>}
      </BlockShell>
    )
  }

  const finish = (score: number, total: number) => {
    setSubmitted(true)
    env.setBlock(index, { ...saved, score, total, done: true })
  }
  const props = { onCheckFinished: finish, isSubmitted: submitted, ui: env.ui }

  return (
    <BlockShell kind="exercise" title={exercise.title} index={index} wide
      onReset={submitted ? () => setSubmitted(false) : undefined}
      score={saved?.total ? { score: saved.score ?? 0, total: saved.total } : null}>
      {exercise.instructions && <p className="ab-instructions">{exercise.instructions}</p>}
      <div className="ab-legacy">
        {exercise.mode === 'handwritten_mastery' && exercise.handwrittenMasteryData && <HandwrittenCorrections data={exercise.handwrittenMasteryData} {...props} />}
        {exercise.mode === 'crossword' && exercise.crosswordData && <CrosswordBoard data={exercise.crosswordData} {...props} />}
        {exercise.mode === 'match_pairs' && exercise.matchPairsData && <MatchPairsBoard data={exercise.matchPairsData} {...props} />}
        {exercise.mode === 'sentence_scramble' && exercise.sentenceScrambleData && <SentenceScrambleBoard data={exercise.sentenceScrambleData} {...props} />}
        {exercise.mode === 'fill_in_blanks' && exercise.fillInBlanksData && <FillInBlanksBoard data={exercise.fillInBlanksData} {...props} />}
        {exercise.mode === 'error_hunter' && exercise.errorHunterData && <ErrorHunterBoard data={exercise.errorHunterData} {...props} />}
        {exercise.mode === 'dialogue_roleplay' && exercise.dialogueRoleplayData && <DialogueRoleplayBoard data={exercise.dialogueRoleplayData} {...props} />}
        {exercise.mode === 'grammar_deepdive' && exercise.grammarDeepdiveData && <GrammarDeepdiveBoard data={exercise.grammarDeepdiveData} {...props} />}
        {exercise.mode === 'image_association' && exercise.imageAssociationData && <ImageAssociationBoard data={exercise.imageAssociationData} {...props} />}
      </div>
    </BlockShell>
  )
}
