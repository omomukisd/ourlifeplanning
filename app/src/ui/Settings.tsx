import { useRef } from 'react'
import {
  ACCOUNT_TYPES, COST_PRESETS, EDUCATION_STAGES, RETURN_KEY_LABELS, findStage,
} from '../engine/masters'
import { DEFAULT_INCOME_CURVE } from '../engine/sample'
import type { AccountTypeId, Household, Person, ReturnKey } from '../engine/types'
import { exportJson, importJson } from '../storage'
import { CheckField, ManField, NumField, PctField, SelectField, TextField } from './fields'
import { newId } from './format'

interface Props {
  household: Household
  update: (fn: (draft: Household) => void) => void
  replace: (h: Household) => void
  resetToSample: () => void
}

export function Settings({ household: h, update, replace, resetToSample }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const adults = h.persons.filter((p) => p.role === 'adult')
  const children = h.persons.filter((p) => p.role === 'child')
  const ownerOptions = [{ value: '', label: '世帯（共有）' }, ...adults.map((p) => ({ value: p.id, label: p.nickname }))]
  const personIndex = (id: string) => h.persons.findIndex((p) => p.id === id)

  return (
    <>
      <div className="banner">
        入力した数字はこの端末のブラウザにだけ保存されます。夫婦での共有は次の段階で対応します。
      </div>

      <details className="section" open>
        <summary>暮らしと目標</summary>
        <div className="body fields">
          <ManField label="基本生活費（月）" value={h.baseLivingMonthly} onChange={(v) => update((d) => { d.baseLivingMonthly = v ?? 0 })} hint="趣味・住居費・教育費は含まない" />
          <ManField label="趣味予算（月）" value={h.hobbyMonthly} onChange={(v) => update((d) => { d.hobbyMonthly = v ?? 0 })} />
          <PctField label="退職後の生活費" value={h.retiredLivingRatio} onChange={(v) => update((d) => { d.retiredLivingRatio = v ?? 1 })} hint="現役時に対する比率" />
          <NumField label="目標：何歳まで" value={h.goal.atAge} unit="歳" onChange={(v) => update((d) => { d.goal.atAge = v ?? 100 })} hint="最年長の大人の年齢" />
          <ManField label="目標：残したい資産" value={h.goal.minBalance} onChange={(v) => update((d) => { d.goal.minBalance = v ?? 0 })} />
          <NumField label="計算の開始年" value={h.startYear} unit="年" onChange={(v) => update((d) => { d.startYear = v ?? new Date().getFullYear() })} />
        </div>
      </details>

      <details className="section">
        <summary>大人（収入・年金）</summary>
        <div className="body">
          {adults.map((p) => <AdultEditor key={p.id} p={p} update={(fn) => update((d) => fn(d.persons[personIndex(p.id)]))} remove={() => update((d) => { d.persons = d.persons.filter((x) => x.id !== p.id) })} />)}
          <div className="row-actions">
            <button className="btn small" onClick={() => update((d) => {
              d.persons.push({
                id: newId('p'), nickname: `大人${adults.length + 1}`, role: 'adult', birthYear: d.startYear - 30,
                income: {
                  netAnnual: 4_000_000, grossAnnual: 5_200_000, incomeCurve: DEFAULT_INCOME_CURVE.map((s) => ({ ...s })),
                  retireAge: 65, sideIncome: null, reducedPeriods: [], pension: { recordedEmployee: 0, startAge: 65 }, severance: null,
                },
              })
            })}>＋ 大人を追加</button>
          </div>
        </div>
      </details>

      <details className="section">
        <summary>子ども（進路・教育費）</summary>
        <div className="body">
          {children.map((p) => <ChildEditor key={p.id} p={p} update={(fn) => update((d) => fn(d.persons[personIndex(p.id)]))} remove={() => update((d) => { d.persons = d.persons.filter((x) => x.id !== p.id) })} />)}
          <div className="row-actions">
            <button className="btn small" onClick={() => update((d) => {
              d.persons.push({
                id: newId('c'), nickname: `子ども${children.length + 1}`, role: 'child', birthYear: d.startYear,
                education: ['kindergarten', 'elementary', 'juniorHigh', 'highSchool'].map((sid) => {
                  const s = findStage(sid)!
                  return { stageId: sid, typeId: 'public', startAge: s.defaultStartAge, years: s.defaultYears, livingAway: false }
                }).concat([{ stageId: 'university', typeId: 'national', startAge: 18, years: 4, livingAway: false }]),
              })
            })}>＋ 子どもを追加</button>
          </div>
        </div>
      </details>

      <details className="section">
        <summary>資産（口座）</summary>
        <div className="body">
          {h.accounts.map((a, i) => (
            <div className="sub-card" key={a.id}>
              <div className="sub-head">
                <span>{a.name}</span>
                <button className="btn small danger" onClick={() => update((d) => { d.accounts.splice(i, 1) })}>削除</button>
              </div>
              <div className="fields">
                <TextField label="名前" value={a.name} onChange={(v) => update((d) => { d.accounts[i].name = v })} />
                <SelectField label="種類" value={a.typeId} options={Object.values(ACCOUNT_TYPES).map((t) => ({ value: t.id, label: t.label }))}
                  onChange={(v) => update((d) => { d.accounts[i].typeId = v as AccountTypeId; d.accounts[i].returnKey = ACCOUNT_TYPES[v as AccountTypeId].defaultReturnKey })} />
                <SelectField label="持ち主" value={a.ownerId ?? ''} options={ownerOptions} onChange={(v) => update((d) => { d.accounts[i].ownerId = v || null })} />
                <SelectField label="運用" value={a.returnKey} options={(Object.keys(RETURN_KEY_LABELS) as ReturnKey[]).map((k) => ({ value: k, label: RETURN_KEY_LABELS[k] }))}
                  onChange={(v) => update((d) => { d.accounts[i].returnKey = v })} />
                <ManField label="今の残高" value={a.balance} onChange={(v) => update((d) => { d.accounts[i].balance = v ?? 0 })} />
                <ManField label="毎月の積立" value={a.monthlyContribution} onChange={(v) => update((d) => { d.accounts[i].monthlyContribution = v ?? 0 })}
                  hint={a.typeId === 'dc' ? '会社の掛金。家計からは出ない扱い' : undefined} />
                <NumField label="積立をやめる年齢" unit="歳" value={a.contributionUntilAge} allowEmpty onChange={(v) => update((d) => { d.accounts[i].contributionUntilAge = v })} hint="空欄なら持ち主の退職年齢" />
              </div>
            </div>
          ))}
          <div className="row-actions">
            <button className="btn small" onClick={() => update((d) => {
              d.accounts.push({ id: newId('acc'), name: '新しい口座', typeId: 'cash', ownerId: null, balance: 0, monthlyContribution: 0, contributionUntilAge: null, returnKey: 'cash' })
            })}>＋ 口座を追加</button>
          </div>
        </div>
      </details>

      <details className="section">
        <summary>ローン</summary>
        <div className="body">
          {h.loans.map((l, i) => (
            <div className="sub-card" key={l.id}>
              <div className="sub-head">
                <span>{l.name}</span>
                <button className="btn small danger" onClick={() => update((d) => { d.loans.splice(i, 1) })}>削除</button>
              </div>
              <div className="fields">
                <TextField label="名前" value={l.name} onChange={(v) => update((d) => { d.loans[i].name = v })} />
                <SelectField label="名義人" value={l.ownerId ?? ''} options={ownerOptions} onChange={(v) => update((d) => { d.loans[i].ownerId = v || null })} />
                <ManField label="今の残高" value={l.balance} onChange={(v) => update((d) => { d.loans[i].balance = v ?? 0 })} />
                <NumField label="残りの返済期間" unit="か月" value={l.remainingMonths} onChange={(v) => update((d) => { d.loans[i].remainingMonths = Math.round(v ?? 0) })} hint={`約${(l.remainingMonths / 12).toFixed(1)}年`} />
                <PctField label="今の金利" value={l.rate} onChange={(v) => update((d) => { d.loans[i].rate = v ?? 0 })} />
                <CheckField label="変動金利（シナリオの金利上昇を足す）" checked={l.followsMarketRate} onChange={(v) => update((d) => { d.loans[i].followsMarketRate = v })} />
              </div>
              <div className="flabel" style={{ fontSize: 12, color: 'var(--ink-2)', margin: '12px 0 6px' }}>決まっている金利の変更</div>
              {l.rateChanges.map((c, ci) => (
                <div className="fields" key={ci} style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end', marginBottom: 8 }}>
                  <NumField label="年" value={c.year} onChange={(v) => update((d) => { d.loans[i].rateChanges[ci].year = v ?? d.startYear })} />
                  <NumField label="月" value={c.month} onChange={(v) => update((d) => { d.loans[i].rateChanges[ci].month = Math.min(12, Math.max(1, v ?? 1)) })} />
                  <PctField label="金利" value={c.rate} onChange={(v) => update((d) => { d.loans[i].rateChanges[ci].rate = v ?? 0 })} />
                  <button className="btn small danger" aria-label="この変更を削除" onClick={() => update((d) => { d.loans[i].rateChanges.splice(ci, 1) })}>✕</button>
                </div>
              ))}
              <div className="row-actions">
                <button className="btn small" onClick={() => update((d) => { d.loans[i].rateChanges.push({ year: d.startYear + 1, month: 1, rate: d.loans[i].rate }) })}>＋ 金利の変更を追加</button>
              </div>
              <CheckField label="住宅ローン控除を受けている" checked={!!l.deduction} onChange={(v) => update((d) => {
                d.loans[i].deduction = v ? { untilYear: d.startYear + 10, maxBalance: 30_000_000, currentAmount: null } : null
              })} />
              {l.deduction && (
                <div className="fields">
                  <NumField label="控除を受けられる最後の年" unit="年" value={l.deduction.untilYear} onChange={(v) => update((d) => { d.loans[i].deduction!.untilYear = v ?? d.startYear })} />
                  <ManField label="控除の対象になる残高の上限" value={l.deduction.maxBalance} onChange={(v) => update((d) => { d.loans[i].deduction!.maxBalance = v ?? 0 })} />
                  <ManField label="今年の控除額" value={l.deduction.currentAmount} allowEmpty onChange={(v) => update((d) => { d.loans[i].deduction!.currentAmount = v })}
                    hint="源泉徴収票の「住宅借入金等特別控除の額」＋住民税の減額分。空欄なら自動計算" wide />
                </div>
              )}
            </div>
          ))}
          <div className="row-actions">
            <button className="btn small" onClick={() => update((d) => {
              d.loans.push({ id: newId('loan'), name: '住宅ローン', kind: 'mortgage', ownerId: adults[0]?.id ?? null, balance: 20_000_000, remainingMonths: 360, rate: 0.01, rateChanges: [], followsMarketRate: true, deduction: null })
            })}>＋ ローンを追加</button>
          </div>
          <p className="note">ペアローンは名義人ごとに1本ずつ登録します。</p>
        </div>
      </details>

      <details className="section">
        <summary>住居費・車・周期的な支出</summary>
        <div className="body">
          {h.costItems.map((c, i) => (
            <div className="sub-card" key={c.id}>
              <div className="sub-head">
                <span>{c.name}</span>
                <button className="btn small danger" onClick={() => update((d) => { d.costItems.splice(i, 1) })}>削除</button>
              </div>
              <div className="fields">
                <TextField label="名前" value={c.name} onChange={(v) => update((d) => { d.costItems[i].name = v })} wide />
                <ManField label="1回の金額" value={c.amount} onChange={(v) => update((d) => { d.costItems[i].amount = v ?? 0 })} />
                <NumField label="周期" unit="年ごと" value={c.intervalYears} onChange={(v) => update((d) => { d.costItems[i].intervalYears = Math.max(0, Math.round(v ?? 0)) })} hint="1=毎年、0=1回だけ" />
                <NumField label="最初の年" unit="年" value={c.startYear} onChange={(v) => update((d) => { d.costItems[i].startYear = v ?? d.startYear })} />
                <NumField label="最後の年" unit="年" value={c.endYear} allowEmpty onChange={(v) => update((d) => { d.costItems[i].endYear = v })} hint="空欄ならずっと" />
                <CheckField label="インフレ率で値上がり" checked={c.growth === 'inflation'} onChange={(v) => update((d) => { d.costItems[i].growth = v ? 'inflation' : 0 })} />
                {c.growth !== 'inflation' && (
                  <PctField label="毎年の値上がり率" value={c.growth} onChange={(v) => update((d) => { d.costItems[i].growth = v ?? 0 })} />
                )}
              </div>
            </div>
          ))}
          <div className="field wide" style={{ marginTop: 8 }}>
            <label htmlFor="preset">プリセットから追加</label>
            <select id="preset" value="" onChange={(e) => {
              const preset = COST_PRESETS.find((p) => p.id === e.target.value)
              if (!preset) return
              update((d) => { d.costItems.push({ id: newId('ci'), name: preset.name, presetId: preset.id, amount: preset.amount, startYear: d.startYear, intervalYears: preset.intervalYears, endYear: null, growth: preset.growth }) })
            }}>
              <option value="">選んでください</option>
              {COST_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}（{Math.round(p.amount / 10_000)}万円・{p.intervalYears === 1 ? '毎年' : `${p.intervalYears}年ごと`}）</option>)}
            </select>
          </div>
        </div>
      </details>

      <details className="section">
        <summary>シナリオ（将来の仮定）</summary>
        <div className="body">
          {h.scenarios.map((s, i) => (
            <div className="sub-card" key={s.id}>
              <div className="sub-head"><span>{s.name}</span></div>
              <div className="fields">
                <PctField label="インフレ率" value={s.inflation} onChange={(v) => update((d) => { d.scenarios[i].inflation = v ?? 0 })} />
                <PctField label="昇給率" value={s.wageGrowth} onChange={(v) => update((d) => { d.scenarios[i].wageGrowth = v ?? 0 })} hint="収入カーブで「シナリオ」の区間" />
                <PctField label="利回り：株式中心" value={s.returns.equity} onChange={(v) => update((d) => { d.scenarios[i].returns.equity = v ?? 0 })} />
                <PctField label="利回り：バランス型" value={s.returns.balanced} onChange={(v) => update((d) => { d.scenarios[i].returns.balanced = v ?? 0 })} />
                <PctField label="利回り：預金" value={s.returns.cash} onChange={(v) => update((d) => { d.scenarios[i].returns.cash = v ?? 0 })} />
                <PctField label="年金の目減り" value={s.pensionAdjust} onChange={(v) => update((d) => { d.scenarios[i].pensionAdjust = v ?? 0 })} hint="−10%なら推計額の90%" />
                <PctField label="変動金利：毎年の上昇" value={s.marketRate.stepPerYear} onChange={(v) => update((d) => { d.scenarios[i].marketRate.stepPerYear = v ?? 0 })} />
                <PctField label="変動金利：上昇の最大" value={s.marketRate.maxIncrease} onChange={(v) => update((d) => { d.scenarios[i].marketRate.maxIncrease = v ?? 0 })} />
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="section">
        <summary>データ（バックアップ）</summary>
        <div className="body">
          <div className="row-actions">
            <button className="btn" onClick={() => exportJson(h)}>ファイルに書き出す</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>ファイルから読み込む</button>
            <button className="btn danger" onClick={() => { if (confirm('入力した内容を消して、サンプルに戻しますか？')) resetToSample() }}>サンプルに戻す</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try { replace(await importJson(file)) } catch (err) { alert(`読み込めませんでした：${(err as Error).message}`) }
            e.target.value = ''
          }} />
        </div>
      </details>
    </>
  )
}

function AdultEditor({ p, update, remove }: { p: Person; update: (fn: (p: Person) => void) => void; remove: () => void }) {
  const inc = p.income!
  return (
    <div className="sub-card">
      <div className="sub-head">
        <span>{p.nickname}</span>
        <button className="btn small danger" onClick={remove}>削除</button>
      </div>
      <div className="fields">
        <TextField label="ニックネーム" value={p.nickname} onChange={(v) => update((x) => { x.nickname = v })} />
        <NumField label="生まれた年" unit="年" value={p.birthYear} onChange={(v) => update((x) => { x.birthYear = v ?? x.birthYear })} />
        <ManField label="手取り年収" value={inc.netAnnual} onChange={(v) => update((x) => { x.income!.netAnnual = v ?? 0 })} hint="ボーナス込み" />
        <ManField label="額面年収" value={inc.grossAnnual} onChange={(v) => update((x) => { x.income!.grossAnnual = v ?? 0 })} hint="年金の推計に使う" />
        <NumField label="退職年齢" unit="歳" value={inc.retireAge} onChange={(v) => update((x) => { x.income!.retireAge = v ?? 65 })} />
        <NumField label="年金の受給開始" unit="歳" value={inc.pension.startAge} onChange={(v) => update((x) => { x.income!.pension.startAge = Math.min(75, Math.max(60, v ?? 65)) })} hint="60〜75歳" />
        <ManField label="厚生年金の加入実績額" value={inc.pension.recordedEmployee} onChange={(v) => update((x) => { x.income!.pension.recordedEmployee = v ?? 0 })} hint="ねんきん定期便「これまでの加入実績に応じた年金額」の老齢厚生年金（年額）" wide />
        <CheckField label="サイドFIREの収入を設定する" checked={!!inc.sideIncome} onChange={(v) => update((x) => { x.income!.sideIncome = v ? { netAnnual: 1_200_000, untilAge: 60 } : null })} />
        {inc.sideIncome && (
          <>
            <ManField label="サイド収入（年・手取り）" value={inc.sideIncome.netAnnual} onChange={(v) => update((x) => { x.income!.sideIncome!.netAnnual = v ?? 0 })} hint="今の価値" />
            <NumField label="サイド収入は何歳まで" unit="歳" value={inc.sideIncome.untilAge} onChange={(v) => update((x) => { x.income!.sideIncome!.untilAge = v ?? 60 })} />
          </>
        )}
        <CheckField label="退職金がある" checked={!!inc.severance} onChange={(v) => update((x) => { x.income!.severance = v ? { age: x.income!.retireAge, amount: 0 } : null })} />
        {inc.severance && (
          <>
            <NumField label="受け取る年齢" unit="歳" value={inc.severance.age} onChange={(v) => update((x) => { x.income!.severance!.age = v ?? 65 })} />
            <ManField label="金額（手取り）" value={inc.severance.amount} onChange={(v) => update((x) => { x.income!.severance!.amount = v ?? 0 })} />
          </>
        )}
      </div>
      <div className="flabel" style={{ fontSize: 12, color: 'var(--ink-2)', margin: '12px 0 6px' }}>収入カーブ（この年齢から、毎年の昇給率）</div>
      {inc.incomeCurve.map((s, si) => (
        <div className="fields" key={si} style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end', marginBottom: 8 }}>
          <NumField label="何歳から" value={s.fromAge} unit="歳" onChange={(v) => update((x) => { x.income!.incomeCurve[si].fromAge = v ?? 0 })} />
          <PctField label="昇給率" value={s.growth} allowEmpty onChange={(v) => update((x) => { x.income!.incomeCurve[si].growth = v })} hint="空欄=シナリオ" />
          <NumField label="その年に×" value={s.stepMultiplier ?? null} allowEmpty onChange={(v) => update((x) => {
            if (v === null) delete x.income!.incomeCurve[si].stepMultiplier
            else x.income!.incomeCurve[si].stepMultiplier = v
          })} hint="再雇用0.6など" />
          <button className="btn small danger" aria-label="この区間を削除" onClick={() => update((x) => { x.income!.incomeCurve.splice(si, 1) })}>✕</button>
        </div>
      ))}
      <div className="row-actions">
        <button className="btn small" onClick={() => update((x) => { x.income!.incomeCurve.push({ fromAge: 55, growth: 0 }) })}>＋ 区間を追加</button>
      </div>
    </div>
  )
}

function ChildEditor({ p, update, remove }: { p: Person; update: (fn: (p: Person) => void) => void; remove: () => void }) {
  const steps = p.education ?? []
  return (
    <div className="sub-card">
      <div className="sub-head">
        <span>{p.nickname}</span>
        <button className="btn small danger" onClick={remove}>削除</button>
      </div>
      <div className="fields">
        <TextField label="ニックネーム" value={p.nickname} onChange={(v) => update((x) => { x.nickname = v })} />
        <NumField label="生まれた年" unit="年" value={p.birthYear} onChange={(v) => update((x) => { x.birthYear = v ?? x.birthYear })} />
      </div>
      <div className="flabel" style={{ fontSize: 12, color: 'var(--ink-2)', margin: '12px 0 6px' }}>進路</div>
      {steps.map((s, si) => {
        const stage = findStage(s.stageId)
        const typeOptions = Object.entries(stage?.types ?? {}).map(([k, v]) => ({ value: k, label: `${v.label}（年${Math.round(v.annual / 10_000)}万）` }))
        return (
          <div key={si} style={{ borderTop: si ? '1px solid var(--grid)' : undefined, paddingTop: si ? 8 : 0, marginBottom: 8 }}>
            <div className="fields">
              <SelectField label="段階" value={s.stageId} options={EDUCATION_STAGES.map((st) => ({ value: st.id, label: st.label }))} onChange={(v) => update((x) => {
                const st = findStage(v)!
                x.education![si] = { ...x.education![si], stageId: v, typeId: Object.keys(st.types)[0], startAge: st.defaultStartAge, years: st.defaultYears }
              })} />
              <SelectField label="区分" value={s.typeId} options={typeOptions} onChange={(v) => update((x) => { x.education![si].typeId = v })} />
              <NumField label="開始年齢" unit="歳" value={s.startAge} onChange={(v) => update((x) => { x.education![si].startAge = v ?? 0 })} />
              <NumField label="年数" unit="年" value={s.years} onChange={(v) => update((x) => { x.education![si].years = Math.max(0, Math.round(v ?? 0)) })} />
              <CheckField label="一人暮らし（仕送り）" checked={s.livingAway} onChange={(v) => update((x) => { x.education![si].livingAway = v })} />
            </div>
            <div className="row-actions" style={{ marginTop: 0 }}>
              <button className="btn small danger" onClick={() => update((x) => { x.education!.splice(si, 1) })}>この段階を削除</button>
            </div>
          </div>
        )
      })}
      <div className="row-actions">
        <button className="btn small" onClick={() => update((x) => {
          const st = findStage('master')!
          ;(x.education ??= []).push({ stageId: st.id, typeId: Object.keys(st.types)[0], startAge: st.defaultStartAge, years: st.defaultYears, livingAway: false })
        })}>＋ 段階を追加</button>
      </div>
    </div>
  )
}
