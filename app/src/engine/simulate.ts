import {
  ACCOUNT_TYPES, CHILD_ALLOWANCE, LIVING_AWAY_ANNUAL, SOCIAL_INSURANCE, findStage,
} from './masters'
import { loanDeduction, loanSchedule, type LoanYear } from './loan'
import { pensionDetail } from './pension'
import { estimateGrossFromNet } from './tax'
import { buildWageIndex, reducedRatio } from './wage'
import type {
  Account, AccountTypeId, Household, Person, Scenario, SimulationResult, YearRow,
} from './types'

export interface SimOptions {
  /** person id → 退職年齢（FIRE の探索で使う） */
  retireAgeOverride?: Record<string, number>
  /** true ならサイドFIRE収入を 0 にする（完全FIRE） */
  disableSideIncome?: boolean
  hobbyMonthlyOverride?: number
}

const OVERFLOW_TAXABLE_ID = '__overflow_taxable'
const FALLBACK_CASH_ID = '__cash'

export function adultsOf(h: Household): Person[] {
  return h.persons.filter((p) => p.role === 'adult' && p.income)
}

export function simulationRange(h: Household): { endYear: number; goalYear: number } {
  const adults = adultsOf(h)
  if (adults.length === 0) return { endYear: h.startYear + 60, goalYear: h.startYear + 60 }
  const oldestBirth = Math.min(...adults.map((a) => a.birthYear))
  const endYear = oldestBirth + Math.max(100, h.goal.atAge)
  const goalYear = Math.max(h.startYear, Math.min(endYear, oldestBirth + h.goal.atAge))
  return { endYear, goalYear }
}

export function simulate(h: Household, scenario: Scenario, opt: SimOptions = {}): SimulationResult {
  const y0 = h.startYear
  const { endYear, goalYear } = simulationRange(h)
  const adults = adultsOf(h)
  const children = h.persons.filter((p) => p.role === 'child').sort((a, b) => a.birthYear - b.birthYear)
  const personById = new Map(h.persons.map((p) => [p.id, p]))
  const f = (y: number) => Math.pow(1 + scenario.inflation, y - y0)
  const retireAge = (p: Person) => opt.retireAgeOverride?.[p.id] ?? p.income!.retireAge
  const ageOf = (p: Person, y: number) => y - p.birthYear
  const isRetired = (p: Person, y: number) => ageOf(p, y) >= retireAge(p)

  // ローンは他の計算に依存しないので先に全期間を計算する
  const schedules = new Map<string, Map<number, LoanYear>>()
  for (const loan of h.loans) schedules.set(loan.id, loanSchedule(loan, scenario, y0, endYear))
  const deductionOf = (personId: string, y: number) => h.loans
    .filter((l) => l.ownerId === personId)
    .reduce((s, l) => s + loanDeduction(l, y, schedules.get(l.id)!.get(y)!.endBalance), 0)

  // 大人ごとの前計算
  const adultCalc = new Map(adults.map((p) => {
    const inc = p.income!
    const wageIndex = buildWageIndex(p, scenario, y0, endYear)
    const ownLoans = h.loans.filter((l) => l.ownerId === p.id && l.deduction)
    const currentDeduction = ownLoans.reduce(
      (s, l) => s + (l.deduction!.currentAmount ?? loanDeduction(l, y0, schedules.get(l.id)!.get(y0)!.endBalance)), 0)
    const baseNet = Math.max(0, inc.netAnnual - currentDeduction)
    // 額面は手取り（住宅ローン控除の還付を除く）から推定する
    const gross = estimateGrossFromNet(baseNet, ageOf(p, y0))
    const pension = pensionDetail(p, retireAge(p), y0, scenario, gross, wageIndex)
    const pensionReal = pension.annual * (1 + scenario.pensionAdjust)
    return [p.id, { wageIndex, baseNet, gross, pension, pensionReal }] as const
  }))

  const salaryOf = (p: Person, y: number) =>
    isRetired(p, y) || y < y0 ? 0 : adultCalc.get(p.id)!.baseNet * adultCalc.get(p.id)!.wageIndex(y) * reducedRatio(p, y)
  const sideOf = (p: Person, y: number) => {
    const side = p.income!.sideIncome
    if (opt.disableSideIncome || !side || !isRetired(p, y) || ageOf(p, y) >= side.untilAge) return 0
    return side.netAnnual * f(y)
  }
  const grossOf = (p: Person, y: number) => {
    if (y < y0) return adultCalc.get(p.id)!.gross
    if (!isRetired(p, y)) return adultCalc.get(p.id)!.gross * adultCalc.get(p.id)!.wageIndex(y) * reducedRatio(p, y)
    return sideOf(p, y) / 0.8
  }

  // 口座の状態
  const accounts: Account[] = h.accounts.map((a) => ({ ...a }))
  if (!accounts.some((a) => a.typeId === 'cash')) {
    accounts.unshift({ id: FALLBACK_CASH_ID, name: '現預金', typeId: 'cash', ownerId: null, balance: 0, monthlyContribution: 0, contributionUntilAge: null, returnKey: 'cash' })
  }
  const cashAccount = accounts.find((a) => a.typeId === 'cash')!
  const balances = new Map(accounts.map((a) => [a.id, a.balance]))
  const nisaBasis = new Map<string, number>()
  for (const a of accounts) {
    if (a.typeId === 'nisa' && a.ownerId) nisaBasis.set(a.ownerId, (nisaBasis.get(a.ownerId) ?? 0) + a.balance)
  }
  const ensureOverflow = () => {
    if (!balances.has(OVERFLOW_TAXABLE_ID)) {
      accounts.push({ id: OVERFLOW_TAXABLE_ID, name: '課税口座（NISA枠超過分）', typeId: 'taxable', ownerId: null, balance: 0, monthlyContribution: 0, contributionUntilAge: null, returnKey: 'equity' })
      balances.set(OVERFLOW_TAXABLE_ID, 0)
    }
    return OVERFLOW_TAXABLE_ID
  }
  const withdrawable = (a: Account, y: number) => {
    const from = ACCOUNT_TYPES[a.typeId].withdrawableFromAge
    if (from === 0) return true
    const owner = a.ownerId ? personById.get(a.ownerId) : undefined
    return owner ? ageOf(owner, y) >= from : true
  }

  const rows: YearRow[] = []
  let firstShortfallYear: number | null = null
  const hobbyMonthly = opt.hobbyMonthlyOverride ?? h.hobbyMonthly

  for (let y = y0; y <= endYear; y++) {
    const fy = f(y)
    const ages: Record<string, number> = {}
    for (const p of h.persons) ages[p.id] = ageOf(p, y)
    const allRetired = adults.length > 0 && adults.every((p) => isRetired(p, y))

    // ---- 収入 ----
    let salary = 0, side = 0, pension = 0, severance = 0, loanDed = 0
    const incomeByPerson: YearRow['incomeByPerson'] = {}
    for (const p of adults) {
      const own = {
        salary: salaryOf(p, y),
        side: sideOf(p, y),
        pension: ageOf(p, y) >= p.income!.pension.startAge ? adultCalc.get(p.id)!.pensionReal * fy : 0,
        severance: p.income!.severance && ageOf(p, y) === p.income!.severance.age ? p.income!.severance.amount : 0,
      }
      incomeByPerson[p.id] = own
      salary += own.salary
      side += own.side
      pension += own.pension
      severance += own.severance
      loanDed += deductionOf(p.id, y)
    }
    let childAllowance = 0
    const eligibleForCount = children.filter((c) => ageOf(c, y) >= 0 && ageOf(c, y) <= 22)
    for (const c of children) {
      const age = ageOf(c, y)
      if (age < 0 || age > CHILD_ALLOWANCE.untilAge) continue
      const order = eligibleForCount.indexOf(c)
      const monthly = order >= 2 ? CHILD_ALLOWANCE.thirdOrLater : age < 3 ? CHILD_ALLOWANCE.under3 : CHILD_ALLOWANCE.from3
      childAllowance += monthly * 12
    }
    const incomeTotal = salary + side + pension + severance + childAllowance + loanDed

    // ---- 支出 ----
    const living = h.baseLivingMonthly * 12 * fy * (allRetired ? h.retiredLivingRatio : 1)
    const hobby = hobbyMonthly * 12 * fy
    let education = 0
    for (const c of children) {
      const age = ageOf(c, y)
      for (const step of c.education ?? []) {
        if (age < step.startAge || age >= step.startAge + step.years) continue
        const stage = findStage(step.stageId)
        const type = stage?.types[step.typeId]
        const annual = step.annualOverride ?? type?.annual ?? 0
        const enrollment = age === step.startAge ? type?.enrollment ?? 0 : 0
        education += (annual + enrollment + (step.livingAway ? LIVING_AWAY_ANNUAL : 0)) * fy
      }
    }
    let costItems = 0
    for (const item of h.costItems) {
      if (y < item.startYear || (item.endYear !== null && y > item.endYear)) continue
      const hit = item.intervalYears <= 0 ? y === item.startYear : (y - item.startYear) % item.intervalYears === 0
      if (!hit) continue
      const factor = item.growth === 'inflation' ? fy : Math.pow(1 + item.growth, y - y0)
      costItems += item.amount * factor
    }
    // 退職後の国民年金・国民健康保険
    const retiredAdults = adults.filter((p) => isRetired(p, y))
    let socialInsurance = 0
    for (const p of retiredAdults) {
      if (ageOf(p, y) < 60) socialInsurance += SOCIAL_INSURANCE.nationalPensionMonthly * 12 * fy
    }
    if (retiredAdults.length > 0) {
      const members = retiredAdults.length + (allRetired ? children.filter((c) => ageOf(c, y) >= 0 && ageOf(c, y) <= 22).length : 0)
      const incomeBase = retiredAdults.reduce((s, p) => s + grossOf(p, y - 1) * SOCIAL_INSURANCE.incomeFromGrossRatio, 0)
      const nhi = incomeBase * SOCIAL_INSURANCE.nhiIncomeRate + SOCIAL_INSURANCE.nhiPerCapita * members * fy
      socialInsurance += Math.min(nhi, SOCIAL_INSURANCE.nhiCap * fy)
    }
    let loanPayment = 0, loanBalance = 0
    for (const loan of h.loans) {
      const s = schedules.get(loan.id)!.get(y)!
      loanPayment += s.payment
      loanBalance += s.endBalance
    }
    const expenseTotal = living + hobby + education + costItems + socialInsurance + loanPayment

    // ---- 積立 ----
    const flows = new Map<string, number>(accounts.map((a) => [a.id, 0]))
    const nisaUsedThisYear = new Map<string, number>()
    let contributionsOut = 0
    for (const a of accounts) {
      if (a.monthlyContribution <= 0) continue
      const owner = a.ownerId ? personById.get(a.ownerId) : undefined
      const untilAge = a.contributionUntilAge ?? (owner?.income ? retireAge(owner) : Infinity)
      if (owner && ageOf(owner, y) >= untilAge) continue
      let amount = a.monthlyContribution * 12
      // 企業型DCの掛金は会社が出すので、世帯のお金からは出ていかない
      const external = a.typeId === 'dc'
      if (a.typeId === 'nisa' && a.ownerId) {
        const type = ACCOUNT_TYPES.nisa
        const usedYear = nisaUsedThisYear.get(a.ownerId) ?? 0
        const basis = nisaBasis.get(a.ownerId) ?? 0
        const room = Math.max(0, Math.min(type.annualCap! - usedYear, type.lifetimeCap! - basis))
        const inNisa = Math.min(amount, room)
        nisaUsedThisYear.set(a.ownerId, usedYear + inNisa)
        nisaBasis.set(a.ownerId, basis + inNisa)
        const overflow = amount - inNisa
        if (overflow > 0) {
          const id = ensureOverflow()
          flows.set(id, (flows.get(id) ?? 0) + overflow)
        }
        amount = inNisa
      }
      flows.set(a.id, flows.get(a.id)! + amount)
      if (!external) contributionsOut += a.monthlyContribution * 12
    }

    // ---- 収支の差 ----
    const net = incomeTotal - expenseTotal - contributionsOut
    if (net >= 0) {
      flows.set(cashAccount.id, flows.get(cashAccount.id)! + net)
    } else {
      let need = -net
      for (const typeId of h.withdrawalOrder) {
        for (const a of accounts) {
          if (need <= 0) break
          if (a.typeId !== typeId || !withdrawable(a, y)) continue
          const avail = Math.max(0, balances.get(a.id)! + flows.get(a.id)!)
          const take = Math.min(avail, need)
          flows.set(a.id, flows.get(a.id)! - take)
          need -= take
        }
      }
      if (need > 0) flows.set(cashAccount.id, flows.get(cashAccount.id)! - need)
    }

    // ---- 運用益 ----
    const byType: Partial<Record<AccountTypeId, number>> = {}
    const balanceRecord: Record<string, number> = {}
    let liquid = 0, total = 0
    for (const a of accounts) {
      const begin = balances.get(a.id)!
      const flow = flows.get(a.id) ?? 0
      const r = begin < 0 ? 0 : scenario.returns[a.returnKey]
      const end = begin + flow + begin * r + (flow * r) / 2
      balances.set(a.id, end)
      balanceRecord[a.id] = end
      byType[a.typeId] = (byType[a.typeId] ?? 0) + end
      total += end
      if (withdrawable(a, y)) liquid += end
    }
    const shortfall = balances.get(cashAccount.id)! < -1
    if (shortfall && firstShortfallYear === null) firstShortfallYear = y

    rows.push({
      year: y, ages, inflationFactor: fy,
      income: { salary, side, pension, severance, childAllowance, loanDeduction: loanDed, total: incomeTotal },
      incomeByPerson,
      expense: { living, hobby, education, costItems, socialInsurance, loan: loanPayment, total: expenseTotal },
      contributions: contributionsOut, net,
      balances: balanceRecord, byType, loanBalance, liquid, total, shortfall,
    })
  }

  const goalRow = rows.find((r) => r.year === goalYear)
  const goalMet = firstShortfallYear === null && (goalRow ? goalRow.total >= h.goal.minBalance : false)
  const pensionByPerson: SimulationResult['pensionByPerson'] = {}
  for (const [id, c] of adultCalc) pensionByPerson[id] = { ...c.pension, gross: c.gross }
  return { rows, firstShortfallYear, goalYear, goalMet, pensionByPerson }
}

/** 開始時点の資産合計 */
export function initialTotal(h: Household): number {
  return h.accounts.reduce((s, a) => s + a.balance, 0)
}
