import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { CrosswordData, CrosswordClue } from '../exercisesDomain'
import { Check, RotateCcw, Award, Sparkles, HelpCircle, ArrowRight, ArrowDown } from 'lucide-react'

type CrosswordBoardProps = {
  data: CrosswordData
  onCheckFinished: (score: number, maxScore: number) => void
  isSubmitted: boolean
}

export function CrosswordBoard({ data, onCheckFinished, isSubmitted }: CrosswordBoardProps) {
  const { gridRows, gridCols, clues } = data

  // Build grid matrix
  const { letterMatrix, cellNumberMatrix, activeCellMap, cellCluesMap } = useMemo(() => {
    const letters: (string | null)[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(null),
    )
    const numbers: (number | null)[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(null),
    )
    const activeMap: boolean[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(false),
    )
    const cluesMap: Record<string, { across?: CrosswordClue; down?: CrosswordClue }> = {}

    clues.forEach((clue) => {
      const word = clue.answer.toUpperCase().replace(/[^A-Z]/g, '')
      if (clue.row < gridRows && clue.col < gridCols) {
        numbers[clue.row][clue.col] = clue.number
      }

      for (let i = 0; i < word.length; i++) {
        const r = clue.direction === 'across' ? clue.row : clue.row + i
        const c = clue.direction === 'across' ? clue.col + i : clue.col
        if (r < gridRows && c < gridCols) {
          letters[r][c] = word[i]
          activeMap[r][c] = true

          const key = `${r}_${c}`
          if (!cluesMap[key]) cluesMap[key] = {}
          if (clue.direction === 'across') cluesMap[key].across = clue
          else cluesMap[key].down = clue
        }
      }
    })

    return {
      letterMatrix: letters,
      cellNumberMatrix: numbers,
      activeCellMap: activeMap,
      cellCluesMap: cluesMap,
    }
  }, [gridRows, gridCols, clues])

  // User input grid
  const [userGrid, setUserGrid] = useState<string[][]>(() =>
    Array.from({ length: gridRows }, () => Array(gridCols).fill('')),
  )
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(() => {
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (activeCellMap[r][c]) return { row: r, col: c }
      }
    }
    return null
  })
  const [activeDirection, setActiveDirection] = useState<'across' | 'down'>('across')
  const [showHints, setShowHints] = useState(false)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)

  const cellInputRefs = useRef<(HTMLInputElement | null)[][]>([])

  // Calculate score
  const totalActiveLetters = useMemo(() => {
    let count = 0
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (activeCellMap[r][c]) count++
      }
    }
    return count
  }, [gridRows, gridCols, activeCellMap])

  const correctLettersCount = useMemo(() => {
    let count = 0
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (
          activeCellMap[r][c] &&
          userGrid[r]?.[c]?.toUpperCase() === letterMatrix[r]?.[c]?.toUpperCase()
        ) {
          count++
        }
      }
    }
    return count
  }, [gridRows, gridCols, activeCellMap, userGrid, letterMatrix])

  const handleCellChange = (r: number, c: number, value: string) => {
    if (isSubmitted) return
    const char = value.slice(-1).toUpperCase()
    const nextGrid = userGrid.map((row) => [...row])
    nextGrid[r][c] = char
    setUserGrid(nextGrid)

    if (char && char.match(/[A-Z]/)) {
      moveToNextCell(r, c, activeDirection)
    }
  }

  const moveToNextCell = (r: number, c: number, dir: 'across' | 'down') => {
    const nextR = dir === 'down' ? r + 1 : r
    const nextC = dir === 'across' ? c + 1 : c
    if (nextR < gridRows && nextC < gridCols && activeCellMap[nextR][nextC]) {
      setSelectedCell({ row: nextR, col: nextC })
      cellInputRefs.current[nextR]?.[nextC]?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === 'Backspace' && !userGrid[r][c]) {
      const prevR = activeDirection === 'down' ? r - 1 : r
      const prevC = activeDirection === 'across' ? c - 1 : c
      if (prevR >= 0 && prevC >= 0 && activeCellMap[prevR][prevC]) {
        setSelectedCell({ row: prevR, col: prevC })
        cellInputRefs.current[prevR]?.[prevC]?.focus()
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      moveToNextCell(r, c, 'across')
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (c - 1 >= 0 && activeCellMap[r][c - 1]) {
        setSelectedCell({ row: r, col: c - 1 })
        cellInputRefs.current[r]?.[c - 1]?.focus()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveToNextCell(r, c, 'down')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (r - 1 >= 0 && activeCellMap[r - 1][c]) {
        setSelectedCell({ row: r - 1, col: c })
        cellInputRefs.current[r - 1]?.[c]?.focus()
      }
    }
  }

  const handleCellClick = (r: number, c: number) => {
    const cellClues = cellCluesMap[`${r}_${c}`]
    if (selectedCell?.row === r && selectedCell?.col === c) {
      // Toggle direction if both exist
      if (cellClues?.across && cellClues?.down) {
        setActiveDirection((prev) => (prev === 'across' ? 'down' : 'across'))
      }
    } else {
      setSelectedCell({ row: r, col: c })
      // Default to the available direction
      if (cellClues?.across && !cellClues?.down) setActiveDirection('across')
      else if (!cellClues?.across && cellClues?.down) setActiveDirection('down')
    }
    cellInputRefs.current[r]?.[c]?.focus()
  }

  // Active clue according to selection & direction
  const activeClue = useMemo(() => {
    if (!selectedCell) return null
    const cellClues = cellCluesMap[`${selectedCell.row}_${selectedCell.col}`]
    if (!cellClues) return null
    if (activeDirection === 'across') return cellClues.across || cellClues.down || null
    return cellClues.down || cellClues.across || null
  }, [selectedCell, activeDirection, cellCluesMap])

  // Hovered clue for instant tooltip
  const targetHoverClue = useMemo(() => {
    if (!hoveredCell) return null
    const cellClues = cellCluesMap[`${hoveredCell.row}_${hoveredCell.col}`]
    if (!cellClues) return null
    return cellClues.across || cellClues.down || null
  }, [hoveredCell, cellCluesMap])

  const handleVerify = () => {
    onCheckFinished(correctLettersCount, totalActiveLetters)
  }

  const handleReset = () => {
    setUserGrid(Array.from({ length: gridRows }, () => Array(gridCols).fill('')))
  }

  return (
    <div className="crossword-centerpiece-container">
      {/* Dynamic Active Clue Banner above the main grid */}
      <div className="crossword-active-clue-banner">
        {activeClue ? (
          <div className="active-clue-content">
            <span className="active-clue-badge">
              {activeClue.direction === 'across' ? (
                <>
                  <ArrowRight size={13} /> #{activeClue.number} Horizontal
                </>
              ) : (
                <>
                  <ArrowDown size={13} /> #{activeClue.number} Vertical
                </>
              )}
            </span>
            <p className="active-clue-text">{activeClue.clue}</p>
            {showHints && activeClue.hint && (
              <span className="active-clue-hint">💡 {activeClue.hint}</span>
            )}
            {isSubmitted && activeClue.explanation && (
              <span className="active-clue-expl">✍️ {activeClue.explanation}</span>
            )}
          </div>
        ) : (
          <p className="clue-placeholder-text">
            Clique sur une case numérotée pour voir sa définition et commencer à écrire…
          </p>
        )}
      </div>

      {/* Grand Central 2D Grid with floating tooltip positioning */}
      <div className="crossword-grand-grid-wrapper">
        <div
          className="crossword-grand-grid"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, minmax(42px, 54px))`,
            gridTemplateRows: `repeat(${gridRows}, minmax(42px, 54px))`,
          }}
        >
          {Array.from({ length: gridRows }).map((_, r) =>
            Array.from({ length: gridCols }).map((_, c) => {
              const isActive = activeCellMap[r][c]
              const cellNum = cellNumberMatrix[r][c]
              const isSelected = selectedCell?.row === r && selectedCell?.col === c
              const userVal = userGrid[r]?.[c] || ''
              const correctVal = letterMatrix[r]?.[c] || ''
              const isCorrect = userVal.toUpperCase() === correctVal.toUpperCase()
              const cellClues = cellCluesMap[`${r}_${c}`]

              // Highlight cells that belong to active clue
              const belongsToActiveClue =
                activeClue &&
                isActive &&
                ((activeClue.direction === 'across' &&
                  r === activeClue.row &&
                  c >= activeClue.col &&
                  c < activeClue.col + activeClue.answer.length) ||
                  (activeClue.direction === 'down' &&
                    c === activeClue.col &&
                    r >= activeClue.row &&
                    r < activeClue.row + activeClue.answer.length))

              if (!isActive) {
                return <div key={`${r}_${c}`} className="crossword-cell blocked" />
              }

              return (
                <div
                  key={`${r}_${c}`}
                  className={`crossword-cell active ${isSelected ? 'selected' : ''} ${
                    belongsToActiveClue ? 'in-active-word' : ''
                  } ${isSubmitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
                  onClick={() => handleCellClick(r, c)}
                  onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                  onMouseLeave={() => setHoveredCell(null)}
                >
                  {cellNum !== null && <span className="cell-number">{cellNum}</span>}

                  <input
                    ref={(el) => {
                      if (!cellInputRefs.current[r]) cellInputRefs.current[r] = []
                      cellInputRefs.current[r][c] = el
                    }}
                    type="text"
                    maxLength={1}
                    className="cell-input"
                    value={isSubmitted ? correctVal : userVal}
                    disabled={isSubmitted}
                    onChange={(e) => handleCellChange(r, c, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, r, c)}
                  />

                  {isSubmitted && !isCorrect && (
                    <span
                      className="user-wrong-mark"
                      title={`Tu as mis : ${userVal || '(vide)'}`}
                    >
                      {userVal || '·'}
                    </span>
                  )}

                  {/* Floating Context Tooltip on hover when starting cell */}
                  {hoveredCell?.row === r && hoveredCell?.col === c && (cellClues?.across || cellClues?.down) && (
                    <div className="crossword-cell-tooltip">
                      {cellClues.across && (
                        <div className="tooltip-line">
                          <strong>→ {cellClues.across.number}.</strong> {cellClues.across.clue}
                        </div>
                      )}
                      {cellClues.down && (
                        <div className="tooltip-line">
                          <strong>↓ {cellClues.down.number}.</strong> {cellClues.down.clue}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            }),
          )}
        </div>
      </div>

      {/* Clues Summary Chips under the grid */}
      <div className="crossword-clues-chips-tray">
        <div className="clues-subgroup">
          <span className="subgroup-title">Horizontal :</span>
          <div className="chips-list">
            {clues
              .filter((c) => c.direction === 'across')
              .map((c) => (
                <button
                  key={`ac_${c.number}`}
                  type="button"
                  className={`clue-chip ${
                    selectedCell?.row === c.row &&
                    selectedCell?.col >= c.col &&
                    selectedCell?.col < c.col + c.answer.length &&
                    activeDirection === 'across'
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    setSelectedCell({ row: c.row, col: c.col })
                    setActiveDirection('across')
                    cellInputRefs.current[c.row]?.[c.col]?.focus()
                  }}
                  title={c.clue}
                >
                  <span className="chip-num">{c.number}</span>
                  <span className="chip-text">{c.clue}</span>
                </button>
              ))}
          </div>
        </div>

        <div className="clues-subgroup">
          <span className="subgroup-title">Vertical :</span>
          <div className="chips-list">
            {clues
              .filter((c) => c.direction === 'down')
              .map((c) => (
                <button
                  key={`dn_${c.number}`}
                  type="button"
                  className={`clue-chip ${
                    selectedCell?.col === c.col &&
                    selectedCell?.row >= c.row &&
                    selectedCell?.row < c.row + c.answer.length &&
                    activeDirection === 'down'
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    setSelectedCell({ row: c.row, col: c.col })
                    setActiveDirection('down')
                    cellInputRefs.current[c.row]?.[c.col]?.focus()
                  }}
                  title={c.clue}
                >
                  <span className="chip-num">{c.number}</span>
                  <span className="chip-text">{c.clue}</span>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Footer Controls with proper spacing */}
      <div className="crossword-footer-controls">
        <button
          type="button"
          className="hint-toggle-pill"
          onClick={() => setShowHints(!showHints)}
        >
          <Sparkles size={13} />
          <span>{showHints ? 'Masquer indices' : 'Indices'}</span>
        </button>

        {!isSubmitted ? (
          <div className="crossword-actions-row">
            <button type="button" className="action-btn secondary" onClick={handleReset}>
              <RotateCcw size={13} /> Recommencer
            </button>
            <button type="button" className="action-btn primary" onClick={handleVerify}>
              <Check size={14} /> Vérifier la grille
            </button>
          </div>
        ) : (
          <div className="crossword-score-banner">
            <Award size={16} />
            <span>
              Résultat : {correctLettersCount} / {totalActiveLetters} lettres correctes (
              {Math.round((correctLettersCount / (totalActiveLetters || 1)) * 100)}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
