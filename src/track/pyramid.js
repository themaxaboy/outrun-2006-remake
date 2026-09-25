import { STAGES, getStage, stageRowCol } from './stages.js'

export const ROWS = 5
export const GOAL_ROW = ROWS - 1

export function stageId(row, col) { return `${row}-${col}` }

/** children(r,c) = [(r+1,c) left, (r+1,c+1) right]; null on the goal row */
export function children(id) {
  const { row, col } = stageRowCol(id)
  if (row >= GOAL_ROW) return null
  return [stageId(row + 1, col), stageId(row + 1, col + 1)]
}

export function isGoalStage(id) { return stageRowCol(id).row === GOAL_ROW }

/** 'LRLR' → ['0-0','1-0','2-1','3-1','4-2'] (missing letters default to L) */
export function routeStages(route = '') {
  const out = ['0-0']
  let col = 0
  for (let r = 1; r < ROWS; r++) {
    const ch = route[r - 1] === 'R' ? 'R' : 'L'
    if (ch === 'R') col++
    out.push(stageId(r, col))
  }
  return out
}

export function goalLetter(col) { return 'ABCDE'[col] }

export function allStages() { return STAGES.map((s) => getStage(s.id)) }
