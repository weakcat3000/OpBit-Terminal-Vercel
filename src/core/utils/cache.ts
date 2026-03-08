interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class TTLCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private inflight = new Map<string, Promise<unknown>>();

    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value as T;
    }

    set<T>(key: string, value: T, ttlMs: number): void {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }

    async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== undefined) return cached;

        const active = this.inflight.get(key);
        if (active) return active as Promise<T>;

        const promise = (async () => {
            const value = await fn();
            this.set(key, value, ttlMs);
            return value;
        })().finally(() => {
            this.inflight.delete(key);
        });

        this.inflight.set(key, promise);
        return promise;
    }

    clear(): void {
        this.store.clear();
        this.inflight.clear();
    }
}

export const cache = new TTLCache();

export const INSTRUMENTS_TTL = 10 * 60 * 1000;
export const QUOTES_TTL_CRYPTO = 2 * 1000;
export const QUOTES_TTL_TRADFI = 15 * 1000;
export const IBIT_EXPIRIES_TTL = 24 * 60 * 60 * 1000;
export const PANOPTIC_LIQUIDITY_TTL = 60 * 1000;

// Backward-compatible alias used by pre-phase-2 code.
export const QUOTES_TTL = QUOTES_TTL_CRYPTO;

