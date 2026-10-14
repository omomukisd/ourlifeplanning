import { DEFAULT_SCENARIOS } from './masters'
import type { Household, IncomeCurveSegment } from './types'

// 架空のサンプル世帯。実在の世帯の数字は入れない（リポジトリは公開されている）。

export const DEFAULT_INCOME_CURVE: IncomeCurveSegment[] = [
  { fromAge: 0, growth: null },
  { fromAge: 51, growth: 0 },
  { fromAge: 60, growth: 0, stepMultiplier: 0.6 },
]

export function sampleHousehold(startYear = new Date().getFullYear()): Household {
  return {
    version: 1,
    startYear,
    persons: [
      {
        id: 'a1', nickname: 'あおい', role: 'adult', birthYear: startYear - 36,
        income: {
          netAnnual: 4_800_000, grossAnnual: 6_300_000,
          incomeCurve: DEFAULT_INCOME_CURVE.map((s) => ({ ...s })),
          retireAge: 65, sideIncome: { netAnnual: 1_200_000, untilAge: 60 }, reducedPeriods: [],
          pension: { recordedEmployee: 250_000, startAge: 65 }, severance: { age: 65, amount: 10_000_000 },
        },
      },
      {
        id: 'a2', nickname: 'ひかる', role: 'adult', birthYear: startYear - 34,
        income: {
          netAnnual: 3_600_000, grossAnnual: 4_600_000,
          incomeCurve: DEFAULT_INCOME_CURVE.map((s) => ({ ...s })),
          retireAge: 65, sideIncome: { netAnnual: 1_000_000, untilAge: 60 }, reducedPeriods: [],
          pension: { recordedEmployee: 180_000, startAge: 65 }, severance: null,
        },
      },
      {
        id: 'c1', nickname: 'そら', role: 'child', birthYear: startYear - 4,
        education: [
          { stageId: 'kindergarten', typeId: 'public', startAge: 3, years: 3, livingAway: false },
          { stageId: 'elementary', typeId: 'public', startAge: 6, years: 6, livingAway: false },
          { stageId: 'juniorHigh', typeId: 'public', startAge: 12, years: 3, livingAway: false },
          { stageId: 'highSchool', typeId: 'public', startAge: 15, years: 3, livingAway: false },
          { stageId: 'university', typeId: 'privateArts', startAge: 18, years: 4, livingAway: false },
        ],
      },
    ],
    accounts: [
      { id: 'cash', name: '普通預金', typeId: 'cash', ownerId: null, balance: 3_000_000, monthlyContribution: 0, contributionUntilAge: null, returnKey: 'cash' },
      { id: 'nisa1', name: 'NISA（あおい）', typeId: 'nisa', ownerId: 'a1', balance: 2_000_000, monthlyContribution: 50_000, contributionUntilAge: null, returnKey: 'equity' },
      { id: 'nisa2', name: 'NISA（ひかる）', typeId: 'nisa', ownerId: 'a2', balance: 1_000_000, monthlyContribution: 30_000, contributionUntilAge: null, returnKey: 'equity' },
      { id: 'dc1', name: '企業型DC（あおい）', typeId: 'dc', ownerId: 'a1', balance: 1_500_000, monthlyContribution: 20_000, contributionUntilAge: null, returnKey: 'equity' },
    ],
    loans: [
      {
        id: 'loan1', name: '住宅ローン（あおい）', kind: 'mortgage', ownerId: 'a1',
        balance: 25_000_000, remainingMonths: 32 * 12, rate: 0.009,
        rateChanges: [], followsMarketRate: true,
        deduction: { untilYear: startYear + 10, maxBalance: 30_000_000, currentAmount: null },
      },
    ],
    costItems: [
      { id: 'ci1', name: 'マンション：管理費', presetId: 'condoMgmt', amount: 216_000, startYear, intervalYears: 1, endYear: null, growth: 'inflation' },
      { id: 'ci2', name: 'マンション：修繕積立金', presetId: 'condoRepair', amount: 150_000, startYear, intervalYears: 1, endYear: null, growth: 0.03 },
      { id: 'ci3', name: '固定資産税', presetId: 'propertyTax', amount: 120_000, startYear, intervalYears: 1, endYear: null, growth: 0 },
      { id: 'ci4', name: '家電の買い替え', presetId: 'appliances', amount: 100_000, startYear, intervalYears: 1, endYear: null, growth: 'inflation' },
    ],
    baseLivingMonthly: 230_000,
    retiredLivingRatio: 0.8,
    hobbyMonthly: 30_000,
    goal: { minBalance: 0, atAge: 100 },
    withdrawalOrder: ['cash', 'zaikei', 'taxable', 'other', 'insurance', 'nisa', 'dc', 'ideco'],
    scenarios: DEFAULT_SCENARIOS.map((s) => structuredClone(s)),
  }
}
