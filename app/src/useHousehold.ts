import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getHousehold, getMe, putHousehold, type HouseholdRecord, type Unavailable } from './api'
import { sampleHousehold } from './engine/sample'
import type { Household } from './engine/types'
import { clearHousehold, loadHousehold, saveHousehold } from './storage'

// 世帯データの読み書き。共有できるときはサーバーと同期し、できないときはこの端末だけに保存する。
// どちらの場合も、この端末のブラウザにも控えを保存する（オフラインでも開けるように）。

export type SyncState =
  | { mode: 'checking' }
  | { mode: 'local'; reason: Unavailable }
  | {
    mode: 'shared'
    email: string | null
    status: 'saved' | 'pending' | 'saving' | 'error' | 'conflict'
    updatedAt: string | null
    updatedBy: string | null
    conflict?: HouseholdRecord | null
    /** もう一方の端末の更新を読み込んだ直後 */
    pulledFromOther?: boolean
  }

const SAVE_DELAY_MS = 1200

export function useHousehold() {
  const initial = useMemo(loadHousehold, [])
  const [household, setHousehold] = useState<Household>(initial.household)
  const [isSample, setIsSample] = useState(initial.isSample)
  const [sync, setSync] = useState<SyncState>({ mode: 'checking' })
  const [editSeq, setEditSeq] = useState(0)

  const householdRef = useRef(household)
  householdRef.current = household
  const versionRef = useRef(0)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const editSeqRef = useRef(0)
  editSeqRef.current = editSeq

  // この端末への控え
  useEffect(() => {
    if (!isSample) saveHousehold(household)
  }, [household, isSample])

  const markEdited = () => {
    dirtyRef.current = true
    setEditSeq((n) => n + 1)
  }

  const update = useCallback((fn: (d: Household) => void) => {
    setHousehold((prev) => {
      const draft = structuredClone(prev)
      fn(draft)
      return draft
    })
    setIsSample(false)
    markEdited()
  }, [])

  const replace = useCallback((h: Household) => {
    setHousehold(h)
    setIsSample(false)
    markEdited()
  }, [])

  const resetToSample = useCallback(() => {
    clearHousehold()
    setHousehold(sampleHousehold())
    setIsSample(true)
    markEdited()
  }, [])

  /** サーバーの版で置き換える（編集扱いにしない） */
  const applyRemote = useCallback((rec: HouseholdRecord, pulledFromOther = false) => {
    versionRef.current = rec.version
    dirtyRef.current = false
    setHousehold(rec.data)
    setIsSample(false)
    setSync((s) => ({
      mode: 'shared', email: s.mode === 'shared' ? s.email : null, status: 'saved',
      updatedAt: rec.updatedAt, updatedBy: rec.updatedBy, pulledFromOther,
    }))
  }, [])

  // 起動時：サーバーにデータがあればそれを使う
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [res, email] = await Promise.all([getHousehold(), getMe()])
      if (cancelled) return
      if (res.kind === 'unavailable') { setSync({ mode: 'local', reason: res.reason }); return }
      if (res.kind === 'ok') {
        applyRemote(res.record)
        setSync((s) => (s.mode === 'shared' ? { ...s, email } : s))
        return
      }
      // サーバーが空：この端末に入力済みのデータがあれば、それを最初の共有データにする
      versionRef.current = 0
      setSync({ mode: 'shared', email, status: initial.isSample ? 'saved' : 'pending', updatedAt: null, updatedBy: null })
      if (!initial.isSample) markEdited()
    })()
    return () => { cancelled = true }
  }, [applyRemote, initial.isSample])

  const save = useCallback(async () => {
    if (savingRef.current || !dirtyRef.current) return
    savingRef.current = true
    const seqAtStart = editSeqRef.current
    setSync((s) => (s.mode === 'shared' ? { ...s, status: 'saving', pulledFromOther: false } : s))
    const res = await putHousehold(householdRef.current, versionRef.current)
    savingRef.current = false
    if (res.kind === 'ok') {
      versionRef.current = res.record.version
      const more = editSeqRef.current !== seqAtStart
      dirtyRef.current = more
      setSync((s) => (s.mode === 'shared'
        ? { ...s, status: more ? 'pending' : 'saved', updatedAt: res.record.updatedAt, updatedBy: res.record.updatedBy }
        : s))
      if (more) setEditSeq((n) => n + 1)
    } else if (res.kind === 'conflict') {
      setSync((s) => (s.mode === 'shared' ? { ...s, status: 'conflict', conflict: res.current } : s))
    } else if (res.kind === 'unavailable' && res.reason === 'session_expired') {
      setSync({ mode: 'local', reason: 'session_expired' })
    } else {
      setSync((s) => (s.mode === 'shared' ? { ...s, status: 'error' } : s))
    }
  }, [])

  // 編集が止まってから少し待って保存する
  const shared = sync.mode === 'shared'
  const blocked = sync.mode === 'shared' && sync.status === 'conflict'
  useEffect(() => {
    if (!shared || blocked || !dirtyRef.current) return
    setSync((s) => (s.mode === 'shared' && s.status !== 'saving' ? { ...s, status: 'pending' } : s))
    const t = setTimeout(save, SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [editSeq, shared, blocked, save])

  // アプリに戻ってきたとき、もう一方の端末の更新を取り込む
  useEffect(() => {
    if (!shared) return
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || dirtyRef.current || savingRef.current) return
      const res = await getHousehold()
      if (res.kind === 'ok' && res.record.version > versionRef.current && !dirtyRef.current) applyRemote(res.record, true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [shared, applyRemote])

  /** 同時に編集したとき：相手の版を使う / 自分の版で上書きする */
  const syncRef = useRef(sync)
  syncRef.current = sync
  const resolveConflict = useCallback((choice: 'theirs' | 'mine') => {
    const s = syncRef.current
    if (s.mode !== 'shared' || s.status !== 'conflict') return
    if (choice === 'theirs' && s.conflict) {
      applyRemote(s.conflict)
      return
    }
    versionRef.current = s.conflict?.version ?? 0
    dirtyRef.current = true
    setSync({ ...s, status: 'pending', conflict: undefined })
    setEditSeq((n) => n + 1)
  }, [applyRemote])

  const retrySave = useCallback(() => {
    dirtyRef.current = true
    setEditSeq((n) => n + 1)
  }, [])

  return { household, isSample, sync, update, replace, resetToSample, resolveConflict, retrySave }
}
