import { handleApi } from './api'
import type { AuthEnv } from './auth'
import { D1Store } from './store'

// Worker の入り口。/api/* はここで処理し、それ以外は画面（dist/ の静的ファイル）を返す。

interface Env extends AuthEnv {
  ASSETS: Fetcher
  DB: D1Database
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, { store: new D1Store(env.DB) })
      } catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
