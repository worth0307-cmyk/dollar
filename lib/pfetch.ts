// Thin wrapper around global fetch.
// Proxy routing is handled at startup by instrumentation.ts (via undici ProxyAgent).
export async function pfetch(url: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, opts)
}
