import type { Household, Loan } from './types'

// 古い形式で保存されたデータを今の形式に直す。読み込むたびに呼ぶ（何度呼んでも結果は同じ）。

type LegacyLoan = Partial<Loan> & { balance?: number; remainingMonths?: number }

export function migrateHousehold(h: Household): Household {
  const loans = (h.loans as LegacyLoan[]).map((l) => {
    if (typeof l.principal === 'number') return l as Loan
    // 旧形式（今の残高・残りの月数）：今年借りた扱いにすると、今年以降の返済はまったく同じになる
    const { balance = 0, remainingMonths = 0, ...rest } = l
    return { ...rest, principal: balance, borrowYear: h.startYear, termYears: remainingMonths / 12 } as Loan
  })
  const persons = h.persons.map((p) => {
    if (!p.income || !('grossAnnual' in p.income)) return p
    const { grossAnnual: _drop, ...income } = p.income as typeof p.income & { grossAnnual?: number }
    return { ...p, income }
  })
  return { ...h, loans, persons }
}
