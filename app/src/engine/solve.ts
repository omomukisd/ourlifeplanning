import { adultsOf, initialTotal, simulate, simulationRange } from './simulate'
import type { Household, Person, Scenario, SimulationResult } from './types'

// ---- Q1 老後 ----

export interface RetirementAnswer {
  goalMet: boolean
  /** 最初に不足が出る年（なければ null） */
  shortfallYear: number | null
  /** 不足が出る年の、各大人の年齢 */
  shortfallAges: { nickname: string; age: number }[]
  /** 目標年（最年長の大人が goal.atAge の年）の総資産 */
  balanceAtGoal: number
  goalYear: number
}

export function answerRetirement(h: Household, result: SimulationResult): RetirementAnswer {
  const adults = adultsOf(h)
  const goalRow = result.rows.find((r) => r.year === result.goalYear)
  return {
    goalMet: result.goalMet,
    shortfallYear: result.firstShortfallYear,
    shortfallAges: result.firstShortfallYear === null ? [] : adults.map((p) => ({ nickname: p.nickname, age: result.firstShortfallYear! - p.birthYear })),
    balanceAtGoal: goalRow?.total ?? 0,
    goalYear: result.goalYear,
  }
}

// ---- Q2 趣味予算の上限 ----

export interface HobbyAnswer {
  /** 目標を満たす最大の趣味予算（月額・今の価値）。趣味 0 でも満たせないなら null */
  maxMonthly: number | null
  /** 探索の上限に達した（もっと使える） */
  atUpperBound: boolean
}

export const HOBBY_SEARCH_MAX = 1_000_000
const HOBBY_STEP = 1_000

export function maxHobbyMonthly(h: Household, scenario: Scenario): HobbyAnswer {
  const ok = (monthly: number) => simulate(h, scenario, { hobbyMonthlyOverride: monthly }).goalMet
  if (!ok(0)) return { maxMonthly: null, atUpperBound: false }
  if (ok(HOBBY_SEARCH_MAX)) return { maxMonthly: HOBBY_SEARCH_MAX, atUpperBound: true }
  let lo = 0, hi = HOBBY_SEARCH_MAX
  while (hi - lo > HOBBY_STEP) {
    const mid = Math.floor((lo + hi) / 2 / HOBBY_STEP) * HOBBY_STEP
    if (mid === lo) break
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return { maxMonthly: lo, atUpperBound: false }
}

// ---- Q3 FIRE ----

export const FIRE_MAX_AGE = 65

export interface FireCell {
  /** person id → 退職年齢 */
  retireAges: Record<string, number>
  goalMet: boolean
  balanceAtGoal: number
  firstShortfallYear: number | null
}

export interface FireAnswer {
  adults: Person[]
  /** 各大人の、探索する退職年齢の一覧 */
  axes: number[][]
  /** cells[i][j]：1人目が axes[0][i] 歳、2人目が axes[1][j] 歳で退職（大人が1人なら j = 0 のみ） */
  cells: FireCell[][]
  /** 2人が同じ年に退職する場合の最短の年 */
  earliestSameYear: { year: number; ages: number[]; requiredAssets: number } | null
}

function currentAge(p: Person, startYear: number) {
  return startYear - p.birthYear
}

export function fireGrid(h: Household, scenario: Scenario, mode: 'full' | 'side'): FireAnswer {
  const adults = adultsOf(h).slice(0, 2)
  const axes = adults.map((p) => {
    const from = Math.max(0, currentAge(p, h.startYear))
    const list: number[] = []
    for (let a = from; a <= Math.max(from, FIRE_MAX_AGE); a++) list.push(a)
    return list
  })
  const run = (ages: number[]): FireCell => {
    const retireAges = Object.fromEntries(adults.map((p, i) => [p.id, ages[i]]))
    const r = simulate(h, scenario, { retireAgeOverride: retireAges, disableSideIncome: mode === 'full' })
    const goalRow = r.rows.find((row) => row.year === r.goalYear)
    return { retireAges, goalMet: r.goalMet, balanceAtGoal: goalRow?.total ?? 0, firstShortfallYear: r.firstShortfallYear }
  }
  const cells: FireCell[][] = []
  if (adults.length === 0) return { adults, axes, cells, earliestSameYear: null }
  for (const a0 of axes[0]) {
    const row: FireCell[] = []
    if (adults.length === 1) row.push(run([a0]))
    else for (const a1 of axes[1]) row.push(run([a0, a1]))
    cells.push(row)
  }

  // 同じ年に退職する場合
  let earliestSameYear: FireAnswer['earliestSameYear'] = null
  const { endYear } = simulationRange(h)
  for (let year = h.startYear; year <= endYear; year++) {
    const ages = adults.map((p) => year - p.birthYear)
    const idx = ages.map((age, i) => axes[i].indexOf(age))
    if (idx.some((i) => i < 0)) {
      if (ages.some((age) => age > FIRE_MAX_AGE)) break
      continue
    }
    const cell = adults.length === 1 ? cells[idx[0]][0] : cells[idx[0]][idx[1]]
    if (cell.goalMet) {
      earliestSameYear = { year, ages, requiredAssets: assetsAtStartOf(h, scenario, year, cell.retireAges, mode) }
      break
    }
  }
  return { adults, axes, cells, earliestSameYear }
}

/** その年の期首（＝前年末）の総資産 */
function assetsAtStartOf(h: Household, scenario: Scenario, year: number, retireAges: Record<string, number>, mode: 'full' | 'side'): number {
  if (year <= h.startYear) return initialTotal(h)
  const r = simulate(h, scenario, { retireAgeOverride: retireAges, disableSideIncome: mode === 'full' })
  return r.rows.find((row) => row.year === year - 1)?.total ?? 0
}

/** 片方の退職年齢を固定したときの、もう片方の最短退職年齢 */
export function earliestFor(answer: FireAnswer, fixedIndex: 0 | 1, fixedAge: number): number | null {
  if (answer.adults.length < 2) return null
  const otherIndex = fixedIndex === 0 ? 1 : 0
  const fi = answer.axes[fixedIndex].indexOf(fixedAge)
  if (fi < 0) return null
  for (let oi = 0; oi < answer.axes[otherIndex].length; oi++) {
    const cell = fixedIndex === 0 ? answer.cells[fi][oi] : answer.cells[oi][fi]
    if (cell.goalMet) return answer.axes[otherIndex][oi]
  }
  return null
}
