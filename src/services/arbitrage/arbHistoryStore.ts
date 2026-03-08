import { ArbHistoryPoint } from "./arbTypes";

const HISTORY_WINDOW_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1200;

/** In-memory ring buffer for arb opportunity profit history. */
class ArbHistoryStore {
    private store = new Map<string, ArbHistoryPoint[]>();

    /** Record a snapshot for an opportunity. Auto-prunes old entries. */
    record(id: string, profitPct: number, profitUSD_per1: number): void {
        const ts = Date.now();
        let history = this.store.get(id);
        if (!history) {
            history = [];
            this.store.set(id, history);
        }

        history.push({ ts, profitPct, profitUSD_per1 });

        // Prune: keep only last MAX_ENTRIES
        if (history.length > MAX_ENTRIES) {
            history.splice(0, history.length - MAX_ENTRIES);
        }
    }

    /** Get history for given opportunity id. */
    getHistory(id: string): ArbHistoryPoint[] {
        return this.store.get(id) ?? [];
    }

    /** Get all tracked IDs. */
    getTrackedIds(): string[] {
        return Array.from(this.store.keys());
    }

    /** Prune entries older than cutoffMs from now. */
    pruneStale(cutoffMs: number = HISTORY_WINDOW_MS): void {
        const threshold = Date.now() - cutoffMs;
        for (const [id, history] of this.store) {
            const filtered = history.filter((p) => p.ts >= threshold);
            if (filtered.length === 0) {
                this.store.delete(id);
            } else {
                this.store.set(id, filtered);
            }
        }
    }

    /** Clear all history. */
    clear(): void {
        this.store.clear();
    }
}

/** Singleton instance. */
export const arbHistoryStore = new ArbHistoryStore();

