import { useState } from 'react'
import {
  currentYearMonth, expenseMovingAverage, planMonthly, sortActuals, summarize, upsertActual,
} from '../engine/actuals'
import type { Household, MonthlyActual, SimulationResult } from '../engine/types'
import { ManField } from './fields'
import { manDetail } from './format'
import { MonthlyChart } from './MonthlyChart'

// 毎月の実績（手取りと支出）の入力と、計画との比較。

interface Props {
  household: Household
  update: (fn: (draft: Household) => void) => void
  /** 選んでいるシナリオの計算結果（計画の支出に使う） */
  result: SimulationResult
  scenarioName: string
}

const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${manDetail(Math.abs(v))}`

export function ActualsPage({ household: h, update, result, scenarioName }: Props) {
  const list = sortActuals(h.actuals)
  const [month, setMonth] = useState(currentYearMonth())
  const existing = list.find((a) => a.yearMonth === month)
  const [income, setIncome] = useState<number | null>(existing?.income ?? null)
  const [expense, setExpense] = useState<number | null>(existing?.expense ?? null)
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const [saved, setSaved] = useState<string | null>(null)

  const selectMonth = (ym: string) => {
    const e = list.find((a) => a.yearMonth === ym)
    setMonth(ym)
    setIncome(e?.income ?? null)
    setExpense(e?.expense ?? null)
    setMemo(e?.memo ?? '')
    setSaved(null)
  }

  const canSave = /^\d{4}-\d{2}$/.test(month) && income !== null && expense !== null
  const save = () => {
    if (!canSave) return
    const entry: MonthlyActual = { yearMonth: month, income: income!, expense: expense!, ...(memo.trim() ? { memo: memo.trim() } : {}) }
    update((d) => { d.actuals = upsertActual(d.actuals, entry) })
    setSaved(month)
  }

  const summary = summarize(list, result)
  const avg = new Map(expenseMovingAverage(list).map((x) => [x.yearMonth, x.value]))
  const chartPoints = list.slice(-24).map((a) => ({
    yearMonth: a.yearMonth, income: a.income, expense: a.expense,
    planExpense: planMonthly(result, a.yearMonth)?.expense ?? null,
    expenseAvg: avg.get(a.yearMonth) ?? a.expense,
  }))

  return (
    <>
      <section className="card">
        <h2>月の記録</h2>
        <div className="fields">
          <div className="field wide">
            <label htmlFor="actual-month">月</label>
            <input id="actual-month" type="month" value={month} onChange={(e) => selectMonth(e.target.value)} />
          </div>
          <ManField label="収入（手取り）" value={income} allowEmpty onChange={setIncome}
            hint="給与振込・ボーナス・児童手当など、入ってきたお金の合計" />
          <ManField label="支出" value={expense} allowEmpty onChange={setExpense}
            hint="使ったお金の合計（ローン返済・教育費も含む）。積立・投資に回した分は含めない" />
          <div className="field wide">
            <label htmlFor="actual-memo">メモ（任意）</label>
            <input id="actual-memo" type="text" value={memo} placeholder="例：車検、家電の買い替え" onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        {income !== null && expense !== null && (
          <p className="note" style={{ margin: '8px 0 0' }}>この月の収支：{signed(income - expense)}</p>
        )}
        <div className="row-actions">
          <button className="btn primary" disabled={!canSave} onClick={save}>{existing ? 'この月の記録を上書きする' : '記録する'}</button>
        </div>
        {saved === month && <p className="note" role="status" style={{ margin: '4px 0 0' }}>✓ {ymLabel(month)}を記録しました</p>}
      </section>

      {summary ? (
        <>
          <section className="card">
            <h2>直近{summary.months}か月の平均（月あたり）</h2>
            <p className="question">{ymLabel(summary.from)}〜{ymLabel(summary.to)}{summary.months < 12 && '（記録がある月だけ）'}</p>
            <div className="stat-grid">
              <div><div className="label">収入</div><div className="value">{manDetail(summary.incomeAvg)}</div></div>
              <div><div className="label">支出</div><div className="value">{manDetail(summary.expenseAvg)}</div></div>
              <div>
                <div className="label">貯蓄</div>
                <div className="value">{signed(summary.savingAvg)}</div>
                {summary.savingRate !== null && <div className="sub">収入の{Math.round(summary.savingRate * 100)}%</div>}
              </div>
            </div>
            {summary.planExpenseAvg !== null && (
              <PlanCompare actual={summary.expenseAvg} plan={summary.planExpenseAvg} planIncome={summary.planIncomeAvg} actualIncome={summary.incomeAvg} scenarioName={scenarioName} />
            )}
          </section>

          <section className="card">
            <h2>月ごとの収入と支出</h2>
            <MonthlyChart points={chartPoints} />
            <p className="note">ボーナス月や大きな出費で月ごとの値はばらつくので、12か月平均で計画と比べてください。</p>
          </section>

          <section className="card">
            <h2>記録の一覧</h2>
            <div className="table-scroll">
              <table className="cf actuals">
                <thead><tr><th>月</th><th>収入</th><th>支出</th><th>収支</th><th aria-label="操作" /></tr></thead>
                <tbody>
                  {[...list].reverse().map((a) => (
                    <tr key={a.yearMonth}>
                      <td>{a.yearMonth.replace('-', '/')}{a.memo && <div className="memo">{a.memo}</div>}</td>
                      <td>{(a.income / 10_000).toFixed(1)}</td>
                      <td>{(a.expense / 10_000).toFixed(1)}</td>
                      <td className={a.income - a.expense < 0 ? 'neg' : undefined}>{((a.income - a.expense) / 10_000).toFixed(1)}</td>
                      <td>
                        <button className="btn small" onClick={() => { selectMonth(a.yearMonth); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>直す</button>
                        <button className="btn small danger" style={{ marginLeft: 4 }} onClick={() => {
                          if (confirm(`${ymLabel(a.yearMonth)}の記録を消しますか？`)) update((d) => { d.actuals = d.actuals.filter((x) => x.yearMonth !== a.yearMonth) })
                        }}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">単位は万円。</p>
          </section>
        </>
      ) : (
        <section className="card">
          <p className="note" style={{ margin: 0 }}>まだ記録がありません。毎月1回、その月の手取りと支出の合計を記録すると、計画（「入力」の生活費・趣味予算・住居費など）と比べられます。</p>
        </section>
      )}
    </>
  )
}

function PlanCompare({ actual, plan, actualIncome, planIncome, scenarioName }: { actual: number; plan: number; actualIncome: number; planIncome: number | null; scenarioName: string }) {
  const diff = actual - plan
  const close = Math.abs(diff) < plan * 0.05
  return (
    <div className={`compare ${close ? '' : diff > 0 ? 'over' : 'under'}`}>
      <div className="compare-row">
        <span>計画の支出（月平均）</span><strong>{manDetail(plan)}</strong>
      </div>
      <div className="compare-msg">
        {close
          ? '✓ 支出はほぼ計画どおりです'
          : diff > 0
            ? `▲ 計画より月 ${manDetail(diff)} 多く使っています（年 約${Math.round((diff * 12) / 10_000)}万円）`
            : `▼ 計画より月 ${manDetail(-diff)} 少なく済んでいます（年 約${Math.round((-diff * 12) / 10_000)}万円）`}
      </div>
      {planIncome !== null && (
        <div className="compare-sub">収入は計画 {manDetail(planIncome)} に対して実績 {manDetail(actualIncome)}（{signed(actualIncome - planIncome)}）</div>
      )}
      <div className="compare-sub">計画はシナリオ「{scenarioName}」の今年の年額 ÷ 12（車の買い替えなどの数年ごとの出費や、退職後の社会保険も含む）</div>
    </div>
  )
}
