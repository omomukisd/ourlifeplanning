// 金額はすべて円。率は小数（0.02 = 2%）。
// 「今の価値」と書いた金額は、シミュレーション開始年の物価での金額。

export type Yen = number

export interface Household {
  version: 1
  /** シミュレーション開始年（＝今年） */
  startYear: number
  persons: Person[]
  accounts: Account[]
  loans: Loan[]
  costItems: CostItem[]
  /** 基本生活費（月額・今の価値）。趣味予算は含まない */
  baseLivingMonthly: Yen
  /** 大人全員が退職した後の基本生活費の比率 */
  retiredLivingRatio: number
  /** 趣味予算（月額・今の価値） */
  hobbyMonthly: Yen
  goal: { minBalance: Yen; atAge: number }
  /** 取り崩す口座の種類の順番 */
  withdrawalOrder: AccountTypeId[]
  scenarios: Scenario[]
}

export interface Person {
  id: string
  nickname: string
  role: 'adult' | 'child'
  birthYear: number
  income?: IncomeProfile
  education?: EducationStep[]
}

export interface IncomeCurveSegment {
  /** この年齢から適用 */
  fromAge: number
  /** 毎年の伸び率。null ならシナリオの昇給率 */
  growth: number | null
  /** fromAge の年に一度だけ掛ける倍率（例：再雇用で 0.6） */
  stepMultiplier?: number
}

export interface IncomeProfile {
  /** 今年の手取り年収（ボーナス込み・住宅ローン控除の還付を含む） */
  netAnnual: Yen
  /** 今年の額面年収（年金の推計にだけ使う） */
  grossAnnual: Yen
  incomeCurve: IncomeCurveSegment[]
  /** この年齢になった年から就労収入が 0 になる */
  retireAge: number
  /** サイドFIRE期間の手取り収入（退職後〜untilAge の前年まで） */
  sideIncome: { netAnnual: Yen; untilAge: number } | null
  reducedPeriods: { fromYear: number; toYear: number; ratio: number }[]
  pension: {
    /** ねんきん定期便「これまでの加入実績に応じた老齢厚生年金の額」 */
    recordedEmployee: Yen
    startAge: number
  }
  severance: { age: number; amount: Yen } | null
}

export interface EducationStep {
  stageId: string
  /** マスタの区分 id（public / private / national など） */
  typeId: string
  startAge: number
  years: number
  livingAway: boolean
  /** マスタの年額を上書きする場合（今の価値） */
  annualOverride?: Yen | null
}

export type AccountTypeId =
  | 'cash' | 'nisa' | 'dc' | 'ideco' | 'taxable' | 'zaikei' | 'insurance' | 'other'

export type ReturnKey = 'equity' | 'balanced' | 'cash'

export interface Account {
  id: string
  name: string
  typeId: AccountTypeId
  ownerId: string | null
  balance: Yen
  monthlyContribution: Yen
  /** 積立をやめる年齢（その年から 0）。null なら持ち主の退職年齢 */
  contributionUntilAge: number | null
  returnKey: ReturnKey
}

export interface Loan {
  id: string
  name: string
  kind: 'mortgage' | 'car' | 'other'
  ownerId: string | null
  balance: Yen
  remainingMonths: number
  /** 今の年利 */
  rate: number
  /** 決まっている金利の変更 */
  rateChanges: { year: number; month: number; rate: number }[]
  /** 変動金利なら true（シナリオの上昇幅を足す） */
  followsMarketRate: boolean
  deduction: {
    untilYear: number
    maxBalance: Yen
    /** 今年の控除額（手取りに含まれている分）。null なら計算値を使う */
    currentAmount: Yen | null
  } | null
}

export interface CostItem {
  id: string
  name: string
  presetId: string | null
  /** 1回あたりの金額（今の価値） */
  amount: Yen
  startYear: number
  /** 1 = 毎年、n = n年ごと、0 = 1回だけ */
  intervalYears: number
  endYear: number | null
  /** 'inflation' ならインフレ率、数値なら毎年の値上がり率 */
  growth: 'inflation' | number
}

export interface Scenario {
  id: string
  name: string
  inflation: number
  wageGrowth: number
  returns: Record<ReturnKey, number>
  marketRate: { stepPerYear: number; maxIncrease: number }
  pensionAdjust: number
}

// ---- 結果 ----

export interface YearRow {
  year: number
  /** person id → 年齢 */
  ages: Record<string, number>
  inflationFactor: number
  income: {
    salary: Yen
    side: Yen
    pension: Yen
    severance: Yen
    childAllowance: Yen
    loanDeduction: Yen
    total: Yen
  }
  expense: {
    living: Yen
    hobby: Yen
    education: Yen
    costItems: Yen
    socialInsurance: Yen
    loan: Yen
    total: Yen
  }
  contributions: Yen
  /** 収入 − 支出 − 積立 */
  net: Yen
  /** account id → 期末残高 */
  balances: Record<string, Yen>
  byType: Partial<Record<AccountTypeId, Yen>>
  loanBalance: Yen
  liquid: Yen
  total: Yen
  shortfall: boolean
}

export interface SimulationResult {
  rows: YearRow[]
  /** 最初に不足が出た年（なければ null） */
  firstShortfallYear: number | null
  /** 目標の判定に使う年（最年長の大人が goal.atAge になる年） */
  goalYear: number
  goalMet: boolean
}
