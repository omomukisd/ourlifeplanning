import { findStage } from './masters'
import type { EducationStep } from './types'

// 子どもの進路を「段階ごとの選択」で扱う。開始年齢と年数はマスタの標準値から自動で決まる。
// 画面ではこの ChildPlan を編集し、保存するときに EducationStep[] に変換する。

export const BASIC_STAGE_IDS = ['nursery', 'kindergarten', 'elementary', 'juniorHigh', 'highSchool'] as const
export type BasicStageId = (typeof BASIC_STAGE_IDS)[number]

/** 高校の後の進路として選べる段階 */
export const AFTER_STAGE_IDS = ['university', 'university6', 'vocational']
/** 大学院に進める進路 */
const GRAD_ALLOWED_AFTER = ['university', 'university6']

export const NONE = 'none'

export interface ChildPlan {
  basic: Record<BasicStageId, string>
  /** 'none' または 'stageId:typeId' */
  after: string
  /** 'none'、'master:typeId'（修士まで）、'doctor:typeId'（博士まで） */
  grad: string
  /** 高校の後、一人暮らしをする（仕送り） */
  livingAway: boolean
}

const AFTER_START_AGE = 18

const DEFAULT_BASIC: Record<BasicStageId, string> = {
  nursery: 'home', kindergarten: 'public', elementary: 'public', juniorHigh: 'public', highSchool: 'public',
}

export function defaultChildPlan(): ChildPlan {
  return { basic: { ...DEFAULT_BASIC }, after: 'university:national', grad: NONE, livingAway: false }
}

export function planFromSteps(steps: EducationStep[]): ChildPlan {
  const plan: ChildPlan = { basic: { ...DEFAULT_BASIC }, after: NONE, grad: NONE, livingAway: false }
  for (const id of BASIC_STAGE_IDS) {
    const s = steps.find((x) => x.stageId === id)
    if (s && findStage(id)?.types[s.typeId]) plan.basic[id] = s.typeId
  }
  const after = steps.find((x) => AFTER_STAGE_IDS.includes(x.stageId))
  if (after) {
    plan.after = `${after.stageId}:${after.typeId}`
    plan.livingAway = after.livingAway
  }
  const doctor = steps.find((x) => x.stageId === 'doctor')
  const master = steps.find((x) => x.stageId === 'master')
  if (doctor) plan.grad = `doctor:${doctor.typeId}`
  else if (master) plan.grad = `master:${master.typeId}`
  return plan
}

export function stepsFromPlan(plan: ChildPlan): EducationStep[] {
  const steps: EducationStep[] = []
  const push = (stageId: string, typeId: string, startAge: number, livingAway = false) => {
    const st = findStage(stageId)
    if (!st || !st.types[typeId]) return 0
    steps.push({ stageId, typeId, startAge, years: st.defaultYears, livingAway })
    return st.defaultYears
  }
  for (const id of BASIC_STAGE_IDS) {
    const typeId = plan.basic[id]
    if (id === 'nursery' && typeId === 'home') continue // 家庭保育は費用 0 なので段階を作らない
    push(id, typeId, findStage(id)!.defaultStartAge)
  }
  if (plan.after === NONE) return steps
  const [afterStage, afterType] = plan.after.split(':')
  const afterYears = push(afterStage, afterType, AFTER_START_AGE, plan.livingAway)
  if (plan.grad === NONE || !GRAD_ALLOWED_AFTER.includes(afterStage)) return steps
  const [gradLevel, gradType] = plan.grad.split(':')
  const masterYears = push('master', gradType, AFTER_START_AGE + afterYears, plan.livingAway)
  if (gradLevel === 'doctor') push('doctor', gradType, AFTER_START_AGE + afterYears + masterYears, plan.livingAway)
  return steps
}

export function gradAllowed(plan: ChildPlan): boolean {
  return GRAD_ALLOWED_AFTER.includes(plan.after.split(':')[0])
}
