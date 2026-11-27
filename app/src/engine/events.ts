import { lastPayment } from './loan'
import { findStage } from './masters'
import { adultsOf } from './simulate'
import type { FireAnswer } from './solve'
import type { Household, Scenario, SimulationResult } from './types'

// ホームの年表に出す「これからの出来事」。計画の数字から自動で作る。

export type LifeEventKind = 'family' | 'good' | 'money' | 'bad'

export interface LifeEvent {
  year: number
  title: string
  detail?: string
  kind: LifeEventKind
}

const man = (yen: number) => `${Math.round(yen / 10_000).toLocaleString('ja-JP')}万円`

/** 「大学（4年制）」→「大学」のように、かっこ書きを外す */
const shortLabel = (label: string) => label.replace(/（.*?）/g, '')

export function lifeEvents(
  h: Household, scenario: Scenario, result: SimulationResult,
  fire?: { full: FireAnswer; side: FireAnswer },
): LifeEvent[] {
  const from = h.startYear
  const until = result.rows[result.rows.length - 1]?.year ?? from + 80
  const events: LifeEvent[] = []
  const adults = adultsOf(h)
  const agesText = (year: number) => adults.map((p) => `${p.nickname}${year - p.birthYear}歳`).join('・')

  // 子どもの入学（保育は除く）。年額の目安を添える
  for (const c of h.persons.filter((p) => p.role === 'child')) {
    for (const step of c.education ?? []) {
      if (step.stageId === 'nursery') continue
      const year = c.birthYear + step.startAge
      if (year <= from) continue
      const stage = findStage(step.stageId)
      const type = stage?.types[step.typeId]
      if (!stage || !type) continue
      const verb = step.stageId === 'kindergarten' ? '入園' : '入学'
      const name = step.stageId === 'kindergarten' ? '幼稚園・保育園' : shortLabel(stage.label)
      events.push({
        year, kind: 'family',
        title: `${c.nickname}が${name}に${verb}`,
        detail: `${type.label}・教育費 年${man(type.annual)}${step.livingAway ? '＋仕送り' : ''}`,
      })
    }
  }

  // 大人の退職と年金
  for (const p of adults) {
    const inc = p.income!
    const retireYear = p.birthYear + inc.retireAge
    if (retireYear > from) {
      events.push({
        year: retireYear, kind: 'family',
        title: `${p.nickname}が退職`,
        detail: `${inc.retireAge}歳${inc.severance && inc.severance.amount > 0 ? `・退職金 ${man(inc.severance.amount)}` : ''}`,
      })
    }
    const pensionYear = p.birthYear + inc.pension.startAge
    const pension = result.pensionByPerson[p.id]
    if (pensionYear > from && pension) {
      events.push({
        year: pensionYear, kind: 'money',
        title: `${p.nickname}の年金がスタート`,
        detail: `年${man(pension.annual * (1 + scenario.pensionAdjust))}の見込み（今の価値）`,
      })
    }
  }

  // ローンの完済
  for (const loan of h.loans) {
    const end = lastPayment(loan)
    if (end.year >= from && loan.principal > 0) {
      events.push({ year: end.year, kind: 'money', title: `${loan.name}を完済`, detail: `${end.month}月の返済で終わり` })
    }
  }

  // FIRE できる最短の年（2人が同じ年に辞める場合）
  if (fire?.side.earliestSameYear && fire.side.earliestSameYear.year > from) {
    const e = fire.side.earliestSameYear
    events.push({ year: e.year, kind: 'good', title: 'サイドFIREできる', detail: agesText(e.year) })
  }
  if (fire?.full.earliestSameYear && fire.full.earliestSameYear.year > from) {
    const e = fire.full.earliestSameYear
    events.push({ year: e.year, kind: 'good', title: '完全FIREできる', detail: `必要な資産 ${man(e.requiredAssets)}` })
  }

  // お金が足りなくなる年
  if (result.firstShortfallYear !== null) {
    events.push({ year: result.firstShortfallYear, kind: 'bad', title: 'お金が足りなくなる', detail: agesText(result.firstShortfallYear) })
  }

  const order: Record<LifeEventKind, number> = { bad: 0, good: 1, family: 2, money: 3 }
  return events
    .filter((e) => e.year <= until)
    .sort((a, b) => a.year - b.year || order[a.kind] - order[b.kind])
}
