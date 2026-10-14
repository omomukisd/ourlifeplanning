import { UNAVAILABLE_MESSAGES } from '../api'
import type { SyncState } from '../useHousehold'

interface Props {
  sync: SyncState
  onResolve: (choice: 'theirs' | 'mine') => void
  onRetry: () => void
}

function time(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function who(email: string | null, me: string | null): string {
  if (!email) return ''
  return email === me ? 'あなた' : email.split('@')[0]
}

export function SyncBar({ sync, onResolve, onRetry }: Props) {
  if (sync.mode === 'checking') return <p className="sync-line" role="status">共有データを確認中…</p>

  if (sync.mode === 'local') {
    return (
      <div className="banner" role="status">
        <strong>この端末だけに保存しています。</strong> {UNAVAILABLE_MESSAGES[sync.reason]}
      </div>
    )
  }

  if (sync.status === 'conflict') {
    const c = sync.conflict
    return (
      <div className="banner warn" role="alert">
        <strong>もう一方の端末で先に保存されていました。</strong>
        {c && <> （{who(c.updatedBy, sync.email)}・{time(c.updatedAt)}）</>}
        <br />どちらの内容を残しますか？
        <div className="row-actions">
          <button className="btn small" onClick={() => onResolve('theirs')}>相手の内容を読み込む（自分の変更は消える）</button>
          <button className="btn small" onClick={() => onResolve('mine')}>自分の内容で上書きする</button>
        </div>
      </div>
    )
  }

  const label = {
    saved: '保存済み',
    pending: '未保存の変更あり',
    saving: '保存中…',
    error: '保存できませんでした',
  }[sync.status]

  return (
    <p className={`sync-line${sync.status === 'error' ? ' error' : ''}`} role="status">
      <span aria-hidden>👥</span> 共有中・{label}
      {sync.status === 'saved' && sync.updatedAt && <>（{who(sync.updatedBy, sync.email)}・{time(sync.updatedAt)}）</>}
      {sync.pulledFromOther && <>　最新の内容を読み込みました</>}
      {sync.status === 'error' && <button className="btn small" style={{ marginLeft: 8 }} onClick={onRetry}>再試行</button>}
    </p>
  )
}
