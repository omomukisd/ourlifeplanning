import type { Household, Scenario, SimulationResult } from '../engine/types'
import { answerRetirement } from '../engine/solve'
import { adultsOf } from '../engine/simulate'
import type { ScenarioAnswers } from '../worker'
import { AssetChart } from './AssetChart'
import { man, manDetail } from './format'

interface Props {
  household: Household
  results: Record<string, SimulationResult>
  answers: Record<string, ScenarioAnswers> | null
  scenario: Scenario
  real: boolean
}

export function Dashboard({ household, results, answers, scenario, real }: Props) {
  const scenarios = household.scenarios
  const adults = adultsOf(household)
  const deflate = (sc: Scenario, year: number, v: number) =>
    real ? v / Math.pow(1 + sc.inflation, year - household.startYear) : v

  return (
    <>
      <section className="card" aria-labelledby="q1">
        <h2 id="q1">老後資金は足りる？</h2>
        <p className="question">
          {adults[0]?.nickname ?? '最年長'}が{household.goal.atAge}歳になるまで、{household.goal.minBalance > 0 ? `資産が${man(household.goal.minBalance)}以上残るか` : '資金が尽きないか'}
        </p>
        <div className="answer-grid">
          {scenarios.map((sc) => {
            const a = answerRetirement(household, results[sc.id])
            return (
              <div key={sc.id}>
                <div className="label">{sc.name}</div>
                {a.goalMet ? (
                  <>
                    <span className="status good">✓ 足りる</span>
                    <div className="value">{man(deflate(sc, a.goalYear, a.balanceAtGoal))}</div>
                    <div className="sub">{household.goal.atAge}歳時点の資産</div>
                  </>
                ) : (
                  <>
                    <span className="status bad">✕ 不足</span>
                    <div className="value">{a.shortfallYear ?? a.goalYear}年</div>
                    <div className="sub">
                      {a.shortfallAges.length
                        ? a.shortfallAges.map((x) => `${x.nickname} ${x.age}歳`).join('・') + 'で資金が尽きる'
                        : '目標の残高に届かない'}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="q2">
        <h2 id="q2">趣味に使えるお金は？</h2>
        <p className="question">老後資金を守れる、毎月の趣味予算の上限（今の価値）</p>
        <div className="answer-grid">
          {scenarios.map((sc) => {
            const h = answers?.[sc.id]?.hobby
            return (
              <div key={sc.id}>
                <div className="label">{sc.name}</div>
                {!h ? <div className="value">…</div> : h.maxMonthly === null ? (
                  <>
                    <span className="status bad">✕ 趣味0円でも不足</span>
                    <div className="sub">生活費や積立の見直しが必要</div>
                  </>
                ) : (
                  <>
                    <div className="value">月{manDetail(h.maxMonthly)}{h.atUpperBound ? '以上' : ''}</div>
                    <div className="sub">今の設定：月{manDetail(household.hobbyMonthly)}</div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="q3">
        <h2 id="q3">FIREはできる？</h2>
        <p className="question">{adults.length > 1 ? '2人が同じ年に仕事を辞める場合の、最短の年' : '最短で仕事を辞められる年'}</p>
        <div className="answer-grid">
          {scenarios.map((sc) => {
            const f = answers?.[sc.id]?.fire
            return (
              <div key={sc.id}>
                <div className="label">{sc.name}</div>
                {!f ? <div className="value">…</div> : (
                  <>
                    <FireLine label="完全FIRE" e={f.full.earliestSameYear} household={household} />
                    <FireLine label="サイドFIRE" e={f.side.earliestSameYear} household={household} />
                  </>
                )}
              </div>
            )
          })}
        </div>
        <p className="note">退職年齢をずらす組み合わせは「FIRE」タブで確認できます。</p>
      </section>

      <section className="card" aria-labelledby="chart">
        <h2 id="chart">資産の推移（{scenario.name}・{real ? '今の価値' : '名目'}）</h2>
        <AssetChart rows={results[scenario.id].rows} real={real} agePerson={adults[0]} />
      </section>
    </>
  )
}

function FireLine({ label, e, household }: {
  label: string
  e: { year: number; ages: number[]; requiredAssets: number } | null
  household: Household
}) {
  const adults = adultsOf(household)
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="sub">{label}</div>
      {e ? (
        <>
          <div className="value" style={{ fontSize: 18 }}>{e.year}年</div>
          <div className="sub">{adults.map((p, i) => `${p.nickname} ${e.ages[i]}歳`).join('・')}／必要資産 {man(e.requiredAssets)}</div>
        </>
      ) : (
        <div className="sub"><span className="status bad">✕ 65歳までは難しい</span></div>
      )}
    </div>
  )
}
