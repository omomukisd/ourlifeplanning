import { useEffect, useMemo, useRef, useState } from 'react'
import { simulate } from './engine/simulate'
import type { SimulationResult } from './engine/types'
import { useHousehold } from './useHousehold'
import { Dashboard } from './ui/Dashboard'
import { SyncBar } from './ui/SyncBar'
import { FirePage } from './ui/FirePage'
import { Settings } from './ui/Settings'
import { YearTable } from './ui/YearTable'
import type { ScenarioAnswers, WorkerRequest, WorkerResponse } from './worker'

type Tab = 'home' | 'table' | 'fire' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'ホーム', icon: '◎' },
  { id: 'table', label: '推移', icon: '▤' },
  { id: 'fire', label: 'FIRE', icon: '◇' },
  { id: 'settings', label: '入力', icon: '✎' },
]

export default function App() {
  const { household, isSample, sync, update, replace, resetToSample, resolveConflict, retrySave } = useHousehold()
  const [tab, setTab] = useState<Tab>('home')
  const [scenarioId, setScenarioId] = useState(household.scenarios[0]?.id ?? 'standard')
  const [real, setReal] = useState(true)
  const [answers, setAnswers] = useState<Record<string, ScenarioAnswers> | null>(null)

  const results = useMemo(() => {
    const out: Record<string, SimulationResult> = {}
    for (const sc of household.scenarios) out[sc.id] = simulate(household, sc)
    return out
  }, [household])

  // 重い探索は Web Worker で。入力が続いている間は少し待ってから計算する
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.requestId === requestRef.current) setAnswers(e.data.byScenario)
    }
    workerRef.current = w
    return () => w.terminate()
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      requestRef.current += 1
      const req: WorkerRequest = { requestId: requestRef.current, household }
      workerRef.current?.postMessage(req)
    }, 400)
    return () => clearTimeout(t)
  }, [household])

  const scenario = household.scenarios.find((s) => s.id === scenarioId) ?? household.scenarios[0]

  return (
    <div className="app">
      <header className="top">
        <h1>ライフプラン</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="segmented" role="group" aria-label="シナリオ">
            {household.scenarios.map((s) => (
              <button key={s.id} aria-pressed={s.id === scenario.id} onClick={() => setScenarioId(s.id)}>{s.name}</button>
            ))}
          </div>
          {tab !== 'settings' && tab !== 'fire' && (
            <div className="segmented" role="group" aria-label="金額の表示">
              <button aria-pressed={real} onClick={() => setReal(true)}>今の価値</button>
              <button aria-pressed={!real} onClick={() => setReal(false)}>名目</button>
            </div>
          )}
        </div>
      </header>

      <SyncBar sync={sync} onResolve={resolveConflict} onRetry={retrySave} />

      {isSample && (
        <div className="banner">
          いま表示しているのは架空のサンプル世帯です。「入力」タブで自分の数字に書き換えてください。
          {sync.mode === 'shared' && '書き換えると共有データとして保存されます。'}
        </div>
      )}

      <main>
        {tab === 'home' && <Dashboard household={household} results={results} answers={answers} scenario={scenario} real={real} />}
        {tab === 'table' && <YearTable household={household} result={results[scenario.id]} real={real} />}
        {tab === 'fire' && <FirePage household={household} scenario={scenario} answers={answers?.[scenario.id]} />}
        {tab === 'settings' && (
          <Settings
            household={household}
            update={update}
            replace={replace}
            resetToSample={resetToSample}
            shared={sync.mode === 'shared'}
          />
        )}
      </main>

      <nav className="tabs" aria-label="画面">
        <div className="inner">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setTab(t.id); window.scrollTo(0, 0) }}>
              <span className="icon" aria-hidden>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
