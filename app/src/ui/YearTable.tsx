import { useState } from 'react'
import type { Household, SimulationResult, YearRow } from '../engine/types'
import { adultsOf } from '../engine/simulate'
import { AssetChart } from './AssetChart'

interface Props {
  household: Household
  result: SimulationResult
  real: boolean
}

const COLUMNS: { key: string; label: string; get: (r: YearRow) => number; detail?: boolean }[] = [
  { key: 'income', label: '収入', get: (r) => r.income.total },
  { key: 'salary', label: '給与', get: (r) => r.income.salary, detail: true },
  { key: 'side', label: 'サイド', get: (r) => r.income.side, detail: true },
  { key: 'pension', label: '年金', get: (r) => r.income.pension, detail: true },
  { key: 'other', label: '手当・控除等', get: (r) => r.income.childAllowance + r.income.loanDeduction + r.income.severance, detail: true },
  { key: 'expense', label: '支出', get: (r) => r.expense.total },
  { key: 'living', label: '生活費', get: (r) => r.expense.living, detail: true },
  { key: 'hobby', label: '趣味', get: (r) => r.expense.hobby, detail: true },
  { key: 'edu', label: '教育', get: (r) => r.expense.education, detail: true },
  { key: 'cost', label: '住居・車等', get: (r) => r.expense.costItems, detail: true },
  { key: 'si', label: '国保・国年', get: (r) => r.expense.socialInsurance, detail: true },
  { key: 'loan', label: 'ローン', get: (r) => r.expense.loan, detail: true },
  { key: 'contrib', label: '積立', get: (r) => r.contributions },
  { key: 'net', label: '収支', get: (r) => r.net },
  { key: 'total', label: '資産', get: (r) => r.total },
  { key: 'loanBal', label: 'ローン残高', get: (r) => r.loanBalance },
]

export function YearTable({ household, result, real }: Props) {
  const [detail, setDetail] = useState(false)
  const adults = adultsOf(household)
  const cols = COLUMNS.filter((c) => detail || !c.detail)
  const fmt = (r: YearRow, v: number) => (Math.round((real ? v / r.inflationFactor : v) / 10_000) || 0).toLocaleString('ja-JP')

  return (
    <>
      <section className="card">
        <h2>資産の推移</h2>
        <AssetChart rows={result.rows} real={real} agePerson={adults[0]} />
      </section>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>年ごとの収支（万円）</h2>
          <label className="check" style={{ minHeight: 0, fontSize: 13 }}>
            <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />内訳
          </label>
        </div>
        <div className="table-scroll">
          <table className="cf">
            <thead>
              <tr>
                <th>年</th>
                {adults.map((p) => <th key={p.id}>{p.nickname}</th>)}
                {cols.map((c) => <th key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.year} className={r.shortfall ? 'short' : undefined}>
                  <td>{r.year}{r.shortfall ? ' ⚠' : ''}</td>
                  {adults.map((p) => <td key={p.id}>{r.ages[p.id]}</td>)}
                  {cols.map((c) => {
                    const v = c.get(r)
                    return <td key={c.key} className={v <= -5_000 ? 'neg' : undefined}>{fmt(r, v)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">⚠ は資金が不足している年。「資産」は口座の合計で、ローン残高は引いていません。</p>
      </section>
    </>
  )
}
