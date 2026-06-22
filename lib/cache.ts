type Entry = { data: unknown; exp: number }
const store = new Map<string, Entry>()

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key)
  if (!e) return null
  if (Date.now() > e.exp) { store.delete(key); return null }
  return e.data as T
}

export function cacheSet(key: string, data: unknown, ttlMs: number) {
  if (store.size >= 100) {
    const now = Date.now()
    for (const [k, v] of store) if (now > v.exp) store.delete(k)
    if (store.size >= 100) {
      // Evict soonest-to-expire entry rather than clearing everything,
      // preventing a thundering-herd of cache misses under load.
      let oldest: string | undefined
      let oldestExp = Infinity
      for (const [k, v] of store) if (v.exp < oldestExp) { oldestExp = v.exp; oldest = k }
      if (oldest) store.delete(oldest)
    }
  }
  store.set(key, { data, exp: Date.now() + ttlMs })
}
