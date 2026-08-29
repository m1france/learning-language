import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { UiLanguage } from '../../../domain'
import { exercisesCopy } from '../../../i18n'
import type { MatchPairsData } from '../exercisesDomain'
import { Check, RotateCcw, HelpCircle, Award, Sparkles } from 'lucide-react'

type MatchPairsBoardProps = {
  data: MatchPairsData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
  ui?: UiLanguage
}

export function MatchPairsBoard({ data, onCheckFinished, isSubmitted, ui = 'fr' }: MatchPairsBoardProps) {
  const t = exercisesCopy[ui] || exercisesCopy.fr
  const { pairs, leftCategoryLabel, rightCategoryLabel } = data

  const shuffledRightItems = useMemo(() => {
    return [...pairs].sort(() => Math.random() - 0.5)
  }, [pairs])

  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null)
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null)
  const [userMatches, setUserMatches] = useState<Record<string, string>>({})
  const [showHints, setShowHints] = useState(false)

  // Refs for SVG line drawing
  const containerRef = useRef<HTMLDivElement>(null)
  const leftRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const rightRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [linePositions, setLinePositions] = useState<
    { x1: number; y1: number; x2: number; y2: number; leftId: string; rightId: string }[]
  >([])

  // Recalculate line positions when matches change
  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const lines: typeof linePositions = []

      Object.entries(userMatches).forEach(([leftId, rightId]) => {
        const leftEl = leftRefs.current[leftId]
        const rightEl = rightRefs.current[rightId]
        if (leftEl && rightEl) {
          const leftRect = leftEl.getBoundingClientRect()
          const rightRect = rightEl.getBoundingClientRect()
          lines.push({
            x1: leftRect.right - containerRect.left,
            y1: leftRect.top + leftRect.height / 2 - containerRect.top,
            x2: rightRect.left - containerRect.left,
            y2: rightRect.top + rightRect.height / 2 - containerRect.top,
            leftId,
            rightId,
          })
        }
      })

      setLinePositions(lines)
    }

    updateLines()
    window.addEventListener('resize', updateLines)
    return () => window.removeEventListener('resize', updateLines)
  }, [userMatches])

  const handleLeftClick = (leftId: string) => {
    if (isSubmitted) return
    if (selectedRightId) {
      setUserMatches((prev) => ({ ...prev, [leftId]: selectedRightId }))
      setSelectedLeftId(null)
      setSelectedRightId(null)
    } else {
      setSelectedLeftId(selectedLeftId === leftId ? null : leftId)
    }
  }

  const handleRightClick = (rightId: string) => {
    if (isSubmitted) return
    if (selectedLeftId) {
      setUserMatches((prev) => ({ ...prev, [selectedLeftId]: rightId }))
      setSelectedLeftId(null)
      setSelectedRightId(null)
    } else {
      setSelectedRightId(selectedRightId === rightId ? null : rightId)
    }
  }

  const handleUnmatch = (leftId: string) => {
    if (isSubmitted) return
    setUserMatches((prev) => {
      const next = { ...prev }
      delete next[leftId]
      return next
    })
  }

  const correctCount = useMemo(() => {
    let count = 0
    pairs.forEach((p) => {
      if (userMatches[p.id] === p.id) count++
    })
    return count
  }, [pairs, userMatches])

  const handleVerify = () => {
    onCheckFinished(correctCount, pairs.length)
  }

  const handleReset = () => {
    setUserMatches({})
    setSelectedLeftId(null)
    setSelectedRightId(null)
  }

  return (
    <div className="match-pairs-exercise-container" ref={containerRef}>
      <div className="match-columns-header">
        <span className="col-title">{leftCategoryLabel || 'Élément A'}</span>
        <span className="col-title">{rightCategoryLabel || 'Élément B correspondant'}</span>
      </div>

      <div className="match-columns-grid">
        {/* SVG Lines Overlay */}
        <svg className="match-lines-svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          {linePositions.map((line, idx) => {
            const isCorrect = isSubmitted && line.leftId === line.rightId
            const isWrong = isSubmitted && line.leftId !== line.rightId
            return (
              <line
                key={idx}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={isCorrect ? '#22c55e' : isWrong ? '#ef4444' : '#aaa'}
                strokeWidth={isCorrect ? 2.5 : isWrong ? 1.5 : 1.8}
                strokeDasharray={isWrong ? '6 4' : 'none'}
                opacity={isWrong ? 0.4 : 0.8}
                strokeLinecap="round"
              />
            )
          })}

          {/* Show correct lines in green after submission for missed pairs */}
          {isSubmitted &&
            pairs
              .filter((p) => userMatches[p.id] !== p.id)
              .map((p) => {
                const leftEl = leftRefs.current[p.id]
                const rightEl = rightRefs.current[p.id]
                if (!leftEl || !rightEl || !containerRef.current) return null
                const containerRect = containerRef.current.getBoundingClientRect()
                const leftRect = leftEl.getBoundingClientRect()
                const rightRect = rightEl.getBoundingClientRect()
                return (
                  <line
                    key={`correct_${p.id}`}
                    x1={leftRect.right - containerRect.left}
                    y1={leftRect.top + leftRect.height / 2 - containerRect.top}
                    x2={rightRect.left - containerRect.left}
                    y2={rightRect.top + rightRect.height / 2 - containerRect.top}
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    opacity={0.6}
                    strokeLinecap="round"
                  />
                )
              })}
        </svg>

        {/* Left Column */}
        <div className="match-col left">
          {pairs.map((item) => {
            const matchedRightId = userMatches[item.id]
            const isMatched = !!matchedRightId
            const isSelected = selectedLeftId === item.id
            const isCorrect = isSubmitted && matchedRightId === item.id
            const isWrong = isSubmitted && isMatched && matchedRightId !== item.id

            return (
              <div
                key={item.id}
                ref={(el) => { leftRefs.current[item.id] = el }}
                className={`match-item left ${isSelected ? 'selected' : ''} ${
                  isMatched ? 'matched' : ''
                } ${isSubmitted ? (isCorrect ? 'correct' : isWrong ? 'wrong' : 'missed') : ''}`}
                onClick={() => (isMatched && !isSubmitted ? handleUnmatch(item.id) : handleLeftClick(item.id))}
              >
                <div className="match-node-dot" />
                <div className="match-item-content">
                  <span className="match-text">{item.left}</span>
                  {item.leftContext && <span className="match-context">{item.leftContext}</span>}
                </div>
                {isMatched && !isSubmitted && (
                  <span className="unmatch-hint" title="Cliquer pour dissocier">✕</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Right Column */}
        <div className="match-col right">
          {shuffledRightItems.map((item) => {
            const matchedLeftEntry = Object.entries(userMatches).find(([, rId]) => rId === item.id)
            const matchedLeftId = matchedLeftEntry?.[0]
            const isMatched = !!matchedLeftId
            const isSelected = selectedRightId === item.id
            const isCorrect = isSubmitted && matchedLeftId === item.id
            const isWrong = isSubmitted && isMatched && matchedLeftId !== item.id

            return (
              <div
                key={item.id}
                ref={(el) => { rightRefs.current[item.id] = el }}
                className={`match-item right ${isSelected ? 'selected' : ''} ${
                  isMatched ? 'matched' : ''
                } ${isSubmitted ? (isCorrect ? 'correct' : isWrong ? 'wrong' : 'missed') : ''}`}
                onClick={() => (isMatched && !isSubmitted ? handleUnmatch(matchedLeftId!) : handleRightClick(item.id))}
              >
                <div className="match-node-dot" />
                <div className="match-item-content">
                  <span className="match-text">{item.right}</span>
                  {item.rightContext && <span className="match-context">{item.rightContext}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Explanations List when submitted */}
      {isSubmitted && (
        <div className="match-explanations-list">
          <h5 className="expl-heading">{t.ruleTip} :</h5>
          {pairs.map((p) => {
            const isCorrect = userMatches[p.id] === p.id
            return (
              <div key={p.id} className={`match-expl-item ${isCorrect ? 'correct' : 'wrong'}`}>
                <div className="expl-pair">
                  <strong>{p.left}</strong> ➔ <span>{p.right}</span>
                </div>
                <p className="expl-desc">{p.explanation}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer Controls */}
      <div className="match-footer-row">
        <button
          type="button"
          className="hint-toggle-pill"
          onClick={() => setShowHints(!showHints)}
        >
          <Sparkles size={13} />
          <span>{showHints ? t.hideHints : t.showHints}</span>
        </button>

        {!isSubmitted ? (
          <div className="match-actions">
            <button type="button" className="action-btn secondary" onClick={handleReset}>
              <RotateCcw size={13} /> {t.resetBtn}
            </button>
            <button type="button" className="action-btn primary" onClick={handleVerify}>
              <Check size={14} /> {t.checkBtn}
            </button>
          </div>
        ) : (
          <div className="match-score-pill">
            <Award size={16} />
            <span>
              {t.scoreLabel} : {correctCount} / {pairs.length} (
              {Math.round((correctCount / (pairs.length || 1)) * 100)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
