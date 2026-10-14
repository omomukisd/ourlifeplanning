import { authenticate, type AuthEnv, type Verifier } from './auth'
import type { HouseholdStore } from './store'

// /api/* のルーティング。データは世帯1つ（id = default）だけを扱う。

export const HOUSEHOLD_ID = 'default'
const MAX_BODY_BYTES = 1_000_000

export interface ApiDeps {
  store: HouseholdStore
  verify?: Verifier
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

function looksLikeHousehold(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const h = v as Record<string, unknown>
  return h.version === 1 && Array.isArray(h.persons) && Array.isArray(h.accounts) && Array.isArray(h.scenarios)
}

export async function handleApi(request: Request, env: AuthEnv, deps: ApiDeps): Promise<Response> {
  const url = new URL(request.url)
  const auth = await authenticate(request, env, deps.verify)
  if (!auth.ok) return json({ error: auth.reason }, auth.status)
  const { store } = deps
  const path = url.pathname.replace(/\/+$/, '')

  if (path === '/api/me' && request.method === 'GET') {
    return json({ email: auth.email })
  }

  if (path === '/api/household' && request.method === 'GET') {
    const rec = await store.get(HOUSEHOLD_ID)
    return rec ? json(rec) : json({ error: 'not_found' }, 404)
  }

  if (path === '/api/household' && request.method === 'PUT') {
    const length = Number(request.headers.get('Content-Length') ?? 0)
    if (length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413)
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413)
    let body: { data?: unknown; baseVersion?: unknown }
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }
    if (!looksLikeHousehold(body.data) || typeof body.baseVersion !== 'number' || body.baseVersion < 0) {
      return json({ error: 'invalid_body' }, 400)
    }
    const result = await store.save(HOUSEHOLD_ID, body.data, body.baseVersion, auth.email)
    return result.ok ? json(result.record) : json({ error: 'conflict', current: result.current }, 409)
  }

  if (path === '/api/household/history' && request.method === 'GET') {
    return json({ entries: await store.history(HOUSEHOLD_ID, 30) })
  }

  const m = path.match(/^\/api\/household\/history\/(\d+)$/)
  if (m && request.method === 'GET') {
    const rec = await store.getVersion(HOUSEHOLD_ID, Number(m[1]))
    return rec ? json(rec) : json({ error: 'not_found' }, 404)
  }

  return json({ error: 'not_found' }, 404)
}
