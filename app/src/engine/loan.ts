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

/** 月の通し番号（year * 12 + month - 1） */
const monthIndex = (year: number, month: number) => year * 12 + month - 1

/** 借りた月（旧データで月がなければ1月） */
export const borrowMonthOf = (loan: Loan) => loan.borrowMonth ?? 1

/** 最初の返済月の通し番号（借りた翌月から返済が始まる） */
export function firstPaymentIndex(loan: Loan): number {
  return monthIndex(loan.borrowYear, borrowMonthOf(loan)) + 1
}

/** 最後の返済の年と月 */
export function lastPayment(loan: Loan): { year: number; month: number } {
  const idx = firstPaymentIndex(loan) + Math.round(loan.termYears * 12) - 1
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** 借りた額から、ある年の1月はじめ（1月の返済の前）の残高と残りの返済回数を求める（元利均等・今の金利で計算） */
export function loanStateAt(loan: Loan, year: number): { balance: number; remainingMonths: number } {
  const total = Math.round(loan.termYears * 12)
  const paid = Math.max(0, monthIndex(year, 1) - firstPaymentIndex(loan))
  if (paid >= total) return { balance: 0, remainingMonths: 0 }
  const r = loan.rate / 12
  if (paid === 0) return { balance: loan.principal, remainingMonths: total }
  if (r === 0) return { balance: loan.principal * (1 - paid / total), remainingMonths: total - paid }
  const monthly = annuityPayment(loan.principal, r, total)
  const g = Math.pow(1 + r, paid)
  const balance = loan.principal * g - (monthly * (g - 1)) / r
  return { balance: Math.max(0, balance), remainingMonths: total - paid }
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
 * 借りた翌月から返済が始まる（借りたのが未来なら、その翌月から）。借りる前の残高は 0。
 * 金利が変わった月から、その時点の残高と残り回数で返済額を計算し直す（5年ルール・125%ルールは使わない）。
 */
export function loanSchedule(loan: Loan, scenario: Scenario, startYear: number, endYear: number): Map<number, LoanYear> {
  const out = new Map<number, LoanYear>()
  const first = firstPaymentIndex(loan)
  let { balance, remainingMonths: remaining } = loanStateAt(loan, startYear)
  let currentRate: number | null = null
  let monthly = 0
  for (let year = startYear; year <= endYear; year++) {
    let payment = 0
    for (let month = 1; month <= 12; month++) {
      if (monthIndex(year, month) < first) continue
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
    // 年末（12月）の時点でまだ借りていなければ残高 0
    const borrowed = monthIndex(year, 12) >= first - 1
    out.set(year, { payment, endBalance: borrowed ? Math.max(0, balance) : 0, rate: currentRate ?? loan.rate })
  }
  return out
}

export const LOAN_DEDUCTION_RATE = 0.007

/** その年の住宅ローン控除額（ローン1本分） */
export function loanDeduction(loan: Loan, year: number, endBalance: number): number {
  if (!loan.deduction || year > loan.deduction.untilYear) return 0
  return Math.min(endBalance, loan.deduction.maxBalance) * LOAN_DEDUCTION_RATE
}
