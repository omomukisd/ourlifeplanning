import { fireGrid, maxHobbyMonthly, type FireAnswer, type HobbyAnswer } from './engine/solve'
import type { Household } from './engine/types'

// 重い探索（趣味予算の上限、FIRE の表）を画面とは別のスレッドで計算する。

export interface WorkerRequest {
  requestId: number
  household: Household
}

export interface ScenarioAnswers {
  hobby: HobbyAnswer
  fire: { full: FireAnswer; side: FireAnswer }
}

export interface WorkerResponse {
  requestId: number
  byScenario: Record<string, ScenarioAnswers>
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { requestId, household } = e.data
  const byScenario: Record<string, ScenarioAnswers> = {}
  for (const sc of household.scenarios) {
    byScenario[sc.id] = {
      hobby: maxHobbyMonthly(household, sc),
      fire: { full: fireGrid(household, sc, 'full'), side: fireGrid(household, sc, 'side') },
    }
  }
  const res: WorkerResponse = { requestId, byScenario }
  self.postMessage(res)
}
