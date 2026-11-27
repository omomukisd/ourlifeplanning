import { PENSION } from './masters'
import type { Person, Scenario } from './types'
import { reducedRatio, wageStepAt } from './wage'

// 公的年金の推計（今の価値）。
// 厚生年金は「20歳から退職までのうち、厚生年金に入っていない月数」から加入月数を求め、
// 加入していた各年の額面（収入カーブで今の額面から過去・未来に伸ばしたもの）で報酬比例部分を計算する。
// 入っていない月は、20歳からの最初の期間（学生など）とみなす。

/** 厚生年金に入る最後の年齢（この年齢になる前まで） */
const EMPLOYEE_PENSION_UNTIL_AGE = 70
const ENROLL_FROM_AGE = 20

export interface PensionDetail {
  /** 厚生年金の加入月数：これまで（今年の前まで） */
  pastMonths: number
  /** 厚生年金の加入月数：これから（今年から退職まで） */
  futureMonths: number
  /** 老齢基礎年金（年額・65歳から） */
  basic: number
  /** 老齢厚生年金（年額・65歳から） */
  employee: number
  /** 受給開始年齢の増減を反映した年額（シナリオの目減りは含まない） */
  annual: number
  /** 受給開始年齢による増減率（1 = 増減なし） */
  startAdjust: number
}

export function pensionDetail(
  p: Person, retireAge: number, startYear: number, scenario: Scenario, grossAnnual: number,
  wageIndex: (y: number) => number,
): PensionDetail {
  const inc = p.income!
  const ageNow = startYear - p.birthYear
  const realStep = (age: number) => wageStepAt(p, scenario, age) / (1 + scenario.inflation)
  const unpaid = Math.max(0, Math.round(inc.pension.unpaidMonths ?? 0))

  // これまで：20歳から今年の前まで。入っていない月を最初から差し引く
  const elapsed = Math.max(0, (ageNow - ENROLL_FROM_AGE) * 12)
  const pastMonths = Math.max(0, elapsed - unpaid)
  const unpaidLeft = Math.max(0, unpaid - elapsed)
  let pastEmployee = 0
  if (inc.pension.recordedEmployee != null) {
    pastEmployee = inc.pension.recordedEmployee
  } else {
    // 今年から1年ずつさかのぼる（今の価値に直した額面）
    let gross = grossAnnual
    let left = pastMonths
    for (let age = ageNow - 1; left > 0; age--) {
      gross /= realStep(age + 1)
      const months = Math.min(12, left)
      pastEmployee += Math.min(gross, PENSION.grossCap) * (months / 12) * PENSION.employeeRate
      left -= months
    }
  }

  // これから：今年から退職（70歳が上限）まで
  const until = Math.min(retireAge, EMPLOYEE_PENSION_UNTIL_AGE)
  let futureMonths = 0
  let futureEmployee = 0
  let skip = unpaidLeft
  const inflation = (y: number) => Math.pow(1 + scenario.inflation, y - startYear)
  for (let y = startYear; y - p.birthYear < until; y++) {
    if (y - p.birthYear < ENROLL_FROM_AGE) continue
    const skipped = Math.min(12, skip)
    skip -= skipped
    const months = 12 - skipped
    if (months <= 0) continue
    const grossReal = (grossAnnual * wageIndex(y) * reducedRatio(p, y)) / inflation(y)
    futureEmployee += Math.min(grossReal, PENSION.grossCap) * (months / 12) * PENSION.employeeRate
    futureMonths += months
  }

  const monthsShift = (inc.pension.startAge - 65) * 12
  const startAdjust = monthsShift >= 0 ? 1 + monthsShift * PENSION.deferralPerMonth : 1 + monthsShift * PENSION.advancePerMonth
  const basic = PENSION.basicFullAnnual
  const employee = pastEmployee + futureEmployee
  return { pastMonths, futureMonths, basic, employee, annual: (basic + employee) * startAdjust, startAdjust }
}
