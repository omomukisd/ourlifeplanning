import { useState } from 'react'
import { currentYearMonth, sortActuals, summarize } from '../engine/actuals'
import { lifeEvents } from '../engine/events'
import { adultsOf } from '../engine/simulate'
import { answerRetirement } from '../engine/solve'
import type { Household, Scenario, SimulationResult } from '../engine/types'
import type { ScenarioAnswers } from '../worker'
import { man, manDetail } from './format'
import { Icon } from './icons'
import { ScenarioChart } from './ScenarioChart'

// ホーム：①資産の推移（結論つき）②これからの出来事 ③今月の実績 ④趣味に使えるお金

interface Props {
  household: Household
  results: Record<string, SimulationResult>
  answers: Record<string, ScenarioAnswers> | null
  scenario: Scenario
  onGoActuals: () => void
}

const TIMELINE_INITIAL = 6

export function Dashboard({ household: h, results, answers, scenario, onGoActuals }: Props) {
  const adults = adultsOf(h)
  const result = results[scenario.id]
  const others = h.scenarios.filter((s) => s.id !== scenario.id)

  return (
    <>
      <OutlookCard household={h} results={results} scenario={scenario} others={others} />
      <TimelineCard household={h} scenario={scenario} result={result} answers={answers?.[scenario.id]} />
      <ActualsCard household={h} result={result} onGoActuals={onGoActuals} />
      <HobbyCard household={h} scenario={scenario} others={others} answers={answers} />
      {adults.length === 0 && <p className="note">「入力」タブで大人を追加すると、計算が始まります。</p>}
    </>
  )
}

function OutlookCard({ household: h, results, scenario, others }: { household: Household; results: Record<string, SimulationResult>; scenario: Scenario; others: Scenario[] }) {
  const adults = adultsOf(h)
  const a = answerRetirement(h, results[scenario.id])
  const realAtGoal = a.balanceAtGoal / Math.pow(1 + scenario.inflation, a.goalYear - h.startYear)
  const who = adults[0]?.nickname ?? ''
  const goalText = h.goal.minBalance > 0 ? `${h.goal.atAge}歳で${man(h.goal.minBalance)}以上残せる` : `${h.goal.atAge}歳までお金は大丈夫`
  const agesText = (ages: { nickname: string; age: number }[]) => ages.map((x) => `${x.nickname}${x.age}歳`).join('・')

  return (
    <section className="card" aria-labelledby="outlook">
      <div className="verdict">
        <div className={`mark ${a.goalMet ? 'good' : 'bad'}`}><Icon name={a.goalMet ? 'check' : 'alert'} size={24} strokeWidth={3} /></div>
        <div>
          <div className="title" id="outlook">
            {a.goalMet
              ? goalText
              : a.shortfallYear !== null ? `${a.shortfallYear}年にお金が足りなくなります` : `${h.goal.atAge}歳の目標に届きません`}
          </div>
          <div className="sub">
            {a.goalMet
              ? `${who}が${h.goal.atAge}歳のとき ${man(realAtGoal)} 残る見込み（今の価値）`
              : a.shortfallYear !== null ? `${agesText(a.shortfallAges)}のとき・シナリオ「${scenario.name}」` : `${h.goal.atAge}歳時点の資産 ${man(realAtGoal)}（今の価値）`}
          </div>
        </div>
      </div>
      <ScenarioChart scenarios={h.scenarios} results={results} agePerson={adults[0]} />
      {others.map((sc) => {
        const o = answerRetirement(h, results[sc.id])
        if (o.goalMet) return a.goalMet ? null : <div key={sc.id} className="callout good">「{sc.name}」なら{h.goal.atAge}歳まで足ります</div>
        return (
          <div key={sc.id} className="callout">
            「{sc.name}」の場合は、{o.shortfallYear !== null ? `${o.shortfallYear}年（${agesText(o.shortfallAges)}）にお金が足りなくなります` : `${h.goal.atAge}歳の目標に届きません`}
          </div>
        )
      })}
    </section>
  )
}

function TimelineCard({ household: h, scenario, result, answers }: { household: Household; scenario: Scenario; result: SimulationResult; answers?: ScenarioAnswers }) {
  const [all, setAll] = useState(false)
  const events = lifeEvents(h, scenario, result, answers?.fire)
  const shown = all ? events : events.slice(0, TIMELINE_INITIAL)
  return (
    <section className="card" aria-labelledby="timeline">
      <h2 id="timeline">これからの出来事</h2>
      {events.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>子どもの進路・退職年齢・ローンを入力すると、ここに年表ができます。</p>
      ) : (
        <ol className="timeline">
          {shown.map((e, i) => (
            <li key={`${e.year}-${i}`}>
              <span className="year">{e.year}</span>
              <span className="rail" aria-hidden="true"><span className={`dot ${e.kind}`} /><span className="line" /></span>
              <span className="what">{e.title}{e.detail && <span className="detail" style={{ display: 'block' }}>{e.detail}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {events.length > TIMELINE_INITIAL && (
        <button className="link-btn" onClick={() => setAll(!all)}>{all ? '閉じる' : `すべて見る（${events.length}件）`}</button>
      )}
    </section>
  )
}

function ActualsCard({ household: h, result, onGoActuals }: { household: Household; result: SimulationResult; onGoActuals: () => void }) {
  const list = sortActuals(h.actuals)
  const latest = list[list.length - 1]
  if (!latest) {
    return (
      <section className="card" aria-labelledby="actuals">
        <h2 id="actuals">今月の実績</h2>
        <p className="note" style={{ margin: 0 }}>毎月の手取りと支出を記録すると、計画どおりかどうかがここに出ます。</p>
        <div className="row-actions"><button className="btn primary" onClick={onGoActuals}>実績を記録する</button></div>
      </section>
    )
  }
  const isThisMonth = latest.yearMonth === currentYearMonth()
  const left = latest.income - latest.expense
  const s = summarize(list, result)
  const plan = s?.planExpenseAvg ?? null
  const diff = s && plan !== null ? s.expenseAvg - plan : 0
  const over = plan !== null && diff > plan * 0.05
  const close = plan !== null && Math.abs(diff) <= plan * 0.05
  return (
    <section className="card" aria-labelledby="actuals">
      <div className="card-head">
        <h2 id="actuals">{isThisMonth ? '今月の実績' : '最新の実績'}</h2>
        <span className="aside">{Number(latest.yearMonth.slice(0, 4))}年{Number(latest.yearMonth.slice(5))}月</span>
      </div>
      <div className="stat-grid">
        <div><div className="label">入ってきた</div><div className="value">{(latest.income / 10_000).toFixed(1)}<small>万</small></div></div>
        <div><div className="label">使った</div><div className="value">{(latest.expense / 10_000).toFixed(1)}<small>万</small></div></div>
        <div><div className="label">のこった</div><div className={`value ${left >= 0 ? 'plus' : 'minus'}`}>{left >= 0 ? '+' : '−'}{(Math.abs(left) / 10_000).toFixed(1)}<small>万</small></div></div>
      </div>
      {s && plan !== null && (
        <div className={`compare${over ? ' over' : ''}`}>
          <div className="meter-label"><span>使ったお金（{s.months}か月平均）</span><span>計画 {manDetail(plan)}</span></div>
          <div className="meter" role="img" aria-label={`平均 ${manDetail(s.expenseAvg)}、計画 ${manDetail(plan)}`}>
            <div className={`fill${over ? ' over' : ''}`} style={{ width: `${Math.min(100, (s.expenseAvg / plan) * 100)}%` }} />
          </div>
          <div className="compare-msg">
            平均 {manDetail(s.expenseAvg)}・
            {close ? <strong>ほぼ計画どおり</strong> : over
              ? <strong>計画より月{manDetail(diff)}多く使っています</strong>
              : <strong>計画より月{manDetail(-diff)}少なく済んでいます</strong>}
          </div>
        </div>
      )}
      {!isThisMonth && <div className="row-actions"><button className="btn small" onClick={onGoActuals}>今月の分を記録する</button></div>}
    </section>
  )
}

function HobbyCard({ household: h, scenario, others, answers }: { household: Household; scenario: Scenario; others: Scenario[]; answers: Record<string, ScenarioAnswers> | null }) {
  const a = answers?.[scenario.id]?.hobby
  const text = (x?: ScenarioAnswers['hobby']) => !x ? '計算中…' : x.maxMonthly === null ? '0円でも足りない' : `月${manDetail(x.maxMonthly)}${x.atUpperBound ? '以上' : 'まで'}`
  return (
    <section className="card" aria-labelledby="hobby">
      <div className="hobby">
        <div>
          <div className="note" style={{ margin: 0 }} id="hobby">趣味に使えるお金</div>
          <div className="big">{text(a)}</div>
        </div>
        <div className="side">いまは<br />月{manDetail(h.hobbyMonthly)}</div>
      </div>
      {a?.maxMonthly === null && <div className="callout">趣味を0円にしても目標に届きません。生活費や積立を見直してください。</div>}
      {others.map((sc) => (
        <p key={sc.id} className="note">「{sc.name}」なら {text(answers?.[sc.id]?.hobby)}</p>
      ))}
    </section>
  )
}
