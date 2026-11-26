import { INCOME_TAX } from './masters'

// 会社員の額面年収と手取り年収の換算（概算）。
// 手取りから額面を逆算し、年金の推計と退職後の国民健康保険の計算に使う。
// 扶養控除・配偶者控除・生命保険料控除などは考えない（少し手取りが少なめに出る＝額面は少し高めに出る）。

/** 給与所得控除 */
export function salaryDeduction(gross: number): number {
  if (gross <= 1_900_000) return Math.min(gross, 650_000)
  if (gross <= 3_600_000) return gross * 0.3 + 80_000
  if (gross <= 6_600_000) return gross * 0.2 + 440_000
  if (gross <= 8_500_000) return gross * 0.1 + 1_100_000
  return 1_950_000
}

/** 会社員の社会保険料（本人負担分・年額） */
export function employeeSocialInsurance(gross: number, age: number): number {
  const s = INCOME_TAX.socialInsurance
  const pension = Math.min(gross, s.pensionGrossCap) * s.pensionRate
  const health = gross * (s.healthRate + (age >= 40 && age < 65 ? s.careRate : 0))
  const employment = gross * s.employmentRate
  return pension + health + employment
}

/** 所得税（復興特別所得税を含む） */
export function incomeTax(taxable: number): number {
  if (taxable <= 0) return 0
  const b = INCOME_TAX.brackets.find((x) => taxable <= x.upTo) ?? INCOME_TAX.brackets[INCOME_TAX.brackets.length - 1]
  return Math.max(0, taxable * b.rate - b.deduction) * (1 + INCOME_TAX.reconstructionRate)
}

/** 額面年収から手取り年収（概算） */
export function netFromGross(gross: number, age = 40): number {
  if (gross <= 0) return 0
  const social = employeeSocialInsurance(gross, age)
  const income = Math.max(0, gross - salaryDeduction(gross))
  const it = incomeTax(Math.floor(Math.max(0, income - social - INCOME_TAX.basicDeduction) / 1000) * 1000)
  const residentBase = Math.max(0, income - social - INCOME_TAX.residentBasicDeduction)
  const rt = residentBase > 0 ? residentBase * INCOME_TAX.residentRate + INCOME_TAX.residentPerCapita : 0
  return gross - social - it - rt
}

/** 手取り年収から額面年収を推定する（netFromGross の逆算） */
export function estimateGrossFromNet(net: number, age = 40): number {
  if (net <= 0) return 0
  let lo = net
  let hi = net * 2.5 + 1_000_000
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (netFromGross(mid, age) < net) lo = mid
    else hi = mid
  }
  return Math.round((lo + hi) / 2 / 1000) * 1000
}
