import { describe, expect, it } from 'vitest'
import { sampleHousehold } from '../src/engine/sample'
import { handleApi } from './api'
import { authenticate, isAllowed, normalizeTeamDomain, type AuthEnv, type Verifier } from './auth'
import { MemoryStore } from './store'

const env: AuthEnv = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud', ALLOWED_EMAILS: 'a@example.com, B@example.com' }
const tokens: Record<string, string> = { 'tok-a': 'a@example.com', 'tok-b': 'b@example.com', 'tok-x': 'x@example.com' }
const verify: Verifier = async (token) => tokens[token] ?? null

function req(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.token) headers.set('Cf-Access-Jwt-Assertion', init.token)
  return new Request(`https://app.example.workers.dev${path}`, { ...init, headers })
}

const put = (data: unknown, baseVersion: number, token = 'tok-a') =>
  req('/api/household', { method: 'PUT', token, body: JSON.stringify({ data, baseVersion }) })

describe('認証', () => {
  it('Access の設定がなければ API を使わせない', async () => {
    const r = await authenticate(req('/api/me', { token: 'tok-a' }), {}, verify)
    expect(r).toEqual({ ok: false, status: 503, reason: 'not_configured' })
  })

  it('トークンがない・不正なら 401', async () => {
    expect((await authenticate(req('/api/me'), env, verify)).ok).toBe(false)
    const r = await authenticate(req('/api/me', { token: 'bad' }), env, verify)
    expect(r).toMatchObject({ status: 401, reason: 'invalid_token' })
  })

  it('許可リストにない人は 403', async () => {
    const r = await authenticate(req('/api/me', { token: 'tok-x' }), env, verify)
    expect(r).toMatchObject({ status: 403, reason: 'forbidden' })
  })

  it('許可リストは大文字小文字を区別しない', () => {
    expect(isAllowed('b@example.com', env.ALLOWED_EMAILS)).toBe(true)
  })

  it('Cookie のトークンも受け付ける', async () => {
    const r = await authenticate(req('/api/me', { headers: { Cookie: 'x=1; CF_Authorization=tok-b' } }), env, verify)
    expect(r).toEqual({ ok: true, email: 'b@example.com' })
  })

  it('開発用のメールアドレスは localhost でだけ有効', async () => {
    const devEnv = { DEV_USER_EMAIL: 'dev@example.com' }
    const local = await authenticate(new Request('http://localhost:8787/api/me'), devEnv, verify)
    expect(local).toEqual({ ok: true, email: 'dev@example.com' })
    const remote = await authenticate(req('/api/me'), devEnv, verify)
    expect(remote.ok).toBe(false)
  })

  it('チームドメインは https:// や末尾の / を付けても動く', () => {
    expect(normalizeTeamDomain('https://team.cloudflareaccess.com/')).toBe('team.cloudflareaccess.com')
  })
})

describe('世帯データの API', () => {
  it('最初は 404、保存すると version 1 になる', async () => {
    const store = new MemoryStore()
    expect((await handleApi(req('/api/household', { token: 'tok-a' }), env, { store, verify })).status).toBe(404)
    const res = await handleApi(put(sampleHousehold(2030), 0), env, { store, verify })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ version: 1, updatedBy: 'a@example.com' })
  })

  it('もう一方が先に保存していたら 409 で最新を返す', async () => {
    const store = new MemoryStore()
    const h = sampleHousehold(2030)
    await handleApi(put(h, 0, 'tok-a'), env, { store, verify })
    await handleApi(put({ ...h, hobbyMonthly: 1 }, 1, 'tok-b'), env, { store, verify })
    const stale = await handleApi(put({ ...h, hobbyMonthly: 2 }, 1, 'tok-a'), env, { store, verify })
    expect(stale.status).toBe(409)
    const body = await stale.json() as { current: { version: number; data: { hobbyMonthly: number } } }
    expect(body.current.version).toBe(2)
    expect(body.current.data.hobbyMonthly).toBe(1)
  })

  it('世帯データの形でないものは保存しない', async () => {
    const store = new MemoryStore()
    const res = await handleApi(put({ hello: 'world' }, 0), env, { store, verify })
    expect(res.status).toBe(400)
  })

  it('履歴から過去の版を取り出せる', async () => {
    const store = new MemoryStore()
    const h = sampleHousehold(2030)
    await handleApi(put({ ...h, hobbyMonthly: 10 }, 0), env, { store, verify })
    await handleApi(put({ ...h, hobbyMonthly: 20 }, 1), env, { store, verify })
    const list = await (await handleApi(req('/api/household/history', { token: 'tok-a' }), env, { store, verify })).json() as { entries: { version: number }[] }
    expect(list.entries.map((e) => e.version)).toEqual([2, 1])
    const v1 = await (await handleApi(req('/api/household/history/1', { token: 'tok-a' }), env, { store, verify })).json() as { data: { hobbyMonthly: number } }
    expect(v1.data.hobbyMonthly).toBe(10)
  })

  it('認証がなければデータは返さない', async () => {
    const store = new MemoryStore()
    await handleApi(put(sampleHousehold(2030), 0), env, { store, verify })
    const res = await handleApi(req('/api/household'), env, { store, verify })
    expect(res.status).toBe(401)
  })
})

describe('Access の JWT 検証（本物の署名で確認）', async () => {
  const { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } = await import('jose')
  const { makeVerifier } = await import('./auth')
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
  const keys = createLocalJWKSet({ keys: [jwk] })
  const verifyReal = makeVerifier(() => keys)
  const sign = (claims: { aud?: string; iss?: string; exp?: string }) =>
    new SignJWT({ email: 'a@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(claims.iss ?? 'https://team.cloudflareaccess.com')
      .setAudience(claims.aud ?? 'aud')
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? '1h')
      .sign(privateKey)
  const cfg = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud' }

  it('正しいトークンならメールアドレスを返す', async () => {
    expect(await verifyReal(await sign({}), cfg)).toBe('a@example.com')
  })
  it('AUD・発行者が違う、期限切れなら拒否', async () => {
    expect(await verifyReal(await sign({ aud: 'other' }), cfg)).toBeNull()
    expect(await verifyReal(await sign({ iss: 'https://evil.example.com' }), cfg)).toBeNull()
    expect(await verifyReal(await sign({ exp: '1s ago' }), cfg)).toBeNull()
  })
})
