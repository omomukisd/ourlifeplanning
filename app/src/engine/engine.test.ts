import { describe, expect, it } from 'vitest'
import { expenseMovingAverage, planMonthly, summarize, upsertActual } from './actuals'
import { defaultChildPlan, planFromSteps, stepsFromPlan } from './education'
import { annuityPayment, lastPayment, loanSchedule, loanStateAt } from './loan'
import { migrateHousehold } from './migrate'
import { pensionDetail } from './pension'
import { estimateGrossFromNet, netFromGross } from './tax'
import { DEFAULT_SCENARIOS } from './masters'
import { sampleHousehold } from './sample'
import { simulate } from './simulate'
import { fireGrid, maxHobbyMonthly } from './solve'
import type { Household, Loan, Person, Scenario } from './types'

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
        netAnnual: 5_000_000, incomeCurve: [{ fromAge: 0, growth: null }],
        retireAge: 65, sideIncome: null, reducedPeriods: [],
        pension: { unpaidMonths: 0, recordedEmployee: 0, startAge: 65 }, severance: null,
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
    actuals: [],
  }
}

const mortgage = (over: Partial<Loan> = {}): Loan => ({
  id: 'l', name: 'loan', kind: 'mortgage', ownerId: 'a', principal: 30_000_000, borrowYear: Y0 - 1, borrowMonth: 12, termYears: 30,
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
    const s = loanSchedule(mortgage({ termYears: 1, principal: 1_200_000 }), flat, Y0, Y0 + 2)
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

describe('額面の推定', () => {
  it('手取りから額面を逆算すると、額面→手取りの計算と一致する', () => {
    for (const net of [2_500_000, 3_600_000, 4_800_000, 7_000_000, 10_000_000]) {
      const gross = estimateGrossFromNet(net, 35)
      expect(Math.abs(netFromGross(gross, 35) - net)).toBeLessThan(2_000)
    }
  })

  it('一般的な目安（手取りは額面の75〜80%程度）に収まる', () => {
    const gross = estimateGrossFromNet(4_800_000, 35)
    expect(gross).toBeGreaterThan(6_000_000)
    expect(gross).toBeLessThan(6_600_000)
  })

  it('40歳以上は介護保険の分だけ額面が高く出る', () => {
    expect(estimateGrossFromNet(4_800_000, 45)).toBeGreaterThan(estimateGrossFromNet(4_800_000, 35))
  })
})

describe('借りた額からのローン', () => {
  it('3年前に借りたローンは、今年はじめに36回返済済みの残高から始まる', () => {
    const loan = mortgage({ borrowYear: Y0 - 4 })
    const state = loanStateAt(loan, Y0)
    expect(state.remainingMonths).toBe(360 - 36)
    // 1年ずつ返済した結果と一致する
    const fromStart = loanSchedule(loan, flat, Y0 - 3, Y0 - 1).get(Y0 - 1)!
    expect(state.balance).toBeCloseTo(fromStart.endBalance, 0)
  })

  it('借りた翌月から返済が始まる（4月に借りたら、その年は5〜12月の8回）', () => {
    const loan = mortgage({ borrowYear: Y0, borrowMonth: 4 })
    const y = loanSchedule(loan, flat, Y0, Y0).get(Y0)!
    expect(y.payment).toBeCloseTo(annuityPayment(30_000_000, 0.01 / 12, 360) * 8, 0)
    expect(lastPayment(loan)).toEqual({ year: Y0 + 30, month: 4 })
  })

  it('未来に借りる予定のローンは、借りるまで残高も返済も 0', () => {
    const s = loanSchedule(mortgage({ borrowYear: Y0 + 1 }), flat, Y0, Y0 + 3)
    expect(s.get(Y0)!.payment).toBe(0)
    expect(s.get(Y0)!.endBalance).toBe(0)
    expect(s.get(Y0 + 1)!.payment).toBe(0)
    expect(s.get(Y0 + 1)!.endBalance).toBe(30_000_000)
    expect(Math.round(s.get(Y0 + 2)!.payment)).toBe(1_157_902)
  })

  it('返済期間を過ぎたローンは返済 0', () => {
    const s = loanSchedule(mortgage({ borrowYear: Y0 - 31 }), flat, Y0, Y0 + 1)
    expect(s.get(Y0)!.payment).toBe(0)
  })

  it('旧形式（残高・残りの月数）のデータを読み替えても、返済は変わらない', () => {
    const h = docExample()
    ;(h.loans as unknown[]) = [{ ...mortgage(), principal: undefined, borrowYear: undefined, borrowMonth: undefined, termYears: undefined, balance: 30_000_000, remainingMonths: 360 }]
    const m = migrateHousehold(h)
    expect(m.loans[0]).toMatchObject({ principal: 30_000_000, borrowYear: Y0 - 1, borrowMonth: 12, termYears: 30 })
    expect(Math.round(loanSchedule(m.loans[0], flat, Y0, Y0).get(Y0)!.payment)).toBe(1_157_902)
  })
})

describe('子どもの進路', () => {
  it('選択から段階を作ると、年齢と年数はマスタの標準値になる', () => {
    const steps = stepsFromPlan({ ...defaultChildPlan(), after: 'university6:national', grad: 'doctor:private', livingAway: true })
    expect(steps.map((s) => [s.stageId, s.startAge, s.years])).toEqual([
      ['kindergarten', 3, 3], ['elementary', 6, 6], ['juniorHigh', 12, 3], ['highSchool', 15, 3],
      ['university6', 18, 6], ['master', 24, 2], ['doctor', 26, 3],
    ])
    expect(steps.filter((s) => s.livingAway).map((s) => s.stageId)).toEqual(['university6', 'master', 'doctor'])
  })

  it('段階から選択に戻すと元の選択になる', () => {
    const plan = { ...defaultChildPlan(), basic: { ...defaultChildPlan().basic, nursery: 'licensed', elementary: 'private' }, after: 'vocational:private' }
    expect(planFromSteps(stepsFromPlan(plan))).toEqual(plan)
  })

  it('専門学校や就職を選ぶと大学院は付かない', () => {
    const steps = stepsFromPlan({ ...defaultChildPlan(), after: 'vocational:private', grad: 'master:national' })
    expect(steps.some((s) => s.stageId === 'master')).toBe(false)
  })
})

describe('厚生年金（入っていない月数から推計）', () => {
  const person = (over: Partial<NonNullable<Person['income']>['pension']> = {}): Person => ({
    id: 'a', nickname: 'A', role: 'adult', birthYear: Y0 - 40,
    income: {
      netAnnual: 5_000_000, incomeCurve: [{ fromAge: 0, growth: 0 }], retireAge: 65, sideIncome: null, reducedPeriods: [],
      pension: { unpaidMonths: 24, recordedEmployee: null, startAge: 65, ...over }, severance: null,
    },
  })
  const idx = () => 1

  it('20歳から今までの月数から、入っていない月数を引いたものが「これまで」になる', () => {
    const d = pensionDetail(person(), 65, Y0, flat, 6_000_000, idx)
    expect(d.pastMonths).toBe(20 * 12 - 24)
    expect(d.futureMonths).toBe(25 * 12)
  })

  it('額面が一定なら、老齢厚生年金 = 額面 × 加入年数 × 5.481/1000', () => {
    const d = pensionDetail(person(), 65, Y0, flat, 6_000_000, idx)
    expect(d.employee).toBeCloseTo(6_000_000 * (43 * 12) / 12 * 5.481 / 1000, 0)
    expect(d.annual).toBeCloseTo(d.basic + d.employee, 0)
  })

  it('入っていない月数が増えると年金が減る', () => {
    const a = pensionDetail(person({ unpaidMonths: 0 }), 65, Y0, flat, 6_000_000, idx)
    const b = pensionDetail(person({ unpaidMonths: 120 }), 65, Y0, flat, 6_000_000, idx)
    expect(b.employee).toBeLessThan(a.employee)
  })

  it('ねんきん定期便の金額があれば、これまでの分はそれを使う', () => {
    const d = pensionDetail(person({ recordedEmployee: 300_000 }), 65, Y0, flat, 6_000_000, idx)
    expect(d.employee).toBeCloseTo(300_000 + 6_000_000 * 25 * 5.481 / 1000, 0)
  })

  it('70歳まで繰下げると42%増える', () => {
    const d = pensionDetail(person({ startAge: 70 }), 65, Y0, flat, 6_000_000, idx)
    expect(d.startAdjust).toBeCloseTo(1.42)
  })
})

describe('毎月の実績', () => {
  const a = (yearMonth: string, income: number, expense: number) => ({ yearMonth, income, expense })

  it('同じ月は上書きされ、月の順に並ぶ', () => {
    let list = upsertActual([], a('2030-03', 40, 30))
    list = upsertActual(list, a('2030-01', 40, 30))
    list = upsertActual(list, a('2030-03', 50, 20))
    expect(list.map((x) => [x.yearMonth, x.income])).toEqual([['2030-01', 40], ['2030-03', 50]])
  })

  it('直近12か月の平均と、同じ年の計画の月額を比べる', () => {
    const h = docExample()
    const result = simulate(h, flat)
    const list = Array.from({ length: 14 }, (_, i) => a(`${Y0 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, 400_000, i < 2 ? 999_999 : 300_000))
    const s = summarize(list, result)!
    expect(s.months).toBe(12)
    expect(s.expenseAvg).toBeCloseTo(300_000)
    expect(s.savingRate).toBeCloseTo(0.25)
    // 計画：その年の支出の年額 ÷ 12
    expect(planMonthly(result, `${Y0}-05`)!.expense).toBeCloseTo(result.rows[0].expense.total / 12)
  })

  it('支出の移動平均は、その月までの最大12件の平均', () => {
    const list = [a('2030-01', 0, 100), a('2030-02', 0, 200), a('2030-03', 0, 600)]
    expect(expenseMovingAverage(list).map((x) => x.value)).toEqual([100, 150, 300])
  })

  it('古いデータに実績がなくても読み込める', () => {
    const h = docExample() as Partial<Household>
    delete h.actuals
    expect(migrateHousehold(h as Household).actuals).toEqual([])
  })
})
