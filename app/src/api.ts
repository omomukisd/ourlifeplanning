import type { Household } from './engine/types'

// サーバー（Worker の /api）とのやり取り。

export interface HouseholdRecord {
  data: Household
  version: number
  updatedAt: string
  updatedBy: string
}

export interface HistoryEntry {
  version: number
  updatedAt: string
  updatedBy: string
}

/** 共有が使えない理由 */
export type Unavailable = 'not_configured' | 'unauthorized' | 'forbidden' | 'session_expired' | 'offline' | 'no_server'

export type GetResult =
  | { kind: 'ok'; record: HouseholdRecord }
  | { kind: 'empty' }
  | { kind: 'unavailable'; reason: Unavailable }

export type PutResult =
  | { kind: 'ok'; record: HouseholdRecord }
  | { kind: 'conflict'; current: HouseholdRecord | null }
  | { kind: 'unavailable'; reason: Unavailable }
  | { kind: 'error'; status: number }

async function call(path: string, init: RequestInit = {}): Promise<Response | Unavailable> {
  let res: Response
  try {
    // Access のログインが切れていると、ログイン画面へのリダイレクトが返る
    res = await fetch(path, { ...init, credentials: 'same-origin', redirect: 'manual', headers: { 'Content-Type': 'application/json', ...init.headers } })
  } catch {
    return 'offline'
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return 'session_expired'
  if (res.status === 503) return 'not_configured'
  if (res.status === 401) return 'unauthorized'
  if (res.status === 403) return 'forbidden'
  // API のない環境（vite の開発サーバーなど）では HTML が返る
  if (!(res.headers.get('Content-Type') ?? '').includes('application/json')) return 'no_server'
  return res
}

export async function getHousehold(): Promise<GetResult> {
  const res = await call('/api/household')
  if (typeof res === 'string') return { kind: 'unavailable', reason: res }
  if (res.status === 404) return { kind: 'empty' }
  if (!res.ok) return { kind: 'unavailable', reason: 'offline' }
  return { kind: 'ok', record: await res.json() }
}

export async function putHousehold(data: Household, baseVersion: number): Promise<PutResult> {
  const res = await call('/api/household', { method: 'PUT', body: JSON.stringify({ data, baseVersion }) })
  if (typeof res === 'string') return { kind: 'unavailable', reason: res }
  if (res.status === 409) {
    const body = await res.json() as { current: HouseholdRecord | null }
    return { kind: 'conflict', current: body.current }
  }
  if (!res.ok) return { kind: 'error', status: res.status }
  return { kind: 'ok', record: await res.json() }
}

export async function getMe(): Promise<string | null> {
  const res = await call('/api/me')
  if (typeof res === 'string' || !res.ok) return null
  return ((await res.json()) as { email: string }).email
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const res = await call('/api/household/history')
  if (typeof res === 'string' || !res.ok) return []
  return ((await res.json()) as { entries: HistoryEntry[] }).entries
}

export async function getHistoryVersion(version: number): Promise<HouseholdRecord | null> {
  const res = await call(`/api/household/history/${version}`)
  if (typeof res === 'string' || !res.ok) return null
  return res.json()
}

export const UNAVAILABLE_MESSAGES: Record<Unavailable, string> = {
  not_configured: '共有の設定（Cloudflare Access）がまだ終わっていません。',
  unauthorized: 'ログインが確認できませんでした。',
  forbidden: 'このメールアドレスには共有データを見る権限がありません。',
  session_expired: 'ログインの有効期限が切れました。ページを再読み込みしてください。',
  offline: 'サーバーにつながりません。',
  no_server: '共有用のサーバーがない環境です。',
}
