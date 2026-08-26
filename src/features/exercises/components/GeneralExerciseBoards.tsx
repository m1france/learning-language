import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type {
  FillInBlanksData,
  ErrorHunterData,
  DialogueRoleplayData,
  GrammarDeepdiveData,
  ImageAssociationData,
} from '../exercisesDomain'
import { Check, RotateCcw, HelpCircle, Award, Lightbulb, ChevronDown, ChevronUp, GripVertical, Sparkles } from 'lucide-react'

// ==========================================
// 1. Fill in the Blanks Board (Accordion + DnD)
// ==========================================
export function FillInBlanksBoard({
  data,
  onCheckFinished,
  isSubmitted,
}: {
  data: FillInBlanksData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}) {
  const { items, wordBank } = data
  const [userInputs, setUserInputs] = useState<Record<string, string>>({})
  const [showHints, setShowHints] = useState(false)
  const [isBankOpen, setIsBankOpen] = useState(false)
  const [draggedWord, setDraggedWord] = useState<string | null>(null)

  const handleInputChange = (id: string, val: string) => {
    if (isSubmitted) return
    setUserInputs((prev) => ({ ...prev, [id]: val }))
  }

  // Drag & drop handlers
  const handleDragStart = (word: string) => {
    setDraggedWord(word)
  }

  const handleDrop = (targetId: string) => {
    if (!draggedWord || isSubmitted) return
    const existingWord = userInputs[targetId]?.trim()

    // If the target already has a word, find the source slot (if dragging from another slot)
    const sourceSlotId = Object.entries(userInputs).find(
      ([, val]) => val === draggedWord,
    )?.[0]

    const nextInputs = { ...userInputs }
    nextInputs[targetId] = draggedWord

    // If there was a word in the target and we're swapping from another slot
    if (existingWord && sourceSlotId && sourceSlotId !== targetId) {
      nextInputs[sourceSlotId] = existingWord
    } else if (sourceSlotId && sourceSlotId !== targetId) {
      nextInputs[sourceSlotId] = ''
    }

    setUserInputs(nextInputs)
    setDraggedWord(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  // Check which bank words are already used
  const usedWords = useMemo(() => {
    const used = new Set<string>()
    Object.values(userInputs).forEach((val) => {
      if (val?.trim()) used.add(val.trim())
    })
    return used
  }, [userInputs])

  const correctCount = useMemo(() => {
    let count = 0
    items.forEach((item) => {
      const userVal = (userInputs[item.id] || '').trim().toLowerCase()
      const expected = item.expectedAnswer.trim().toLowerCase()
      const alts = (item.acceptableAlternatives || []).map((a) => a.trim().toLowerCase())
      if (userVal === expected || alts.includes(userVal)) {
        count++
      }
    })
    return count
  }, [items, userInputs])

  const handleVerify = () => {
    onCheckFinished(correctCount, items.length)
  }

  const handleReset = () => {
    setUserInputs({})
  }

  return (
    <div className="blanks-exercise-container">
      {/* Accordion Word Bank */}
      {wordBank && wordBank.length > 0 && !isSubmitted && (
        <div className="wordbank-accordion">
          <button
            type="button"
            className={`wordbank-accordion-toggle ${isBankOpen ? 'open' : ''}`}
            onClick={() => setIsBankOpen(!isBankOpen)}
          >
            <span className="accordion-label">Banque de mots</span>
            <span className="accordion-badge">{wordBank.length} mots</span>
            {isBankOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isBankOpen && (
            <div className="wordbank-chips-tray">
              {wordBank.map((word, idx) => {
                const isUsed = usedWords.has(word)
                return (
                  <div
                    key={idx}
                    className={`wordbank-chip draggable ${isUsed ? 'used' : ''}`}
                    draggable={!isUsed}
                    onDragStart={() => handleDragStart(word)}
                    onDragEnd={() => setDraggedWord(null)}
                  >
                    <GripVertical size={12} className="grip-icon" />
                    <span>{word}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="blanks-list">
        {items.map((item, idx) => {
          const userVal = userInputs[item.id] || ''
          const expected = item.expectedAnswer
          const alts = (item.acceptableAlternatives || []).map((a) => a.trim().toLowerCase())
          const isCorrect =
            isSubmitted &&
            (userVal.trim().toLowerCase() === expected.trim().toLowerCase() ||
              alts.includes(userVal.trim().toLowerCase()))
          const isWrong = isSubmitted && !isCorrect

          return (
            <div
              key={item.id || idx}
              className={`blank-sentence-card ${isSubmitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
            >
              <div className="sentence-content">
                <span className="item-num">{idx + 1}.</span>
                <span className="before-text">{item.beforeText}</span>

                {/* Text input mode (bank closed) vs drop zone mode (bank open) */}
                {isBankOpen && !isSubmitted ? (
                  <span
                    className={`inline-drop-zone ${userVal ? 'filled' : ''} ${draggedWord ? 'drop-ready' : ''}`}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(item.id)}
                    draggable={!!userVal}
                    onDragStart={() => userVal && handleDragStart(userVal)}
                    style={{ minWidth: `${Math.max(6, expected.length + 3)}ch` }}
                  >
                    {userVal || '…'}
                  </span>
                ) : (
                  <input
                    type="text"
                    className={`inline-blank-input ${isSubmitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
                    value={isSubmitted ? expected : userVal}
                    disabled={isSubmitted}
                    placeholder="……"
                    onChange={(e) => handleInputChange(item.id, e.target.value)}
                    style={{ width: `${Math.max(6, expected.length + 3)}ch` }}
                  />
                )}

                <span className="after-text">{item.afterText}</span>
                {isSubmitted && !isCorrect && userVal && (
                  <span className="user-wrong-tag" title="Ta réponse">({userVal})</span>
                )}
              </div>

              {showHints && item.hint && !isSubmitted && (
                <div className="blank-hint-pill">
                  💡 Indice : {item.hint}
                </div>
              )}

              {isSubmitted && (
                <div className="blank-feedback-box">
                  <p className="expl-text">✍️ {item.explanation}</p>
                  {item.wrongExamplesWithWhy && item.wrongExamplesWithWhy.length > 0 && (
                    <div className="wrong-examples-grid">
                      {item.wrongExamplesWithWhy.map((w, wIdx) => (
                        <div key={wIdx} className="wrong-ex-pill">
                          <span className="del-text">❌ {w.wrong}</span>
                          <span className="why-text">➔ {w.why}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="blanks-footer">
        <button
          type="button"
          className="hint-toggle-pill"
          onClick={() => setShowHints(!showHints)}
        >
          <Sparkles size={13} />
          <span>{showHints ? 'Masquer indices' : 'Indices'}</span>
        </button>

        {!isSubmitted ? (
          <div className="blanks-actions">
            <button type="button" className="action-btn secondary" onClick={handleReset}>
              <RotateCcw size={13} /> Recommencer
            </button>
            <button type="button" className="action-btn primary" onClick={handleVerify}>
              <Check size={14} /> Vérifier mes réponses
            </button>
          </div>
        ) : (
          <div className="blanks-score-pill">
            <Award size={16} />
            <span>
              Score : {correctCount} / {items.length} réponses exactes (
              {Math.round((correctCount / (items.length || 1)) * 100)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ==========================================
// 2. Error Hunter Board
// ==========================================
export function ErrorHunterBoard({
  data,
  onCheckFinished,
  isSubmitted,
}: {
  data: ErrorHunterData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}) {
  const { segments, totalErrorsCount } = data
  const [clickedSegmentIndices, setClickedSegmentIndices] = useState<number[]>([])

  const handleSegmentClick = (idx: number) => {
    if (isSubmitted) return
    setClickedSegmentIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    )
  }

  const caughtErrorsCount = useMemo(() => {
    let count = 0
    clickedSegmentIndices.forEach((idx) => {
      if (segments[idx]?.isError) count++
    })
    return count
  }, [clickedSegmentIndices, segments])

  const falseAlarmsCount = useMemo(() => {
    let count = 0
    clickedSegmentIndices.forEach((idx) => {
      if (!segments[idx]?.isError) count++
    })
    return count
  }, [clickedSegmentIndices, segments])

  const handleVerify = () => {
    const finalScore = Math.max(0, caughtErrorsCount - falseAlarmsCount)
    onCheckFinished(finalScore, totalErrorsCount)
  }

  return (
    <div className="error-hunter-container">
      <div className="hunter-instructions-banner">
        <span>🔍 Clique sur les mots ou expressions qui comportent une faute :</span>
        <span className="hunter-counter-badge">
          {clickedSegmentIndices.length} sélectionné(s) / {totalErrorsCount} pièges
        </span>
      </div>

      <div className="hunter-text-canvas">
        <p className="hunter-paragraph">
          {segments.map((seg, idx) => {
            const isClicked = clickedSegmentIndices.includes(idx)
            const isError = seg.isError

            let statusClass = ''
            if (isSubmitted) {
              if (isError && isClicked) statusClass = 'caught'
              else if (isError && !isClicked) statusClass = 'missed'
              else if (!isError && isClicked) statusClass = 'false-alarm'
            } else if (isClicked) {
              statusClass = 'active-clicked'
            }

            return (
              <span
                key={idx}
                className={`hunter-token ${statusClass}`}
                onClick={() => handleSegmentClick(idx)}
              >
                {seg.text}
                {isSubmitted && isError && seg.correctedWord && (
                  <span className="hunter-correction-tag">➔ {seg.correctedWord}</span>
                )}
              </span>
            )
          })}
        </p>
      </div>

      {isSubmitted && (
        <div className="hunter-explanations-pane">
          <h5>Détail des erreurs à repérer :</h5>
          <div className="hunter-expl-list">
            {segments
              .filter((s) => s.isError)
              .map((seg, idx) => (
                <div key={idx} className="hunter-expl-card">
                  <div className="expl-words">
                    <span className="wrong-strike">❌ {seg.wrongWord}</span>
                    <span className="good-ins">✅ {seg.correctedWord}</span>
                  </div>
                  {seg.explanation && <p className="expl-msg">{seg.explanation}</p>}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="hunter-footer">
        {!isSubmitted ? (
          <div className="hunter-actions">
            <button
              type="button"
              className="action-btn secondary"
              onClick={() => setClickedSegmentIndices([])}
            >
              <RotateCcw size={13} /> Réinitialiser
            </button>
            <button type="button" className="action-btn primary" onClick={handleVerify}>
              <Check size={14} /> Vérifier ma chasse aux erreurs
            </button>
          </div>
        ) : (
          <div className="hunter-score-pill">
            <Award size={16} />
            <span>
              Score : {caughtErrorsCount} / {totalErrorsCount} pièges trouvés (
              {falseAlarmsCount > 0 ? `${falseAlarmsCount} faux signalement(s)` : 'Sans faute !'})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ==========================================
// 3. Dialogue & Roleplay Board
// ==========================================
export function DialogueRoleplayBoard({
  data,
  onCheckFinished,
  isSubmitted,
}: {
  data: DialogueRoleplayData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}) {
  const { scenarioTitle, contextSetting, turns } = data
  const [selectedChoices, setSelectedChoices] = useState<Record<number, string>>({})

  const handleChoiceSelect = (turnIdx: number, choiceId: string) => {
    if (isSubmitted) return
    setSelectedChoices((prev) => ({ ...prev, [turnIdx]: choiceId }))
  }

  const optimalCount = useMemo(() => {
    let count = 0
    turns.forEach((turn, idx) => {
      const chosenId = selectedChoices[idx]
      const chosen = turn.userChoices.find((c) => c.id === chosenId)
      if (chosen?.isOptimal) count++
    })
    return count
  }, [turns, selectedChoices])

  const handleVerify = () => {
    onCheckFinished(optimalCount, turns.length)
  }

  return (
    <div className="roleplay-exercise-container">
      <div className="roleplay-scenario-banner">
        <span className="scenario-icon">🎭</span>
        <div>
          <h4>{scenarioTitle}</h4>
          <p>{contextSetting}</p>
        </div>
      </div>

      <div className="roleplay-turns-list">
        {turns.map((turn, turnIdx) => {
          const chosenId = selectedChoices[turnIdx]

          return (
            <div key={turnIdx} className="roleplay-turn-block">
              {/* Other speaker bubble */}
              <div className="speaker-bubble-row">
                <div className="speaker-avatar">{turn.speakerAvatar || '👤'}</div>
                <div className="speaker-bubble">
                  <span className="speaker-name">{turn.speaker}</span>
                  <p className="speech-text">{turn.text}</p>
                </div>
              </div>

              {/* User choices */}
              <div className="user-reply-choices">
                <span className="reply-prompt-lbl">Ta réponse :</span>
                <div className="choices-buttons-stack">
                  {turn.userChoices.map((choice) => {
                    const isSelected = chosenId === choice.id
                    const isOptimal = choice.isOptimal
                    const isCorrect = isSubmitted && isSelected && isOptimal
                    const isWrong = isSubmitted && isSelected && !isOptimal

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        className={`reply-choice-btn ${isSelected ? 'selected' : ''} ${
                          isCorrect ? 'correct' : isWrong ? 'wrong' : ''
                        }`}
                        onClick={() => handleChoiceSelect(turnIdx, choice.id)}
                      >
                        <span className="radio-bullet" />
                        <span className="choice-text">{choice.text}</span>
                      </button>
                    )
                  })}
                </div>

                {isSubmitted && (
                  <div className="roleplay-turn-feedback">
                    {turn.userChoices.find((c) => c.id === chosenId)?.feedback && (
                      <p className="feedback-msg">
                        💬 {turn.userChoices.find((c) => c.id === chosenId)?.feedback}
                      </p>
                    )}
                    {turn.userChoices.find((c) => c.id === chosenId)?.handwritingNote && (
                      <p className="handwriting-note">
                        ✍️ {turn.userChoices.find((c) => c.id === chosenId)?.handwritingNote}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="roleplay-footer">
        {!isSubmitted ? (
          <button type="button" className="action-btn primary large" onClick={handleVerify}>
            <Check size={15} /> Valider le dialogue
          </button>
        ) : (
          <div className="roleplay-score-pill">
            <Award size={16} />
            <span>
              Score : {optimalCount} / {turns.length} répliques optimales (
              {Math.round((optimalCount / (turns.length || 1)) * 100)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ==========================================
// 4. Grammar Deep Dive Board (Step-by-step quiz)
// ==========================================
export function GrammarDeepdiveBoard({
  data,
  onCheckFinished,
  isSubmitted,
}: {
  data: GrammarDeepdiveData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}) {
  const { ruleTitle, ruleExplanation, summaryTable, commonMistakes, questions } = data
  const [isQuizActive, setIsQuizActive] = useState(false)
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({})
  const [answeredCurrent, setAnsweredCurrent] = useState(false)
  const [isQuizCompleted, setIsQuizCompleted] = useState(false)

  const handleSelect = (qId: string, optIdx: number) => {
    if (answeredCurrent || isSubmitted) return
    setSelectedAnswers((prev) => ({ ...prev, [qId]: optIdx }))
    setAnsweredCurrent(true)
  }

  const handleNextQuestion = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1)
      setAnsweredCurrent(false)
    } else {
      // Quiz complete
      setIsQuizCompleted(true)
      const score = questions.filter((q) => selectedAnswers[q.id] === q.correctIndex).length
      onCheckFinished(score, questions.length)
    }
  }

  const handleRestartQuiz = () => {
    setCurrentQuestionIdx(0)
    setSelectedAnswers({})
    setAnsweredCurrent(false)
    setIsQuizCompleted(false)
    setIsQuizActive(true)
  }

  const score = useMemo(() => {
    return questions.filter((q) => selectedAnswers[q.id] === q.correctIndex).length
  }, [questions, selectedAnswers])

  const currentQ = questions[currentQuestionIdx]
  const progressPercent = questions.length > 0
    ? Math.round(((currentQuestionIdx + (answeredCurrent ? 1 : 0)) / questions.length) * 100)
    : 0

  return (
    <div className="grammar-deepdive-container">
      {/* Rule Overview (Always visible) */}
      <div className="grammar-rule-hero">
        <h4 className="rule-hero-title">📐 {ruleTitle}</h4>
        <p className="rule-hero-desc">{ruleExplanation}</p>
      </div>

      {summaryTable && summaryTable.headers && (
        <div className="grammar-summary-table-wrap">
          <table className="grammar-table">
            <thead>
              <tr>
                {summaryTable.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryTable.rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {commonMistakes && commonMistakes.length > 0 && (
        <div className="common-mistakes-card">
          <h5>⚠️ Pièges fréquents à éviter :</h5>
          <div className="mistakes-grid">
            {commonMistakes.map((m, idx) => (
              <div key={idx} className="mistake-item">
                <span className="bad-phrase">❌ {m.mistake}</span>
                <span className="good-phrase">✅ {m.correction}</span>
                <span className="why-phrase">({m.why})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz Section */}
      {!isQuizActive && !isQuizCompleted && !isSubmitted && (
        <div className="grammar-quiz-launch">
          <button
            type="button"
            className="action-btn primary large"
            onClick={() => setIsQuizActive(true)}
          >
            <Sparkles size={15} /> Faire le quiz ({questions.length} questions)
          </button>
        </div>
      )}

      {isQuizActive && !isQuizCompleted && (
        <div className="grammar-step-quiz">
          {/* Progress bar */}
          <div className="quiz-progress-row">
            <span className="quiz-progress-label">
              Question {currentQuestionIdx + 1} sur {questions.length}
            </span>
            <div className="quiz-progress-bar-bg">
              <div
                className="quiz-progress-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Current Question */}
          {currentQ && (
            <div className="quiz-question-card">
              <p className="quiz-question-prompt">{currentQ.prompt}</p>

              <div className="quiz-options-stack">
                {currentQ.options.map((opt, optIdx) => {
                  const isSelected = selectedAnswers[currentQ.id] === optIdx
                  const isThisCorrect = answeredCurrent && optIdx === currentQ.correctIndex
                  const isThisWrong = answeredCurrent && isSelected && optIdx !== currentQ.correctIndex

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      className={`quiz-opt-btn ${isSelected ? 'selected' : ''} ${
                        isThisCorrect ? 'correct' : isThisWrong ? 'wrong' : ''
                      }`}
                      onClick={() => handleSelect(currentQ.id, optIdx)}
                      disabled={answeredCurrent}
                    >
                      <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                      <span>{opt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Feedback after answering */}
              {answeredCurrent && (
                <div className="quiz-step-feedback">
                  <p className="quiz-expl">✍️ {currentQ.explanation}</p>
                  {currentQ.handwritingAdvice && (
                    <span className="quiz-handwriting-pill">💡 {currentQ.handwritingAdvice}</span>
                  )}
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={handleNextQuestion}
                  >
                    {currentQuestionIdx < questions.length - 1 ? 'Question suivante →' : 'Voir mes résultats'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quiz Results */}
      {isQuizCompleted && (
        <div className="grammar-quiz-results">
          <div className="quiz-score-banner">
            <Award size={28} />
            <div className="score-info">
              <span className="score-fraction">{score} / {questions.length}</span>
              <span className="score-percentage">
                {Math.round((score / (questions.length || 1)) * 100)}% de bonnes réponses
              </span>
            </div>
          </div>
          <button
            type="button"
            className="action-btn secondary"
            onClick={handleRestartQuiz}
          >
            <RotateCcw size={13} /> Rejouer le quiz
          </button>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 5. Image & Card Association Board (Unsplash)
// ==========================================
export function ImageAssociationBoard({
  data,
  onCheckFinished,
  isSubmitted,
}: {
  data: ImageAssociationData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}) {
  const { items } = data
  const [userSelections, setUserSelections] = useState<Record<string, string>>({})

  const handleSelect = (itemId: string, exp: string) => {
    if (isSubmitted) return
    setUserSelections((prev) => ({ ...prev, [itemId]: exp }))
  }

  const score = useMemo(() => {
    let count = 0
    items.forEach((item) => {
      if (userSelections[item.id] === item.correctExpression) count++
    })
    return count
  }, [items, userSelections])

  const handleVerify = () => {
    onCheckFinished(score, items.length)
  }

  // Build Unsplash image URL from search query
  const getImageUrl = (item: typeof items[0]) => {
    const query = item.imageSearchQuery || item.visualScenario || item.correctExpression
    const cleanQuery = encodeURIComponent(query.replace(/[^\w\s]/g, '').trim().slice(0, 60))
    return `https://source.unsplash.com/400x300/?${cleanQuery}`
  }

  return (
    <div className="image-association-container">
      <div className="image-cards-grid">
        {items.map((item, idx) => {
          const allOptions = useMemo(
            () => [item.correctExpression, ...item.distractorExpressions].sort(() => Math.random() - 0.5),
            [item.correctExpression, item.distractorExpressions],
          )
          const userExp = userSelections[item.id]
          const isCorrect = isSubmitted && userExp === item.correctExpression
          const isWrong = isSubmitted && userExp && !isCorrect

          return (
            <article
              key={item.id || idx}
              className={`visual-card-modern ${isSubmitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
            >
              {/* Image from Unsplash */}
              <div className="card-image-frame">
                <img
                  src={getImageUrl(item)}
                  alt={item.visualScenario}
                  className="card-unsplash-img"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
                <div className="card-image-fallback">{item.emojiOrIcon || '🖼️'}</div>
              </div>

              <p className="scenario-desc">{item.visualScenario}</p>

              <div className="expressions-options-list">
                {[item.correctExpression, ...item.distractorExpressions]
                  .sort()
                  .map((opt, oIdx) => {
                    const isSelected = userExp === opt
                    const isThisCorrect = isSubmitted && opt === item.correctExpression

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        className={`exp-opt-btn ${isSelected ? 'selected' : ''} ${
                          isThisCorrect ? 'correct' : isSubmitted && isSelected ? 'wrong' : ''
                        }`}
                        onClick={() => handleSelect(item.id, opt)}
                      >
                        {opt}
                      </button>
                    )
                  })}
              </div>

              {isSubmitted && item.explanation && (
                <div className="card-expl-footer">
                  <p>✍️ {item.explanation}</p>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="image-assoc-footer">
        {!isSubmitted ? (
          <button type="button" className="action-btn primary large" onClick={handleVerify}>
            <Check size={15} /> Vérifier mes associations
          </button>
        ) : (
          <div className="image-score-pill">
            <Award size={16} />
            <span>
              Score : {score} / {items.length} associations exactes (
              {Math.round((score / (items.length || 1)) * 100)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
