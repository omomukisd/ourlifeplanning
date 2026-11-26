import type { IncomeCurveSegment, Person, Scenario } from './types'

// 収入カーブ（年齢ごとの昇給率）と、育休・時短の期間の扱い。

export function reducedRatio(p: Person, year: number): number {
  const period = p.income?.reducedPeriods.find((r) => year >= r.fromYear && year <= r.toYear)
  return period ? period.ratio : 1
}

function segmentAt(p: Person, age: number): IncomeCurveSegment | undefined {
  const segs = [...(p.income?.incomeCurve ?? [])].sort((a, b) => a.fromAge - b.fromAge)
  return segs.reverse().find((s) => s.fromAge <= age)
}

/** その年齢になった年の、前年からの名目の伸び（倍率） */
export function wageStepAt(p: Person, scenario: Scenario, age: number): number {
  const seg = segmentAt(p, age)
  const growth = seg ? (seg.growth ?? scenario.wageGrowth) : scenario.wageGrowth
  let v = 1 + growth
  if (seg?.stepMultiplier !== undefined && seg.fromAge === age) v *= seg.stepMultiplier
  return v
}

/** 収入カーブに沿った、開始年を 1 とした賃金指数 */
export function buildWageIndex(p: Person, scenario: Scenario, startYear: number, endYear: number): (y: number) => number {
  const idx = new Map<number, number>()
  let v = 1
  idx.set(startYear, v)
  for (let y = startYear + 1; y <= endYear; y++) {
    v *= wageStepAt(p, scenario, y - p.birthYear)
    idx.set(y, v)
  }
  return (y) => idx.get(y) ?? v
}
