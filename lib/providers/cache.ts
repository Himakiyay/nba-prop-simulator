interface Entry<T> {
  expires: number;
  value: T;
}

export function createCache() {
  const map = new Map<string, Entry<unknown>>();
  return {
    get<T>(key: string): T | null {
      const hit = map.get(key);
      if (!hit || Date.now() > hit.expires) return null;
      return hit.value as T;
    },
    getStale<T>(key: string): T | null {
      const hit = map.get(key);
      return hit ? (hit.value as T) : null;
    },
    set<T>(key: string, value: T, ttlMs: number) {
      map.set(key, { expires: Date.now() + ttlMs, value });
    },
  };
}

export const providerCache = createCache();

const hits = new Map<string, number[]>();

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
