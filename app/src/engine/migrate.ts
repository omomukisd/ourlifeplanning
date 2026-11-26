import type { Household, Loan } from './types'

// 古い形式で保存されたデータを今の形式に直す。読み込むたびに呼ぶ（何度呼んでも結果は同じ）。

type LegacyLoan = Partial<Loan> & { balance?: number; remainingMonths?: number }

export function migrateHousehold(h: Household): Household {
  const loans = (h.loans as LegacyLoan[]).map((l) => {
    if (typeof l.principal === 'number') return l as Loan
    // 旧形式（今の残高・残りの月数）：前年12月に借りた扱い（＝今年1月から返済）にすると、今年以降の返済はまったく同じになる
    const { balance = 0, remainingMonths = 0, ...rest } = l
    return { ...rest, principal: balance, borrowYear: h.startYear - 1, borrowMonth: 12, termYears: remainingMonths / 12 } as Loan
  })
  const persons = h.persons.map((p) => {
    if (!p.income) return p
    const { grossAnnual: _drop, ...income } = p.income as typeof p.income & { grossAnnual?: number }
    const pension = { ...income.pension }
    if (typeof pension.unpaidMonths !== 'number') {
      // 旧形式：加入実績額だけを入力していた。0 は未入力とみなして推計に切り替える
      pension.unpaidMonths = 0
      if (!pension.recordedEmployee) pension.recordedEmployee = null
    }
    return { ...p, income: { ...income, pension } }
  })
  return { ...h, loans, persons }
}
