import { MarketHealthEngine } from "@/src/health/MarketHealthEngine";
import { Venue } from "@/src/core/types/venues";
import { createRafBatcher } from "@/src/streaming/throttle";
import { StreamDebugStatus } from "@/src/streaming/types";
import { StreamQuoteUpdate, useMarketStreamStore } from "@/src/streaming/useMarketStreamStore";
import { AevoPollStreamer } from "@/src/streaming/venues/aevoPoll";
import { DeribitWsStreamer } from "@/src/streaming/venues/deribitWs";
import { IbitPollStreamer } from "@/src/streaming/venues/ibitPoll";
import { LyraPollStreamer } from "@/src/streaming/venues/lyraPoll";

export interface StreamContext {
    underlying: string;
    expiry: string | null;
    activeVenues: Venue[];
    contractKeys: string[];
}

class StreamRegistry {
    private readonly deribit: DeribitWsStreamer;
    private readonly aevo: AevoPollStreamer;
    private readonly lyra: LyraPollStreamer;
    private readonly ibit: IbitPollStreamer;
    private context: StreamContext | null = null;
    private started = false;
    private healthTimer: ReturnType<typeof setInterval> | null = null;
    private debugTimer: ReturnType<typeof setInterval> | null = null;
    private lastUpdateByVenue: Partial<Record<Venue, number>> = {};
    private readonly enqueueUpdates: (updates: StreamQuoteUpdate[]) => void;

    constructor() {
        const batchedApply = createRafBatcher<StreamQuoteUpdate>(
            (batch) => {
                useMarketStreamStore.getState().setQuotesBatch(batch);
            }
        );

        this.enqueueUpdates = (updates) => {
            for (const update of updates) {
                batchedApply(update);
            }
        };

        const callbacks = (venue: Venue) => ({
            onBatch: (updates: StreamQuoteUpdate[]) => {
                this.enqueueUpdates(updates);
            },
            onConnectionChange: (connected: boolean, subscriptionCount: number, reason?: string) => {
                useMarketStreamStore.getState().setVenueConnection(venue, {
                    connected,
                    subscriptionCount,
                    lastError: reason,
                    lastUpdateMs: this.lastUpdateByVenue[venue] ?? null,
                });
                useMarketStreamStore.getState().setVenueHealth(venue, {
                    connected,
                    reason,
                    mode: venue === "DERIBIT" ? "ws" : venue === "IBIT" ? "delayed" : "poll",
                });
            },
            onVenueTick: (lastUpdateMs: number) => {
                this.lastUpdateByVenue[venue] = lastUpdateMs;
                useMarketStreamStore.getState().setVenueConnection(venue, { lastUpdateMs });
                useMarketStreamStore.getState().setVenueHealth(venue, { lastUpdateMs });
            },
        });

        this.deribit = new DeribitWsStreamer(callbacks("DERIBIT"));
        this.aevo = new AevoPollStreamer(callbacks("AEVO"));
        this.lyra = new LyraPollStreamer(callbacks("LYRA_V2"));
        this.ibit = new IbitPollStreamer(callbacks("IBIT"));
    }

    start(context: StreamContext): void {
        this.context = context;
        if (!this.started) {
            this.deribit.start();
            this.started = true;
            this.startHealthLoop();
            this.startDebugLoop();
        }
        this.update(context);
    }

    update(context: StreamContext): void {
        this.context = context;
        const active = new Set(context.activeVenues);
        const contractKeys = context.contractKeys;

        if (active.has("DERIBIT")) {
            this.deribit.setSubscriptions(contractKeys);
        } else {
            this.deribit.setSubscriptions([]);
            useMarketStreamStore.getState().clearVenueQuotes("DERIBIT");
        }

        if (active.has("AEVO")) {
            this.aevo.updateContext(context.underlying, context.expiry, contractKeys);
        } else {
            this.aevo.updateContext(context.underlying, null, []);
            useMarketStreamStore.getState().clearVenueQuotes("AEVO");
        }

        if (active.has("LYRA_V2")) {
            this.lyra.updateContext(context.underlying, context.expiry, contractKeys);
        } else {
            this.lyra.updateContext(context.underlying, null, []);
            useMarketStreamStore.getState().clearVenueQuotes("LYRA_V2");
        }

        if (active.has("IBIT")) {
            this.ibit.updateContext(context.underlying, context.expiry, contractKeys);
        } else {
            this.ibit.updateContext(context.underlying, null, []);
            useMarketStreamStore.getState().clearVenueQuotes("IBIT");
        }
    }

    stop(): void {
        this.deribit.stop();
        this.aevo.stop();
        this.lyra.stop();
        this.ibit.stop();
        this.started = false;
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
        if (this.debugTimer) {
            clearInterval(this.debugTimer);
            this.debugTimer = null;
        }
    }

    private startHealthLoop(): void {
        if (this.healthTimer) return;
        this.healthTimer = setInterval(() => {
            const store = useMarketStreamStore.getState();
            const now = Date.now();
            for (const [venue, snapshot] of Object.entries(store.venueHealth) as Array<[Venue, typeof store.venueHealth[Venue]]>) {
                const next = MarketHealthEngine.evaluate(snapshot, now);
                store.setVenueHealth(venue, next);
            }
        }, 500);
    }

    private startDebugLoop(): void {
        if (this.debugTimer) return;
        this.debugTimer = setInterval(() => {
            const status = this.getDebugStatus();
            fetch("/api/stream/status", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(status),
                keepalive: true,
            }).catch(() => {
                // ignore debug transport errors
            });
        }, 2000);
    }

    getDebugStatus(): StreamDebugStatus {
        const store = useMarketStreamStore.getState();
        const connectedVenues = (Object.entries(store.venueConnections) as Array<[Venue, { connected: boolean }]>)
            .filter(([, state]) => state.connected)
            .map(([venue]) => venue);

        const subscriptionCountByVenue: Partial<Record<Venue, number>> = {};
        const lastUpdateMsByVenue: Partial<Record<Venue, number | null>> = {};
        for (const [venue, state] of Object.entries(store.venueConnections) as Array<
            [Venue, { subscriptionCount?: number; lastUpdateMs?: number | null }]
        >) {
            subscriptionCountByVenue[venue] = state.subscriptionCount ?? 0;
            lastUpdateMsByVenue[venue] = state.lastUpdateMs ?? null;
        }

        return {
            connectedVenues,
            lastUpdateMsByVenue,
            subscriptionCountByVenue,
            timestamp: Date.now(),
        };
    }
}

export const streamRegistry = new StreamRegistry();
