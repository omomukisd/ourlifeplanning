import type { MonthlyActual, SimulationResult } from './types'

// 毎月の実績（手取りと支出）の集計と、計画との比較。

export function sortActuals(list: MonthlyActual[]): MonthlyActual[] {
  return [...list].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
}

export function yearOf(yearMonth: string): number {
  return Number(yearMonth.slice(0, 4))
}

/** 計画の月額（その年の年額 ÷ 12）。計画の範囲外なら null */
export function planMonthly(result: SimulationResult, yearMonth: string): { income: number; expense: number } | null {
  const row = result.rows.find((r) => r.year === yearOf(yearMonth))
  if (!row) return null
  // 退職金は1回きりの収入なので、毎月の比較からは除く
  return { income: (row.income.total - row.income.severance) / 12, expense: row.expense.total / 12 }
}

export interface ActualsSummary {
  months: number
  from: string
  to: string
  incomeAvg: number
  expenseAvg: number
  /** 収入 − 支出 の月平均 */
  savingAvg: number
  /** 貯蓄率（収入に対する割合）。収入が 0 なら null */
  savingRate: number | null
  /** 同じ月の計画の支出の平均（計画の範囲内の月だけ） */
  planExpenseAvg: number | null
  planIncomeAvg: number | null
}

/** 直近 n か月（記録がある月だけ）の集計 */
export function summarize(list: MonthlyActual[], result: SimulationResult, n = 12): ActualsSummary | null {
  const recent = sortActuals(list).slice(-n)
  if (recent.length === 0) return null
  const sum = (f: (a: MonthlyActual) => number) => recent.reduce((s, a) => s + f(a), 0)
  const incomeAvg = sum((a) => a.income) / recent.length
  const expenseAvg = sum((a) => a.expense) / recent.length
  const plans = recent.map((a) => planMonthly(result, a.yearMonth)).filter((p) => p !== null)
  return {
    months: recent.length,
    from: recent[0].yearMonth,
    to: recent[recent.length - 1].yearMonth,
    incomeAvg,
    expenseAvg,
    savingAvg: incomeAvg - expenseAvg,
    savingRate: incomeAvg > 0 ? (incomeAvg - expenseAvg) / incomeAvg : null,
    planExpenseAvg: plans.length ? plans.reduce((s, p) => s + p.expense, 0) / plans.length : null,
    planIncomeAvg: plans.length ? plans.reduce((s, p) => s + p.income, 0) / plans.length : null,
  }
}

/** 支出の移動平均（その月までの最大12件の記録の平均） */
export function expenseMovingAverage(list: MonthlyActual[], window = 12): { yearMonth: string; value: number }[] {
  const sorted = sortActuals(list)
  return sorted.map((a, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1)
    return { yearMonth: a.yearMonth, value: slice.reduce((s, x) => s + x.expense, 0) / slice.length }
  })
}

/** 記録を追加または上書きする（同じ月は1件だけ） */
export function upsertActual(list: MonthlyActual[], entry: MonthlyActual): MonthlyActual[] {
  return sortActuals([...list.filter((a) => a.yearMonth !== entry.yearMonth), entry])
}

/** 今月（例：2026-11） */
export function currentYearMonth(today = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}
