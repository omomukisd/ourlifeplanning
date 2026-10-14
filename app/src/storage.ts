import { sampleHousehold } from './engine/sample'
import type { Household } from './engine/types'

// 個人データはこの端末のブラウザにだけ保存する（リポジトリには含めない）。
// 夫婦での共有は、次の段階で Cloudflare（Workers + D1）に置き換える。

const KEY = 'ourlifeplanning:household:v1'

export function loadHousehold(): { household: Household; isSample: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Household
      if (parsed?.version === 1) return { household: parsed, isSample: false }
    }
  } catch {
    // 読めない場合はサンプルで始める
  }
  return { household: sampleHousehold(), isSample: true }
}

export function saveHousehold(h: Household): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(h))
  } catch {
    // 保存できない環境（プライベートブラウズなど）では何もしない
  }
}

export function clearHousehold(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 何もしない
  }
}

export function exportJson(h: Household): void {
  const blob = new Blob([JSON.stringify(h, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lifeplan-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importJson(file: File): Promise<Household> {
  const parsed = JSON.parse(await file.text()) as Household
  if (parsed?.version !== 1 || !Array.isArray(parsed.persons)) throw new Error('形式が正しくありません')
  return parsed
}
