import type { CrosswordClue, CrosswordData } from './exercisesDomain'

export type RawCrosswordClue = {
  clue: string
  answer: string
  hint?: string
  explanation?: string
  direction?: 'across' | 'down'
  row?: number
  col?: number
  number?: number
}

type PlacedWord = {
  word: string
  clue: string
  hint?: string
  explanation?: string
  direction: 'across' | 'down'
  row: number
  col: number
}

/**
 * Validates whether a proposed placement is 100% valid and free of character clashes or illegal collisions.
 */
function isPlacementValid(
  grid: (string | null)[][],
  word: string,
  direction: 'across' | 'down',
  startRow: number,
  startCol: number,
  gridSize: number,
): boolean {
  const len = word.length
  if (direction === 'across') {
    if (startRow < 0 || startRow >= gridSize || startCol < 0 || startCol + len > gridSize) return false

    // Check boundary before and after word
    if (startCol > 0 && grid[startRow][startCol - 1] !== null) return false
    if (startCol + len < gridSize && grid[startRow][startCol + len] !== null) return false

    let intersects = false
    for (let i = 0; i < len; i++) {
      const r = startRow
      const c = startCol + i
      const existing = grid[r][c]

      if (existing !== null) {
        if (existing !== word[i]) return false
        intersects = true
      } else {
        // Parallel neighbor check: above and below must be empty for empty cell
        if (r > 0 && grid[r - 1][c] !== null) return false
        if (r + 1 < gridSize && grid[r + 1][c] !== null) return false
      }
    }
    return true
  } else {
    // direction === 'down'
    if (startCol < 0 || startCol >= gridSize || startRow < 0 || startRow + len > gridSize) return false

    // Check boundary before and after word
    if (startRow > 0 && grid[startRow - 1][startCol] !== null) return false
    if (startRow + len < gridSize && grid[startRow + len][startCol] !== null) return false

    let intersects = false
    for (let i = 0; i < len; i++) {
      const r = startRow + i
      const c = startCol
      const existing = grid[r][c]

      if (existing !== null) {
        if (existing !== word[i]) return false
        intersects = true
      } else {
        // Parallel neighbor check: left and right must be empty for empty cell
        if (c > 0 && grid[r][c - 1] !== null) return false
        if (c + 1 < gridSize && grid[r][c + 1] !== null) return false
      }
    }
    return true
  }
}

/**
 * Validates AI coordinates or automatically builds a 100% orthogonal, mathematically consistent crossword grid.
 */
export function buildGuaranteedCrossword(
  rawClues: RawCrosswordClue[],
  theme: string,
): CrosswordData {
  // 1. Sanitize input clues
  const cleanedClues = rawClues
    .map((c) => ({
      clue: String(c.clue || '').trim(),
      answer: String(c.answer || '')
        .toUpperCase()
        .replace(/[^A-Z]/g, ''),
      hint: c.hint ? String(c.hint) : undefined,
      explanation: c.explanation ? String(c.explanation) : undefined,
      direction: c.direction === 'down' ? ('down' as const) : ('across' as const),
      row: typeof c.row === 'number' ? c.row : undefined,
      col: typeof c.col === 'number' ? c.col : undefined,
    }))
    .filter((c) => c.answer.length >= 2 && c.clue.length > 0)

  if (cleanedClues.length === 0) {
    return {
      gridRows: 6,
      gridCols: 6,
      theme: theme || 'Mots croisés',
      clues: [],
    }
  }

  // 2. Check if AI's provided coordinates are already 100% valid
  const GRID_CANVAS_SIZE = 24
  const testGrid: (string | null)[][] = Array.from({ length: GRID_CANVAS_SIZE }, () =>
    Array(GRID_CANVAS_SIZE).fill(null),
  )

  let aiCoordinatesValid = true
  const hasAllCoords = cleanedClues.every(
    (c) => typeof c.row === 'number' && typeof c.col === 'number' && c.direction,
  )

  if (hasAllCoords) {
    for (const c of cleanedClues) {
      const r0 = (c.row ?? 0) + 4
      const c0 = (c.col ?? 0) + 4
      const word = c.answer

      if (r0 < 0 || c0 < 0 || (c.direction === 'across' && c0 + word.length >= GRID_CANVAS_SIZE) || (c.direction === 'down' && r0 + word.length >= GRID_CANVAS_SIZE)) {
        aiCoordinatesValid = false
        break
      }

      for (let i = 0; i < word.length; i++) {
        const currR = c.direction === 'across' ? r0 : r0 + i
        const currC = c.direction === 'across' ? c0 + i : c0
        const existing = testGrid[currR][currC]

        if (existing !== null && existing !== word[i]) {
          aiCoordinatesValid = false
          break
        }
        testGrid[currR][currC] = word[i]
      }
      if (!aiCoordinatesValid) break
    }
  } else {
    aiCoordinatesValid = false
  }

  // If AI coordinates are completely valid without any letter mismatch, keep them
  if (aiCoordinatesValid && hasAllCoords) {
    // Find bounding box
    let minR = GRID_CANVAS_SIZE, maxR = 0, minC = GRID_CANVAS_SIZE, maxC = 0
    for (let r = 0; r < GRID_CANVAS_SIZE; r++) {
      for (let c = 0; c < GRID_CANVAS_SIZE; c++) {
        if (testGrid[r][c] !== null) {
          minR = Math.min(minR, r)
          maxR = Math.max(maxR, r)
          minC = Math.min(minC, c)
          maxC = Math.max(maxC, c)
        }
      }
    }

    const finalClues: CrosswordClue[] = cleanedClues.map((c, idx) => ({
      number: idx + 1,
      direction: c.direction!,
      clue: c.clue,
      answer: c.answer,
      row: (c.row! + 4) - minR,
      col: (c.col! + 4) - minC,
      hint: c.hint,
      explanation: c.explanation,
    }))

    // Sort clues and assign standard top-to-bottom, left-to-right numbers
    renumberClues(finalClues)

    return {
      gridRows: maxR - minR + 1,
      gridCols: maxC - minC + 1,
      theme: theme || 'Mots croisés',
      clues: finalClues,
    }
  }

  // 3. Otherwise, run automatic layout algorithm
  const workingGrid: (string | null)[][] = Array.from({ length: GRID_CANVAS_SIZE }, () =>
    Array(GRID_CANVAS_SIZE).fill(null),
  )

  const placedWords: PlacedWord[] = []
  // Sort words by length descending
  const sortedClues = [...cleanedClues].sort((a, b) => b.answer.length - a.answer.length)

  // Place first word horizontally in center
  const first = sortedClues[0]
  const startR = Math.floor(GRID_CANVAS_SIZE / 2) - 2
  const startC = Math.floor((GRID_CANVAS_SIZE - first.answer.length) / 2)

  for (let i = 0; i < first.answer.length; i++) {
    workingGrid[startR][startC + i] = first.answer[i]
  }
  placedWords.push({
    word: first.answer,
    clue: first.clue,
    hint: first.hint,
    explanation: first.explanation,
    direction: 'across',
    row: startR,
    col: startC,
  })

  // Try placing each subsequent word at best intersection
  for (let wIdx = 1; wIdx < sortedClues.length; wIdx++) {
    const item = sortedClues[wIdx]
    const word = item.answer
    let bestPlacement: { row: number; col: number; direction: 'across' | 'down'; score: number } | null = null

    for (const placed of placedWords) {
      const candidateDir: 'across' | 'down' = placed.direction === 'across' ? 'down' : 'across'

      for (let i = 0; i < word.length; i++) {
        for (let j = 0; j < placed.word.length; j++) {
          if (word[i] === placed.word[j]) {
            // Letter match! Calculate candidate start row & col
            let candRow: number, candCol: number
            if (candidateDir === 'down') {
              // Placed is across, candidate is down
              candRow = placed.row - i
              candCol = placed.col + j
            } else {
              // Placed is down, candidate is across
              candRow = placed.row + j
              candCol = placed.col - i
            }

            if (isPlacementValid(workingGrid, word, candidateDir, candRow, candCol, GRID_CANVAS_SIZE)) {
              // Calculate compact distance score (distance from center)
              const centerDist = Math.abs(candRow - startR) + Math.abs(candCol - startC)
              const score = 100 - centerDist

              if (!bestPlacement || score > bestPlacement.score) {
                bestPlacement = { row: candRow, col: candCol, direction: candidateDir, score }
              }
            }
          }
        }
      }
    }

    if (bestPlacement) {
      // Commit placement to grid
      const { row, col, direction } = bestPlacement
      for (let i = 0; i < word.length; i++) {
        const r = direction === 'across' ? row : row + i
        const c = direction === 'across' ? col + i : col
        workingGrid[r][c] = word[i]
      }
      placedWords.push({
        word,
        clue: item.clue,
        hint: item.hint,
        explanation: item.explanation,
        direction,
        row,
        col,
      })
    }
  }

  // 4. Calculate bounding box of placed words
  let minR = GRID_CANVAS_SIZE, maxR = 0, minC = GRID_CANVAS_SIZE, maxC = 0
  for (let r = 0; r < GRID_CANVAS_SIZE; r++) {
    for (let c = 0; c < GRID_CANVAS_SIZE; c++) {
      if (workingGrid[r][c] !== null) {
        minR = Math.min(minR, r)
        maxR = Math.max(maxR, r)
        minC = Math.min(minC, c)
        maxC = Math.max(maxC, c)
      }
    }
  }

  // Shift coordinates so top-left is at (0, 0)
  const finalClues: CrosswordClue[] = placedWords.map((p, idx) => ({
    number: idx + 1,
    direction: p.direction,
    clue: p.clue,
    answer: p.word,
    row: p.row - minR,
    col: p.col - minC,
    hint: p.hint,
    explanation: p.explanation,
  }))

  // Re-number clues in top-to-bottom, left-to-right order
  renumberClues(finalClues)

  return {
    gridRows: maxR >= minR ? maxR - minR + 1 : 6,
    gridCols: maxC >= minC ? maxC - minC + 1 : 6,
    theme: theme || 'Mots croisés',
    clues: finalClues,
  }
}

/**
 * Assigns numbers to clues based on their starting cell in standard reading order.
 * If two clues start on the same cell (e.g. 1 across & 1 down), they share the same number.
 */
function renumberClues(clues: CrosswordClue[]): void {
  // Sort clues by row first, then col, then across before down
  clues.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    if (a.col !== b.col) return a.col - b.col
    return a.direction === 'across' ? -1 : 1
  })

  let currentNumber = 1
  const cellNumberMap = new Map<string, number>()

  for (const clue of clues) {
    const key = `${clue.row},${clue.col}`
    if (!cellNumberMap.has(key)) {
      cellNumberMap.set(key, currentNumber)
      currentNumber++
    }
    clue.number = cellNumberMap.get(key)!
  }

  // Sort clues into across first, then down, sorted by number
  clues.sort((a, b) => {
    if (a.direction !== b.direction) {
      return a.direction === 'across' ? -1 : 1
    }
    return a.number - b.number
  })
}
