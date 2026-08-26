import React, { useState, useMemo } from 'react'
import type { SentenceScrambleData } from '../exercisesDomain'
import { Check, RotateCcw, Award, Lightbulb, Eraser } from 'lucide-react'

type SentenceScrambleBoardProps = {
  data: SentenceScrambleData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}

// Fisher-Yates shuffle with a seeded approach
function shuffleArray<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647
    const j = s % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function SentenceScrambleBoard({
  data,
  onCheckFinished,
  isSubmitted,
}: SentenceScrambleBoardProps) {
  const { items } = data

  // Build shuffled display orders for each item (deterministic per item)
  const shuffledIndices = useMemo(() => {
    const result: Record<number, number[]> = {}
    items.forEach((item, itemIdx) => {
      const indices = item.scrambledTokens.map((_, i) => i)
      // Create a seed from the item content so shuffle is stable across renders
      let seed = itemIdx + 7
      for (let k = 0; k < item.correctSentence.length; k++) {
        seed = (seed * 31 + item.correctSentence.charCodeAt(k)) % 2147483647
      }
      result[itemIdx] = shuffleArray(indices, seed)
    })
    return result
  }, [items])

  // State: For each item index, store array of chosen token indices
  const [selectedTokenIndices, setSelectedTokenIndices] = useState<Record<number, number[]>>({})

  const handleTileClick = (itemIdx: number, tokenIdx: number) => {
    if (isSubmitted) return
    const current = selectedTokenIndices[itemIdx] || []
    if (current.includes(tokenIdx)) {
      setSelectedTokenIndices((prev) => ({
        ...prev,
        [itemIdx]: current.filter((idx) => idx !== tokenIdx),
      }))
    } else {
      setSelectedTokenIndices((prev) => ({
        ...prev,
        [itemIdx]: [...current, tokenIdx],
      }))
    }
  }

  const handleClearSentence = (itemIdx: number) => {
    if (isSubmitted) return
    setSelectedTokenIndices((prev) => ({
      ...prev,
      [itemIdx]: [],
    }))
  }

  // Calculate score
  const correctCount = useMemo(() => {
    let count = 0
    items.forEach((item, itemIdx) => {
      const selectedIndices = selectedTokenIndices[itemIdx] || []
      const userSentence = selectedIndices.map((idx) => item.scrambledTokens[idx]).join(' ').trim()
      const cleanUser = userSentence.toLowerCase().replace(/[.,!?;:]/g, '')
      const cleanCorrect = item.correctSentence.toLowerCase().replace(/[.,!?;:]/g, '')
      if (cleanUser === cleanCorrect) {
        count++
      }
    })
    return count
  }, [items, selectedTokenIndices])

  const handleVerify = () => {
    onCheckFinished(correctCount, items.length)
  }

  const handleResetAll = () => {
    setSelectedTokenIndices({})
  }

  return (
    <div className="scramble-exercise-container">
      <div className="scramble-items-list">
        {items.map((item, itemIdx) => {
          const selectedIndices = selectedTokenIndices[itemIdx] || []
          const userSentence = selectedIndices.map((idx) => item.scrambledTokens[idx]).join(' ')
          const cleanUser = userSentence.toLowerCase().replace(/[.,!?;:]/g, '')
          const cleanCorrect = item.correctSentence.toLowerCase().replace(/[.,!?;:]/g, '')
          const isCorrect = isSubmitted && cleanUser === cleanCorrect
          const isWrong = isSubmitted && !isCorrect
          const displayOrder = shuffledIndices[itemIdx] || item.scrambledTokens.map((_, i) => i)

          return (
            <div
              key={item.id || itemIdx}
              className={`scramble-card ${isSubmitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
            >
              <div className="scramble-card-header">
                <span className="sentence-number">Phrase {itemIdx + 1} / {items.length}</span>
                {item.frenchTranslation && (
                  <span className="french-translation">🇫🇷 "{item.frenchTranslation}"</span>
                )}
              </div>

              {/* Assembled Sentence Drop Zone */}
              <div className="scramble-drop-zone">
                {selectedIndices.length === 0 ? (
                  <span className="placeholder-text">Clique sur les briques de mots pour ordonner la phrase…</span>
                ) : (
                  <div className="assembled-tiles-wrap">
                    {selectedIndices.map((tokenIdx, orderIdx) => (
                      <button
                        key={`${tokenIdx}_${orderIdx}`}
                        type="button"
                        className="tile-btn assembled"
                        onClick={() => handleTileClick(itemIdx, tokenIdx)}
                        title="Cliquer pour retirer"
                      >
                        <span>{item.scrambledTokens[tokenIdx]}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedIndices.length > 0 && !isSubmitted && (
                  <button
                    type="button"
                    className="clear-sentence-btn"
                    onClick={() => handleClearSentence(itemIdx)}
                    title="Effacer la phrase"
                  >
                    <Eraser size={13} />
                    <span>Effacer</span>
                  </button>
                )}
              </div>

              {/* Word Tokens Pool — displayed in shuffled order */}
              {!isSubmitted && (
                <div className="scramble-pool-wrap">
                  {displayOrder.map((tokenIdx) => {
                    const isUsed = selectedIndices.includes(tokenIdx)
                    return (
                      <button
                        key={tokenIdx}
                        type="button"
                        className={`tile-btn pool ${isUsed ? 'used' : ''}`}
                        disabled={isUsed}
                        onClick={() => handleTileClick(itemIdx, tokenIdx)}
                      >
                        {item.scrambledTokens[tokenIdx]}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Feedback & Corrections when submitted */}
              {isSubmitted && (
                <div className="scramble-feedback-area">
                  {!isCorrect && (
                    <div className="expected-sentence-row">
                      <span className="lbl">Ordre attendu :</span>
                      <strong className="val">{item.correctSentence}</strong>
                    </div>
                  )}
                  {item.grammarRuleTip && (
                    <div className="grammar-tip-row">
                      <Lightbulb size={13} className="tip-icon" />
                      <span>{item.grammarRuleTip}</span>
                    </div>
                  )}
                  {item.explanation && (
                    <p className="item-explanation">✍️ {item.explanation}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer Controls */}
      <div className="scramble-footer-row">
        {!isSubmitted ? (
          <div className="scramble-actions">
            <button type="button" className="action-btn secondary" onClick={handleResetAll}>
              <RotateCcw size={13} /> Recommencer tout
            </button>
            <button type="button" className="action-btn primary" onClick={handleVerify}>
              <Check size={14} /> Vérifier mes phrases
            </button>
          </div>
        ) : (
          <div className="scramble-score-pill">
            <Award size={16} />
            <span>
              Score : {correctCount} / {items.length} phrases correctes (
              {Math.round((correctCount / (items.length || 1)) * 100)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
