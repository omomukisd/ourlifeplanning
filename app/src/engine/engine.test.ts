import { describe, expect, it } from 'vitest'
import { annuityPayment, loanSchedule } from './loan'
import { DEFAULT_SCENARIOS } from './masters'
import { sampleHousehold } from './sample'
import { simulate } from './simulate'
import { fireGrid, maxHobbyMonthly } from './solve'
import type { Household, Loan, Scenario } from './types'

const Y0 = 2030
const flat: Scenario = {
  id: 'flat', name: 'flat', inflation: 0, wageGrowth: 0,
  returns: { equity: 0.05, balanced: 0.03, cash: 0 },
  marketRate: { stepPerYear: 0, maxIncrease: 0 }, pensionAdjust: 0,
}

/** docs/03_domain_model.md §9 の検算用の例 */
function docExample(): Household {
  return {
    version: 1, startYear: Y0,
    persons: [{
      id: 'a', nickname: 'A', role: 'adult', birthYear: Y0 - 40,
      income: {
        netAnnual: 5_000_000, grossAnnual: 6_500_000, incomeCurve: [{ fromAge: 0, growth: null }],
        retireAge: 65, sideIncome: null, reducedPeriods: [],
        pension: { recordedEmployee: 0, startAge: 65 }, severance: null,
      },
    }],
    accounts: [
      { id: 'cash', name: '現預金', typeId: 'cash', ownerId: null, balance: 1_000_000, monthlyContribution: 0, contributionUntilAge: null, returnKey: 'cash' },
      { id: 'nisa', name: 'NISA', typeId: 'nisa', ownerId: 'a', balance: 2_000_000, monthlyContribution: 30_000, contributionUntilAge: null, returnKey: 'equity' },
    ],
    loans: [],
    costItems: [{ id: 'loan', name: 'ローン返済（固定）', presetId: null, amount: 1_000_000, startYear: Y0, intervalYears: 1, endYear: null, growth: 0 }],
    baseLivingMonthly: 250_000, retiredLivingRatio: 0.8, hobbyMonthly: 30_000,
    goal: { minBalance: 0, atAge: 100 },
    withdrawalOrder: ['cash', 'taxable', 'nisa', 'dc', 'ideco'],
    scenarios: [flat],
  }
}

const mortgage = (over: Partial<Loan> = {}): Loan => ({
  id: 'l', name: 'loan', kind: 'mortgage', ownerId: 'a', balance: 30_000_000, remainingMonths: 360,
  rate: 0.01, rateChanges: [], followsMarketRate: false, deduction: null, ...over,
})

describe('1年分の計算（ドメイン設計 §9）', () => {
  it('手計算と一致する', () => {
    const row = simulate(docExample(), flat).rows[0]
    expect(row.expense.total).toBeCloseTo(3_360_000 + 1_000_000)
    expect(row.contributions).toBe(360_000)
    expect(row.net).toBeCloseTo(280_000)
    expect(row.balances.cash).toBeCloseTo(1_280_000)
    expect(row.balances.nisa).toBeCloseTo(2_469_000)
    expect(row.total).toBeCloseTo(3_749_000)
  })
})

describe('ローン', () => {
  it('元利均等の返済額と1年後の残高', () => {
    expect(Math.round(annuityPayment(30_000_000, 0.01 / 12, 360))).toBe(96_492)
    const y = loanSchedule(mortgage(), flat, Y0, Y0 + 1).get(Y0)!
    expect(Math.round(y.endBalance)).toBe(29_138_155)
    expect(Math.round(y.payment)).toBe(1_157_902)
  })

  it('金利が上がった月から返済額が増える', () => {
    const base = loanSchedule(mortgage(), flat, Y0, Y0 + 1).get(Y0 + 1)!
    const up = loanSchedule(mortgage({ rateChanges: [{ year: Y0 + 1, month: 1, rate: 0.015 }] }), flat, Y0, Y0 + 1).get(Y0 + 1)!
    expect(up.payment).toBeGreaterThan(base.payment)
    expect(up.rate).toBe(0.015)
  })

  it('変動金利はシナリオの上昇幅が上限まで足される', () => {
    const sc: Scenario = { ...flat, marketRate: { stepPerYear: 0.001, maxIncrease: 0.005 } }
    const s = loanSchedule(mortgage({ followsMarketRate: true }), sc, Y0, Y0 + 20)
    expect(s.get(Y0)!.rate).toBeCloseTo(0.01)
    expect(s.get(Y0 + 2)!.rate).toBeCloseTo(0.012)
    expect(s.get(Y0 + 10)!.rate).toBeCloseTo(0.015)
  })

  it('完済後は返済 0', () => {
    const s = loanSchedule(mortgage({ remainingMonths: 12, balance: 1_200_000 }), flat, Y0, Y0 + 2)
    expect(s.get(Y0)!.endBalance).toBeCloseTo(0)
    expect(s.get(Y0 + 1)!.payment).toBe(0)
  })
})

describe('住宅ローン控除', () => {
  it('今の手取りに含まれる控除を二重に数えない', () => {
    const h = docExample()
    h.loans = [mortgage({ deduction: { untilYear: Y0 + 5, maxBalance: 50_000_000, currentAmount: 200_000 } })]
    const rows = simulate(h, flat).rows
    expect(rows[0].income.salary).toBeCloseTo(4_800_000)
    expect(rows[0].income.loanDeduction).toBeCloseTo(29_138_155 * 0.007, -1)
    // 控除が終わった年は手取りが減る
    expect(rows[6].income.loanDeduction).toBe(0)
  })
})

describe('NISA の上限', () => {
  it('年360万円を超えた分は課税口座に回る', () => {
    const h = docExample()
    h.accounts[1].monthlyContribution = 400_000
    h.baseLivingMonthly = 0
    h.hobbyMonthly = 0
    const row = simulate(h, flat).rows[0]
    expect(row.byType.taxable).toBeCloseTo(1_200_000 * (1 + 0.05 / 2))
  })
})

describe('年金', () => {
  it('早く退職すると年金が減る', () => {
    const h = sampleHousehold(Y0)
    const late = simulate(h, flat).rows.find((r) => r.ages.a1 === 70)!.income.pension
    const early = simulate(h, flat, { retireAgeOverride: { a1: 45 } }).rows.find((r) => r.ages.a1 === 70)!.income.pension
    expect(early).toBeLessThan(late)
  })

  it('退職後60歳までは国民年金保険料がかかる', () => {
    const h = sampleHousehold(Y0)
    const rows = simulate(h, flat, { retireAgeOverride: { a1: 45, a2: 65 } }).rows
    expect(rows.find((r) => r.ages.a1 === 50)!.expense.socialInsurance).toBeGreaterThan(0)
    expect(rows.find((r) => r.ages.a1 === 40)!.expense.socialInsurance).toBe(0)
  })
})

describe('3つの問い', () => {
  const h = sampleHousehold(Y0)
  const sc = DEFAULT_SCENARIOS[0]

  it('趣味予算の上限は、目標を満たす境目', () => {
    const ans = maxHobbyMonthly(h, sc)
    expect(ans.maxMonthly).not.toBeNull()
    const m = ans.maxMonthly!
    expect(simulate(h, sc, { hobbyMonthlyOverride: m }).goalMet).toBe(true)
    expect(simulate(h, sc, { hobbyMonthlyOverride: m + 1_000 }).goalMet).toBe(false)
  })

  it('FIRE の表は退職年齢の組み合わせをすべて含む', () => {
    const ans = fireGrid(h, sc, 'full')
    expect(ans.cells.length).toBe(ans.axes[0].length)
    expect(ans.cells[0].length).toBe(ans.axes[1].length)
    // 65歳同士で退職できるなら、最短の年も見つかる
    const last = ans.cells[ans.cells.length - 1][ans.cells[0].length - 1]
    if (last.goalMet) expect(ans.earliestSameYear).not.toBeNull()
  })
})
