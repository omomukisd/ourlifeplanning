// 世帯データの保存先。D1 に JSON をまるごと1行で持ち、更新のたびに version を1つ上げる。
// 2人が同時に編集したときは、古い version からの保存を拒否して（409）上書き事故を防ぐ。

export interface HouseholdRecord {
  data: unknown
  version: number
  updatedAt: string
  updatedBy: string
}

export interface HistoryEntry {
  version: number
  updatedAt: string
  updatedBy: string
}

export type SaveResult =
  | { ok: true; record: HouseholdRecord }
  | { ok: false; current: HouseholdRecord | null }

export interface HouseholdStore {
  get(id: string): Promise<HouseholdRecord | null>
  save(id: string, data: unknown, baseVersion: number, email: string): Promise<SaveResult>
  history(id: string, limit: number): Promise<HistoryEntry[]>
  getVersion(id: string, version: number): Promise<HouseholdRecord | null>
}

export const HISTORY_KEEP = 50

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS household_history (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (id, version)
  )`,
]

interface Row {
  data: string
  version: number
  updated_at: string
  updated_by: string
}

const toRecord = (r: Row): HouseholdRecord => ({
  data: JSON.parse(r.data),
  version: r.version,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
})

export class D1Store implements HouseholdStore {
  private ready: Promise<void> | null = null

  constructor(private db: D1Database) {}

  /** 初回だけテーブルを作る（マイグレーションの手順を不要にするため） */
  private ensureSchema(): Promise<void> {
    this.ready ??= this.db.batch(SCHEMA.map((s) => this.db.prepare(s))).then(() => undefined)
    return this.ready
  }

  async get(id: string): Promise<HouseholdRecord | null> {
    await this.ensureSchema()
    const row = await this.db.prepare('SELECT data, version, updated_at, updated_by FROM households WHERE id = ?').bind(id).first<Row>()
    return row ? toRecord(row) : null
  }

  async save(id: string, data: unknown, baseVersion: number, email: string): Promise<SaveResult> {
    await this.ensureSchema()
    const json = JSON.stringify(data)
    const now = new Date().toISOString()
    const result = baseVersion === 0
      ? await this.db.prepare(
        'INSERT INTO households (id, data, version, updated_at, updated_by) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING',
      ).bind(id, json, now, email).run()
      : await this.db.prepare(
        'UPDATE households SET data = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ? AND version = ?',
      ).bind(json, now, email, id, baseVersion).run()
    if (!result.meta.changes) return { ok: false, current: await this.get(id) }

    const version = baseVersion + 1
    await this.db.batch([
      this.db.prepare('INSERT OR REPLACE INTO household_history (id, version, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)')
        .bind(id, version, json, now, email),
      this.db.prepare('DELETE FROM household_history WHERE id = ? AND version <= ?').bind(id, version - HISTORY_KEEP),
    ])
    return { ok: true, record: { data, version, updatedAt: now, updatedBy: email } }
  }

  async history(id: string, limit: number): Promise<HistoryEntry[]> {
    await this.ensureSchema()
    const { results } = await this.db.prepare(
      'SELECT version, updated_at, updated_by FROM household_history WHERE id = ? ORDER BY version DESC LIMIT ?',
    ).bind(id, limit).all<Omit<Row, 'data'>>()
    return results.map((r) => ({ version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by }))
  }

  async getVersion(id: string, version: number): Promise<HouseholdRecord | null> {
    await this.ensureSchema()
    const row = await this.db.prepare(
      'SELECT data, version, updated_at, updated_by FROM household_history WHERE id = ? AND version = ?',
    ).bind(id, version).first<Row>()
    return row ? toRecord(row) : null
  }
}

/** テスト用 */
export class MemoryStore implements HouseholdStore {
  private current = new Map<string, HouseholdRecord>()
  private hist = new Map<string, HouseholdRecord[]>()

  async get(id: string) {
    return this.current.get(id) ?? null
  }

  async save(id: string, data: unknown, baseVersion: number, email: string): Promise<SaveResult> {
    const cur = this.current.get(id) ?? null
    if ((cur?.version ?? 0) !== baseVersion) return { ok: false, current: cur }
    const record = { data, version: baseVersion + 1, updatedAt: new Date().toISOString(), updatedBy: email }
    this.current.set(id, record)
    const list = [...(this.hist.get(id) ?? []), record].filter((r) => r.version > record.version - HISTORY_KEEP)
    this.hist.set(id, list)
    return { ok: true, record }
  }

  async history(id: string, limit: number) {
    return (this.hist.get(id) ?? []).slice().reverse().slice(0, limit)
      .map(({ version, updatedAt, updatedBy }) => ({ version, updatedAt, updatedBy }))
  }

  async getVersion(id: string, version: number) {
    return (this.hist.get(id) ?? []).find((r) => r.version === version) ?? null
  }
}
