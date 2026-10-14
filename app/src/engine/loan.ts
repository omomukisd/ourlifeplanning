import type { Loan, Scenario } from './types'

export interface LoanYear {
  payment: number
  endBalance: number
  /** その年の最後に適用された年利 */
  rate: number
}

/** 元利均等の月返済額 */
export function annuityPayment(balance: number, monthlyRate: number, months: number): number {
  if (months <= 0) return balance
  if (monthlyRate === 0) return balance / months
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
}

/** 決まっている変更の後に、シナリオの上昇幅を足した年利 */
export function rateAt(loan: Loan, scenario: Scenario, startYear: number, year: number, month: number): number {
  let rate = loan.rate
  const changes = [...loan.rateChanges].sort((a, b) => a.year - b.year || a.month - b.month)
  for (const c of changes) {
    if (c.year < year || (c.year === year && c.month <= month)) rate = c.rate
  }
  if (!loan.followsMarketRate) return rate
  const lastChangeYear = changes.length ? Math.max(startYear, changes[changes.length - 1].year) : startYear
  const yearsAfter = year - lastChangeYear
  const increase = yearsAfter > 0
    ? Math.min(scenario.marketRate.maxIncrease, scenario.marketRate.stepPerYear * yearsAfter)
    : 0
  return rate + increase
}

/**
 * ローンを月ごとに返済し、年ごとにまとめる。
 * 金利が変わった月から、その時点の残高と残り回数で返済額を計算し直す（5年ルール・125%ルールは使わない）。
 */
export function loanSchedule(loan: Loan, scenario: Scenario, startYear: number, endYear: number): Map<number, LoanYear> {
  const out = new Map<number, LoanYear>()
  let balance = loan.balance
  let remaining = loan.remainingMonths
  let currentRate: number | null = null
  let monthly = 0
  for (let year = startYear; year <= endYear; year++) {
    let payment = 0
    for (let month = 1; month <= 12; month++) {
      if (remaining <= 0 || balance <= 0) break
      const rate = rateAt(loan, scenario, startYear, year, month)
      if (rate !== currentRate) {
        currentRate = rate
        monthly = annuityPayment(balance, rate / 12, remaining)
      }
      const interest = balance * (rate / 12)
      let principal = monthly - interest
      let paid = monthly
      if (principal >= balance || remaining === 1) {
        principal = balance
        paid = balance + interest
      }
      balance -= principal
      remaining -= 1
      payment += paid
    }
    out.set(year, { payment, endBalance: Math.max(0, balance), rate: currentRate ?? loan.rate })
  }
  return out
}

export const LOAN_DEDUCTION_RATE = 0.007

/** その年の住宅ローン控除額（ローン1本分） */
export function loanDeduction(loan: Loan, year: number, endBalance: number): number {
  if (!loan.deduction || year > loan.deduction.untilYear) return 0
  return Math.min(endBalance, loan.deduction.maxBalance) * LOAN_DEDUCTION_RATE
}
