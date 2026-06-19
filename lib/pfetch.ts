// Proxy-aware fetch: routes requests through HTTPS_PROXY if set.
// Node.js's native fetch (undici) does NOT auto-read proxy env vars,
// so we must configure the dispatcher explicitly.

import type { Dispatcher } from 'undici'

let _dispatcher: Dispatcher | null = null
let _ready = false

async function setup() {
  if (_ready) return
  _ready = true
  const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? ''
  if (!proxy) {
    console.warn('[proxy] No HTTPS_PROXY set — server-side fetches go direct')
    return
  }
  const { ProxyAgent } = await import('undici')
  _dispatcher = new ProxyAgent(proxy)
  console.log(`[proxy] ✓ Server routing through: ${proxy}`)
}

export async function pfetch(url: string, opts: RequestInit = {}): Promise<Response> {
  await setup()
  if (_dispatcher) {
    return fetch(url, { ...opts, dispatcher: _dispatcher } as RequestInit)
  }
  return fetch(url, opts)
}
