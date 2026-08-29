import React, { useState, useMemo } from 'react'
import type { UiLanguage } from '../../../domain'
import { exercisesCopy } from '../../../i18n'
import type { HandwrittenMasteryData, HandwrittenQuizQuestion } from '../exercisesDomain'
import { Sparkles, Check, Award, ArrowRight, Lightbulb, Info, RotateCcw, CheckCircle2 } from 'lucide-react'

type HandwrittenCorrectionsProps = {
  data: HandwrittenMasteryData
  onCheckFinished?: (score: number, maxScore: number) => void
  isSubmitted?: boolean
  ui?: UiLanguage
}

export function HandwrittenCorrections({
  data,
  onCheckFinished,
  isSubmitted = false,
  ui = 'fr',
}: HandwrittenCorrectionsProps) {
  const t = exercisesCopy[ui] || exercisesCopy.fr
  const { coreTopic, goldenRule, lessonIntroduction, examples, quizQuestions } = data

  // Extract all questions either from quizQuestions or from practiceQuestion inside examples
  const allQuestions: HandwrittenQuizQuestion[] = useMemo(() => {
    if (quizQuestions && quizQuestions.length > 0) {
      return quizQuestions
    }
    const list: HandwrittenQuizQuestion[] = []
    examples.forEach((ex, idx) => {
      if (ex.practiceQuestion) {
        list.push({
          id: `q_${idx}`,
          prompt: ex.practiceQuestion.prompt,
          options: ex.practiceQuestion.options,
          correctIndex: ex.practiceQuestion.correctIndex,
          handwritingTip: ex.practiceQuestion.handwritingTip,
        })
      }
    })
    return list
  }, [quizQuestions, examples])

  const [isQuizModeActive, setIsQuizModeActive] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({})
  const [isCurrentQuestionAnswered, setIsCurrentQuestionAnswered] = useState(false)
  const [isQuizCompleted, setIsQuizCompleted] = useState(isSubmitted)

  const handleStartQuiz = () => {
    setIsQuizModeActive(true)
    setCurrentQuestionIndex(0)
    setUserAnswers({})
    setIsCurrentQuestionAnswered(false)
    setIsQuizCompleted(false)
  }

  const handleSelectOption = (optIdx: number) => {
    if (isCurrentQuestionAnswered) return
    setUserAnswers((prev) => ({ ...prev, [currentQuestionIndex]: optIdx }))
    setIsCurrentQuestionAnswered(true)
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < allQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1)
      setIsCurrentQuestionAnswered(userAnswers[currentQuestionIndex + 1] !== undefined)
    } else {
      // Finish quiz
      setIsQuizCompleted(true)
      const correctCount = allQuestions.reduce((acc, q, idx) => {
        return userAnswers[idx] === q.correctIndex ? acc + 1 : acc
      }, 0)
      onCheckFinished?.(correctCount, allQuestions.length)
    }
  }

  const totalQuestions = allQuestions.length
  const currentQ = allQuestions[currentQuestionIndex]
  const currentSelectedOpt = userAnswers[currentQuestionIndex]

  const finalScore = useMemo(() => {
    return allQuestions.reduce((acc, q, idx) => {
      return userAnswers[idx] === q.correctIndex ? acc + 1 : acc
    }, 0)
  }, [allQuestions, userAnswers])

  return (
    <div className="handwritten-mastery-container">
      {/* 1. Single Continuous Pedagogical Canvas / Lesson Note */}
      <article className="teacher-lesson-note">
        {/* Lesson Header */}
        <div className="lesson-note-header">
          <div className="lesson-badge-pill">
            <Sparkles size={13} />
            <span>{t.ruleTip}</span>
          </div>
          <h3 className="lesson-title">{coreTopic}</h3>
          {goldenRule && <p className="lesson-golden-rule">{goldenRule}</p>}
        </div>

        {lessonIntroduction && (
          <p className="lesson-intro-text">{lessonIntroduction}</p>
        )}

        {/* Breakdown of examples inside the same note */}
        <div className="lesson-examples-flow">
          {examples.map((ex, exIdx) => {
            return (
              <div key={ex.id || exIdx} className="lesson-example-block">
                {/* Visual Annotated Sentence Canvas */}
                <div className="sentence-callout-row">
                  <span className="handwritten-sentence">
                    {ex.badSentence.includes(ex.wrongSnippet) ? (
                      ex.badSentence.split(ex.wrongSnippet).map((part, pIdx, arr) => (
                        <React.Fragment key={pIdx}>
                          <span>{part}</span>
                          {pIdx < arr.length - 1 && (
                            <span className="handwritten-correction-token">
                              <span className="strikethrough-red">{ex.wrongSnippet}</span>
                              <span className="cursive-green-arrow">
                                <svg width="14" height="12" viewBox="0 0 14 12" className="arrow-svg">
                                  <path
                                    d="M 12 11 Q 7 10 2 2"
                                    stroke="#16a34a"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                </svg>
                                <span className="cursive-text">{ex.goodSnippet}</span>
                              </span>
                            </span>
                          )}
                        </React.Fragment>
                      ))
                    ) : (
                      <>
                        <span className="strikethrough-red">{ex.badSentence}</span>
                        <span className="cursive-green-arrow">
                          <span className="cursive-text">➔ {ex.correctedSentence}</span>
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {/* Why explanation */}
                <div className="lesson-why-box">
                  <div className="why-title-row">
                    <Lightbulb size={13} className="bulb-icon" />
                    <strong>{t.whyTitle}</strong>
                  </div>
                  <p className="why-text">{ex.whyExplanation}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom of lesson: Button to trigger the quiz step-by-step */}
        {totalQuestions > 0 && !isQuizModeActive && !isQuizCompleted && (
          <div className="lesson-quiz-launcher">
            <button
              type="button"
              className="start-quiz-btn"
              onClick={handleStartQuiz}
            >
              <Award size={16} />
              <span>{t.startQuiz} ({totalQuestions})</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </article>

      {/* 2. Interactive Step-by-Step Quiz Section */}
      {isQuizModeActive && !isQuizCompleted && currentQ && (
        <div className="step-quiz-container">
          <div className="step-quiz-header">
            <div className="quiz-progress-info">
              <span className="q-step-tag">
                Question {currentQuestionIndex + 1} sur {totalQuestions}
              </span>
              <div className="quiz-progress-track">
                <div
                  className="quiz-progress-bar"
                  style={{
                    width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="step-quiz-body">
            <h4 className="step-q-prompt">{currentQ.prompt}</h4>

            <div className="step-options-list">
              {currentQ.options.map((opt, optIdx) => {
                const isSelected = currentSelectedOpt === optIdx
                const isCorrect = isCurrentQuestionAnswered && optIdx === currentQ.correctIndex
                const isWrong = isCurrentQuestionAnswered && isSelected && !isCorrect

                return (
                  <button
                    key={optIdx}
                    type="button"
                    className={`step-opt-card ${isSelected ? 'selected' : ''} ${
                      isCorrect ? 'correct' : isWrong ? 'wrong' : ''
                    }`}
                    onClick={() => handleSelectOption(optIdx)}
                  >
                    <span className="step-opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                    <span className="step-opt-text">{opt}</span>
                  </button>
                )
              })}
            </div>

            {/* Instant feedback tip */}
            {isCurrentQuestionAnswered && (
              <div className="step-feedback-row">
                <div
                  className={`feedback-msg-pill ${
                    currentSelectedOpt === currentQ.correctIndex ? 'success' : 'error'
                  }`}
                >
                  <Info size={14} />
                  <span>
                    {currentSelectedOpt === currentQ.correctIndex
                      ? 'Exact ! '
                      : 'Attention ! '}
                    {currentQ.handwritingTip}
                  </span>
                </div>

                <button
                  type="button"
                  className="next-q-btn"
                  onClick={handleNextQuestion}
                >
                  <span>
                    {currentQuestionIndex < totalQuestions - 1
                      ? t.nextQuestion
                      : t.seeResults}
                  </span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Quiz Score Results Banner */}
      {isQuizCompleted && totalQuestions > 0 && (
        <div className="quiz-results-banner">
          <div className="results-left">
            <Award size={20} className="award-icon" />
            <div>
              <h4>{t.quizCompleted}</h4>
              <p>
                {t.scoreLabel} : <strong>{finalScore}</strong> / {totalQuestions} (
                {Math.round((finalScore / totalQuestions) * 100)}%)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="replay-quiz-btn"
            onClick={handleStartQuiz}
          >
            <RotateCcw size={13} />
            <span>{t.replayQuiz}</span>
          </button>
        </div>
      )}
    </div>
  )
}
