import type { AccountTypeId, CostItem, ReturnKey, Scenario } from './types'

// マスタデータ。金額は今の価値（円）。出典と年度を併記し、年度ごとに更新する。

export interface AccountTypeMaster {
  id: AccountTypeId
  label: string
  /** この年齢から引き出せる（0 = いつでも） */
  withdrawableFromAge: number
  annualCap: number | null
  lifetimeCap: number | null
  defaultReturnKey: ReturnKey
}

export const ACCOUNT_TYPES: Record<AccountTypeId, AccountTypeMaster> = {
  cash: { id: 'cash', label: '現預金', withdrawableFromAge: 0, annualCap: null, lifetimeCap: null, defaultReturnKey: 'cash' },
  nisa: { id: 'nisa', label: 'NISA', withdrawableFromAge: 0, annualCap: 3_600_000, lifetimeCap: 18_000_000, defaultReturnKey: 'equity' },
  dc: { id: 'dc', label: '企業型DC', withdrawableFromAge: 60, annualCap: null, lifetimeCap: null, defaultReturnKey: 'equity' },
  ideco: { id: 'ideco', label: 'iDeCo', withdrawableFromAge: 60, annualCap: null, lifetimeCap: null, defaultReturnKey: 'equity' },
  taxable: { id: 'taxable', label: '課税口座', withdrawableFromAge: 0, annualCap: null, lifetimeCap: null, defaultReturnKey: 'equity' },
  zaikei: { id: 'zaikei', label: '財形貯蓄', withdrawableFromAge: 0, annualCap: null, lifetimeCap: null, defaultReturnKey: 'cash' },
  insurance: { id: 'insurance', label: '貯蓄型保険', withdrawableFromAge: 0, annualCap: null, lifetimeCap: null, defaultReturnKey: 'cash' },
  other: { id: 'other', label: 'その他', withdrawableFromAge: 0, annualCap: null, lifetimeCap: null, defaultReturnKey: 'balanced' },
}

export const RETURN_KEY_LABELS: Record<ReturnKey, string> = {
  equity: '株式中心',
  balanced: 'バランス型',
  cash: '預金',
}

// ---- 教育 ----
// 幼稚園〜高校：文部科学省「令和5年度子供の学習費調査」（学習費総額）
// 大学：日本政策金融公庫「教育費負担の実態調査」を参考にした概算（要確認）
// 専門学校・6年制・大学院：概算（要確認）

export interface EducationTypeCost {
  label: string
  /** 入学年に加算する費用 */
  enrollment: number
  annual: number
}

export interface EducationStageMaster {
  id: string
  label: string
  defaultStartAge: number
  defaultYears: number
  types: Record<string, EducationTypeCost>
}

export const EDUCATION_STAGES: EducationStageMaster[] = [
  {
    id: 'nursery', label: '保育（0〜2歳）', defaultStartAge: 1, defaultYears: 2,
    types: {
      home: { label: '家庭保育', enrollment: 0, annual: 0 },
      licensed: { label: '認可保育園', enrollment: 0, annual: 360_000 },
    },
  },
  {
    id: 'kindergarten', label: '幼稚園・保育園', defaultStartAge: 3, defaultYears: 3,
    types: {
      public: { label: '公立', enrollment: 0, annual: 184_646 },
      private: { label: '私立', enrollment: 0, annual: 347_338 },
    },
  },
  {
    id: 'elementary', label: '小学校', defaultStartAge: 6, defaultYears: 6,
    types: {
      public: { label: '公立', enrollment: 0, annual: 336_265 },
      private: { label: '私立', enrollment: 0, annual: 1_828_112 },
    },
  },
  {
    id: 'juniorHigh', label: '中学校', defaultStartAge: 12, defaultYears: 3,
    types: {
      public: { label: '公立', enrollment: 0, annual: 542_475 },
      private: { label: '私立', enrollment: 0, annual: 1_560_359 },
    },
  },
  {
    id: 'highSchool', label: '高校', defaultStartAge: 15, defaultYears: 3,
    types: {
      public: { label: '公立', enrollment: 0, annual: 597_752 },
      private: { label: '私立', enrollment: 0, annual: 1_030_283 },
    },
  },
  {
    id: 'university', label: '大学（4年制）', defaultStartAge: 18, defaultYears: 4,
    types: {
      national: { label: '国公立', enrollment: 672_000, annual: 1_035_000 },
      privateArts: { label: '私立文系', enrollment: 818_000, annual: 1_520_000 },
      privateScience: { label: '私立理系', enrollment: 880_000, annual: 1_832_000 },
    },
  },
  {
    id: 'university6', label: '大学（6年制）', defaultStartAge: 18, defaultYears: 6,
    types: {
      national: { label: '国公立', enrollment: 672_000, annual: 1_035_000 },
      privatePharma: { label: '私立薬学', enrollment: 1_000_000, annual: 2_000_000 },
      privateMedical: { label: '私立医歯', enrollment: 1_500_000, annual: 4_000_000 },
    },
  },
  {
    id: 'vocational', label: '専門学校', defaultStartAge: 18, defaultYears: 2,
    types: {
      private: { label: '私立', enrollment: 300_000, annual: 1_300_000 },
    },
  },
  {
    id: 'master', label: '大学院（修士）', defaultStartAge: 22, defaultYears: 2,
    types: {
      national: { label: '国公立', enrollment: 282_000, annual: 700_000 },
      private: { label: '私立', enrollment: 250_000, annual: 1_200_000 },
    },
  },
  {
    id: 'doctor', label: '大学院（博士）', defaultStartAge: 24, defaultYears: 3,
    types: {
      national: { label: '国公立', enrollment: 282_000, annual: 700_000 },
      private: { label: '私立', enrollment: 250_000, annual: 1_200_000 },
    },
  },
]

/** 一人暮らしの仕送り（年額・概算） */
export const LIVING_AWAY_ANNUAL = 960_000

export function findStage(id: string): EducationStageMaster | undefined {
  return EDUCATION_STAGES.find((s) => s.id === id)
}

// ---- 公的年金・社会保険 ----

export const PENSION = {
  /** 老齢基礎年金の満額（令和8年度：月70,608円） */
  basicFullAnnual: 70_608 * 12,
  /** 報酬比例部分の乗率（平成15年4月以降） */
  employeeRate: 5.481 / 1000,
  /** 標準報酬の上限から求めた、年金計算に使う額面年収の上限（月65万×12 + 賞与150万×2） */
  grossCap: 650_000 * 12 + 1_500_000 * 2,
  deferralPerMonth: 0.007,
  advancePerMonth: 0.004,
}

export const SOCIAL_INSURANCE = {
  /** 国民年金保険料（月額・令和7年度） */
  nationalPensionMonthly: 17_510,
  /** 国民健康保険：所得割の率（自治体で異なる・概算） */
  nhiIncomeRate: 0.10,
  /** 国民健康保険：1人あたりの均等割（年額・概算） */
  nhiPerCapita: 50_000,
  /** 国民健康保険：世帯の上限（年額・概算） */
  nhiCap: 1_090_000,
  /** 額面年収から「所得」への簡易換算（給与所得控除の近似） */
  incomeFromGrossRatio: 0.7,
}

/** 児童手当（2024年10月からの制度・月額） */
export const CHILD_ALLOWANCE = {
  under3: 15_000,
  from3: 10_000,
  thirdOrLater: 30_000,
  /** この年齢の年まで支給（高校卒業まで） */
  untilAge: 17,
}

// ---- シナリオ ----

export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: 'standard', name: '標準',
    inflation: 0.02, wageGrowth: 0.015,
    returns: { equity: 0.05, balanced: 0.03, cash: 0.002 },
    marketRate: { stepPerYear: 0.001, maxIncrease: 0.01 },
    pensionAdjust: -0.1,
  },
  {
    id: 'pessimistic', name: '悲観',
    inflation: 0.03, wageGrowth: 0.005,
    returns: { equity: 0.02, balanced: 0.01, cash: 0 },
    marketRate: { stepPerYear: 0.0025, maxIncrease: 0.02 },
    pensionAdjust: -0.3,
  },
]

// ---- プリセット ----

export interface CostPreset {
  id: string
  name: string
  amount: number
  intervalYears: number
  growth: CostItem['growth']
  note?: string
}

export const COST_PRESETS: CostPreset[] = [
  { id: 'carReplace', name: '車の買い替え', amount: 3_000_000, intervalYears: 7, growth: 'inflation' },
  { id: 'carUpkeep', name: '車の維持費（税・保険・車検）', amount: 300_000, intervalYears: 1, growth: 'inflation' },
  { id: 'appliances', name: '家電の買い替え', amount: 100_000, intervalYears: 1, growth: 'inflation', note: '毎年に均した値' },
  { id: 'phone', name: 'スマホの買い替え（1人分）', amount: 150_000, intervalYears: 4, growth: 'inflation' },
  { id: 'propertyTax', name: '固定資産税', amount: 150_000, intervalYears: 1, growth: 0, note: '納税通知書の額に変更' },
  { id: 'fireInsurance', name: '火災保険・地震保険', amount: 100_000, intervalYears: 5, growth: 'inflation' },
  { id: 'condoMgmt', name: 'マンション：管理費', amount: 240_000, intervalYears: 1, growth: 'inflation', note: '年額。月額×12' },
  { id: 'condoRepair', name: 'マンション：修繕積立金', amount: 180_000, intervalYears: 1, growth: 0.03, note: '年額。段階的に値上がり' },
  { id: 'houseExterior', name: '戸建：外壁・屋根の修繕', amount: 1_500_000, intervalYears: 15, growth: 'inflation' },
  { id: 'waterHeater', name: '戸建：給湯器の交換', amount: 300_000, intervalYears: 12, growth: 'inflation' },
]
