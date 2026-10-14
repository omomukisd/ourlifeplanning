import { createRemoteJWKSet, jwtVerify } from 'jose'

// Cloudflare Access が付けるトークン（JWT）を検証して、ログインした人のメールアドレスを取り出す。
// 設定がない・トークンがない・許可されていない場合は、API を使わせない（安全側に倒す）。

export interface AuthEnv {
  /** 例：yourteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string
  /** Access アプリケーションの AUD タグ */
  ACCESS_AUD?: string
  /** 許可するメールアドレス（カンマ区切り）。Access のポリシーに加えて、Worker 側でも確認する */
  ALLOWED_EMAILS?: string
  /** ローカル開発（wrangler dev）専用。localhost からのアクセスだけをこのメールアドレスとして扱う */
  DEV_USER_EMAIL?: string
}

export type AuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503; reason: 'not_configured' | 'no_token' | 'invalid_token' | 'forbidden' }

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function jwksFor(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksCache.set(teamDomain, jwks)
  }
  return jwks
}

function tokenFrom(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion')
  if (header) return header
  const cookie = request.headers.get('Cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)
  return m ? m[1] : null
}

export function normalizeTeamDomain(v: string): string {
  return v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export function isAllowed(email: string, allowed: string | undefined): boolean {
  if (!allowed || !allowed.trim()) return true
  const list = allowed.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

export type Verifier = (token: string, env: Required<Pick<AuthEnv, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>>) => Promise<string | null>

type KeyGetter = Parameters<typeof jwtVerify>[1]

/** 署名・発行者・AUD・有効期限を確認し、メールアドレスを返す検証関数を作る */
export function makeVerifier(keysFor: (teamDomain: string) => KeyGetter): Verifier {
  return async (token, env) => {
    const team = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN)
    try {
      const { payload } = await jwtVerify(token, keysFor(team), {
        issuer: `https://${team}`,
        audience: env.ACCESS_AUD.trim(),
      })
      return typeof payload.email === 'string' ? payload.email : null
    } catch {
      return null
    }
  }
}

/** 本番の検証：Access の公開鍵（JWKS）を取りに行って確認する */
export const verifyAccessJwt: Verifier = makeVerifier(jwksFor)

export async function authenticate(request: Request, env: AuthEnv, verify: Verifier = verifyAccessJwt): Promise<AuthResult> {
  const host = new URL(request.url).hostname
  if (env.DEV_USER_EMAIL && (host === 'localhost' || host === '127.0.0.1')) {
    return { ok: true, email: env.DEV_USER_EMAIL }
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { ok: false, status: 503, reason: 'not_configured' }
  const token = tokenFrom(request)
  if (!token) return { ok: false, status: 401, reason: 'no_token' }
  const email = await verify(token, { ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN, ACCESS_AUD: env.ACCESS_AUD })
  if (!email) return { ok: false, status: 401, reason: 'invalid_token' }
  if (!isAllowed(email, env.ALLOWED_EMAILS)) return { ok: false, status: 403, reason: 'forbidden' }
  return { ok: true, email }
}
