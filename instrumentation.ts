// Runs once at server startup (Node.js runtime only).
// Patches globalThis.fetch so all server-side fetch calls use the proxy.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
  if (!proxy) {
    console.log('[proxy] No HTTPS_PROXY set — fetching direct')
    return
  }

  try {
    const { fetch: uf, ProxyAgent } = await import('undici')
    const dispatcher = new ProxyAgent(proxy)
    // Replace the global fetch so every subsequent fetch() in the process uses the proxy
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      uf(input as string, { ...(init ?? {}), dispatcher } as Parameters<typeof uf>[1]) as unknown as Promise<Response>
    console.log(`[proxy] ✓ All server fetch calls routing through: ${proxy}`)
  } catch (err) {
    console.error('[proxy] Setup failed:', err instanceof Error ? err.message : err)
  }
}
