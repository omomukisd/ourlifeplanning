import { useState } from 'react'
import type { Household, Scenario } from '../engine/types'
import { earliestFor, type FireAnswer } from '../engine/solve'
import type { ScenarioAnswers } from '../worker'
import { man } from './format'

interface Props {
  household: Household
  scenario: Scenario
  answers: ScenarioAnswers | undefined
}

export function FirePage({ household, scenario, answers }: Props) {
  const [mode, setMode] = useState<'full' | 'side'>('full')
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [fixedIndex, setFixedIndex] = useState<0 | 1>(0)
  const [fixedAge, setFixedAge] = useState<number | null>(null)

  if (!answers) return <section className="card"><p>計算中…</p></section>
  const fire: FireAnswer = answers.fire[mode]
  const { adults, axes, cells } = fire
  if (adults.length === 0) return <section className="card"><p>大人を登録してください。</p></section>
  const two = adults.length > 1
  const now = adults.map((p) => household.startYear - p.birthYear)
  const cell = selected ? cells[selected[0]][selected[1]] : null
  const fixedAgeValue = fixedAge ?? axes[fixedIndex][Math.floor(axes[fixedIndex].length / 2)]
  const otherEarliest = two ? earliestFor(fire, fixedIndex, fixedAgeValue) : null
  const otherIndex = fixedIndex === 0 ? 1 : 0

  return (
    <>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>FIREできる退職年齢（{scenario.name}）</h2>
          <div className="segmented" role="group" aria-label="FIREの種類">
            <button aria-pressed={mode === 'full'} onClick={() => setMode('full')}>完全</button>
            <button aria-pressed={mode === 'side'} onClick={() => setMode('side')}>サイド</button>
          </div>
        </div>
        <p className="question" style={{ marginTop: 8 }}>
          {mode === 'side' ? '退職後もサイド収入がある場合。' : '退職後の収入が年金だけの場合。'}
          {two ? `縦が${adults[0].nickname}、横が${adults[1].nickname}の退職年齢。` : ''}
          緑のマスは{household.goal.atAge}歳まで資金が持つ組み合わせ。枠つきのマスは2人が同じ年に辞める組み合わせ。
        </p>
        <Heatmap fire={fire} now={now} selected={selected} onSelect={setSelected} />
        <ul className="legend" style={{ marginTop: 8 }}>
          <li><span className="swatch" style={{ background: 'var(--good-wash)', border: '1px solid var(--good)' }} />✓ 可能</li>
          <li><span className="swatch" style={{ background: 'var(--surface-2)', border: '1px solid var(--axis)' }} />不可</li>
        </ul>
        {cell ? (
          <div className="banner" style={{ marginTop: 8 }}>
            <strong>
              {adults.map((p, i) => `${p.nickname} ${axes[i][selected![i]]}歳`).join('・')}で退職
            </strong>
            <br />
            {cell.goalMet
              ? `✓ 可能：${household.goal.atAge}歳時点の資産 ${man(cell.balanceAtGoal)}（名目）`
              : `✕ 不可：${cell.firstShortfallYear ?? '目標年'}年に資金が不足`}
          </div>
        ) : <p className="note">マスをタップすると詳細を表示します。</p>}
      </section>

      {two && (
        <section className="card">
          <h2>片方の退職年齢を決めたとき</h2>
          <div className="fields">
            <div className="field">
              <label htmlFor="fixed-person">決める人</label>
              <select id="fixed-person" value={fixedIndex} onChange={(e) => { setFixedIndex(Number(e.target.value) as 0 | 1); setFixedAge(null) }}>
                {adults.map((p, i) => <option key={p.id} value={i}>{p.nickname}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fixed-age">退職年齢</label>
              <select id="fixed-age" value={fixedAgeValue} onChange={(e) => setFixedAge(Number(e.target.value))}>
                {axes[fixedIndex].map((a) => <option key={a} value={a}>{a}歳</option>)}
              </select>
            </div>
          </div>
          <p style={{ marginBottom: 0 }}>
            {otherEarliest !== null
              ? <>{adults[otherIndex].nickname}は最短 <strong>{otherEarliest}歳</strong>（{adults[otherIndex].birthYear + otherEarliest}年）で辞められます。</>
              : <>{adults[otherIndex].nickname}が65歳まで働いても難しい組み合わせです。</>}
          </p>
        </section>
      )}
    </>
  )
}

function Heatmap({ fire, now, selected, onSelect }: {
  fire: FireAnswer
  now: number[]
  selected: [number, number] | null
  onSelect: (s: [number, number]) => void
}) {
  const { axes, cells, adults } = fire
  const colCount = adults.length > 1 ? axes[1].length : 1
  const colAges = adults.length > 1 ? axes[1] : [0]
  return (
    <div>
      {adults.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${colCount}, 1fr)`, marginBottom: 2 }}>
          <span />
          {colAges.map((a) => <span key={a} className="heat-axis" style={{ textAlign: 'center' }}>{a % 5 === 0 ? a : ''}</span>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `28px 1fr` }}>
        <div style={{ display: 'grid', gridTemplateRows: `repeat(${axes[0].length}, 1fr)` }}>
          {axes[0].map((a) => <span key={a} className="heat-axis" style={{ display: 'flex', alignItems: 'center' }}>{a % 5 === 0 ? a : ''}</span>)}
        </div>
        <div className="heat" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }} role="grid" aria-label="退職年齢の組み合わせ">
          {cells.map((row, i) => row.map((c, j) => {
            const same = adults.length > 1 && axes[0][i] - now[0] === axes[1][j] - now[1]
            const label = adults.map((p, k) => `${p.nickname}${axes[k][k === 0 ? i : j]}歳`).join('・') + (c.goalMet ? ' 可能' : ' 不可')
            return (
              <button
                key={`${i}-${j}`}
                className={`${c.goalMet ? 'ok' : ''} ${same ? 'same' : ''}`}
                aria-pressed={selected?.[0] === i && selected?.[1] === j}
                aria-label={label}
                title={label}
                onClick={() => onSelect([i, j])}
              >{colCount <= 12 ? (c.goalMet ? '✓' : '') : ''}</button>
            )
          }))}
        </div>
      </div>
    </div>
  )
}
