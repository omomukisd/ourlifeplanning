import { useMemo } from 'react'
import type { AccountTypeId, Person, YearRow } from '../engine/types'
import { StackedAreaChart } from './StackedAreaChart'

// 資産の種類別の積み上げ面グラフ。

export const ASSET_GROUPS: { key: string; label: string; types: AccountTypeId[]; color: string }[] = [
  { key: 'cash', label: '現預金', types: ['cash', 'zaikei'], color: 'var(--series-1)' },
  { key: 'nisa', label: 'NISA', types: ['nisa'], color: 'var(--series-2)' },
  { key: 'pension', label: 'DC・iDeCo', types: ['dc', 'ideco'], color: 'var(--series-3)' },
  { key: 'other', label: 'その他', types: ['taxable', 'insurance', 'other'], color: 'var(--series-4)' },
]

interface Props {
  rows: YearRow[]
  real: boolean
  agePerson?: Person
  height?: number
}

export function AssetChart({ rows, real, agePerson, height }: Props) {
  const points = useMemo(() => rows.map((r) => {
    const div = real ? r.inflationFactor : 1
    const values = ASSET_GROUPS.map((g) => g.types.reduce((s, t) => s + (r.byType[t] ?? 0), 0) / div)
    return { year: r.year, values, total: r.total / div, alert: r.shortfall }
  }), [rows, real])
  return (
    <StackedAreaChart series={ASSET_GROUPS} points={points} ariaLabel="資産の推移（種類別の積み上げ）"
      agePerson={agePerson} height={height} alertLabel={{ legend: '不足', tooltip: '資金が不足' }} />
  )
}
