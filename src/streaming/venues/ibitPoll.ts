import { makeQuoteKey } from "@/src/streaming/streamSelectors";
import { StreamQuoteUpdate } from "@/src/streaming/useMarketStreamStore";

interface CompareRow {
    contractKey: string;
    venues: Record<string, {
        bid: number | null;
        ask: number | null;
        bidSize?: number | null;
        askSize?: number | null;
        mid: number | null;
        markIv: number | null;
        delta?: number | null;
        gamma?: number | null;
        theta?: number | null;
        vega?: number | null;
    }>;
}

interface CompareResponse {
    rows?: CompareRow[];
}

interface PollCallbacks {
    onBatch: (updates: StreamQuoteUpdate[]) => void;
    onConnectionChange: (connected: boolean, subscriptionCount: number, reason?: string) => void;
    onVenueTick: (lastUpdateMs: number) => void;
}

const IBIT_POLL_INTERVAL_MS = 5000;

function extractExpiry(contractKey: string): string | null {
    const [, expiry] = contractKey.split("|");
    return expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null;
}

export class IbitPollStreamer {
    private readonly callbacks: PollCallbacks;
    private timer: ReturnType<typeof setInterval> | null = null;
    private expiry: string | null = null;
    private contractKeys: string[] = [];
    private seq = 0;

    constructor(callbacks: PollCallbacks) {
        this.callbacks = callbacks;
    }

    start(): void {
        this.restart();
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    updateContext(underlying: string, expiry: string | null, contractKeys: string[]): void {
        if (underlying !== "IBIT") {
            this.expiry = null;
            this.contractKeys = [];
            this.stop();
            this.callbacks.onConnectionChange(true, 0, "Delayed venue");
            return;
        }
        this.expiry = expiry;
        this.contractKeys = contractKeys;
        this.restart();
    }

    private restart(): void {
        this.stop();
        if (!this.expiry || this.contractKeys.length === 0) {
            this.callbacks.onConnectionChange(true, 0, "Delayed venue");
            return;
        }
        this.fetchOnce();
        this.timer = setInterval(() => this.fetchOnce(), IBIT_POLL_INTERVAL_MS);
    }

    private async fetchOnce(): Promise<void> {
        if (this.contractKeys.length === 0) return;

        try {
            const updates: StreamQuoteUpdate[] = [];
            const keysByExpiry = new Map<string, string[]>();
            for (const contractKey of this.contractKeys) {
                const keyExpiry = extractExpiry(contractKey) ?? this.expiry;
                if (!keyExpiry) continue;
                const list = keysByExpiry.get(keyExpiry) ?? [];
                list.push(contractKey);
                keysByExpiry.set(keyExpiry, list);
            }

            for (const [targetExpiry, keys] of keysByExpiry) {
                const params = new URLSearchParams({
                    underlying: "IBIT",
                    expiry: targetExpiry,
                    venues: "IBIT",
                    benchmark: "DERIBIT",
                });

                const response = await fetch(`/api/options/compare?${params.toString()}`, { cache: "no-store" });
                if (!response.ok) {
                    this.callbacks.onConnectionChange(false, this.contractKeys.length, `IBIT poll HTTP ${response.status}`);
                    continue;
                }
                const json = (await response.json()) as CompareResponse;
                const rows = json.rows ?? [];
                const allowed = new Set(keys);

                for (const row of rows) {
                    if (!allowed.has(row.contractKey)) continue;
                    const venue = row.venues?.IBIT;
                    if (!venue) continue;

                    updates.push({
                        key: makeQuoteKey("IBIT", row.contractKey),
                        seq: ++this.seq,
                        patch: {
                            bid: venue.bid ?? null,
                            ask: venue.ask ?? null,
                            bidSize: venue.bidSize ?? null,
                            askSize: venue.askSize ?? null,
                            mark: venue.mid ?? null,
                            mid: venue.mid ?? null,
                            iv: venue.markIv ?? null,
                            delta: venue.delta ?? null,
                            gamma: venue.gamma ?? null,
                            theta: venue.theta ?? null,
                            vega: venue.vega ?? null,
                            lastUpdateMs: Date.now(),
                            source: "poll",
                        },
                    });
                }
            }

            const now = Date.now();
            this.callbacks.onConnectionChange(true, this.contractKeys.length, "Delayed venue");
            this.callbacks.onVenueTick(now);

            if (updates.length > 0) {
                this.callbacks.onBatch(updates);
            }
        } catch (error) {
            this.callbacks.onConnectionChange(
                false,
                this.contractKeys.length,
                error instanceof Error ? error.message : "IBIT poll error"
            );
        }
    }
}
