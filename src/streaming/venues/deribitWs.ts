import { Venue } from "@/src/core/types/venues";
import { WebSocketManager } from "@/src/streaming/WebSocketManager";
import { makeQuoteKey } from "@/src/streaming/streamSelectors";
import { StreamQuoteUpdate } from "@/src/streaming/useMarketStreamStore";

interface DeribitTickerMessage {
    params?: {
        channel?: string;
        data?: {
            instrument_name?: string;
            timestamp?: number;
            best_bid_price?: number | null;
            best_ask_price?: number | null;
            best_bid_amount?: number | null;
            best_ask_amount?: number | null;
            mark_price?: number | null;
            mark_iv?: number | null;
            underlying_price?: number | null;
            greeks?: {
                delta?: number | null;
                gamma?: number | null;
                theta?: number | null;
                vega?: number | null;
            };
        };
    };
}

interface DeribitWsCallbacks {
    onBatch: (updates: StreamQuoteUpdate[]) => void;
    onConnectionChange: (connected: boolean, subscriptionCount: number, reason?: string) => void;
    onVenueTick: (lastUpdateMs: number) => void;
}

const DERIBIT_MIN_EMIT_INTERVAL_MS = 3000;

function monthToDeribit(month: number): string {
    return ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][month] ?? "JAN";
}

function contractKeyToDeribitInstrument(contractKey: string): string | null {
    const [underlying, expiry, strikeRaw, right] = contractKey.split("|");
    if (!underlying || !expiry || !strikeRaw || !right) return null;

    const [yearRaw, monthRaw, dayRaw] = expiry.split("-");
    const year = Number.parseInt(yearRaw, 10);
    const month = Number.parseInt(monthRaw, 10) - 1;
    const day = Number.parseInt(dayRaw, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

    const yy = String(year).slice(-2);
    const dateCode = `${day}${monthToDeribit(month)}${yy}`;
    return `${underlying}-${dateCode}-${strikeRaw}-${right}`;
}

function normalizeDeribitIv(raw: number | null | undefined): number | null {
    if (raw == null || !Number.isFinite(raw)) return null;
    if (raw > 3) return raw / 100;
    if (raw < 0) return null;
    return raw;
}

export class DeribitWsStreamer {
    private readonly callbacks: DeribitWsCallbacks;
    private readonly ws: WebSocketManager;
    private readonly instrumentToContractKey = new Map<string, string>();
    private readonly lastEmitByContractKey = new Map<string, number>();
    private subscribedChannels = new Set<string>();
    private seq = 0;

    constructor(callbacks: DeribitWsCallbacks) {
        this.callbacks = callbacks;
        this.ws = new WebSocketManager({
            url: "wss://www.deribit.com/ws/api/v2",
            venue: "DERIBIT",
            heartbeatMs: 12000,
            onOpen: () => {
                this.callbacks.onConnectionChange(true, this.subscribedChannels.size);
                if (this.subscribedChannels.size > 0) {
                    this.ws.subscribe(Array.from(this.subscribedChannels));
                }
            },
            onClose: () => {
                this.callbacks.onConnectionChange(false, this.subscribedChannels.size, "WS disconnected");
            },
            onError: () => {
                this.callbacks.onConnectionChange(false, this.subscribedChannels.size, "WS error");
            },
            onMessage: (event) => this.handleMessage(event.data),
        });
    }

    start(): void {
        this.ws.connect();
    }

    stop(): void {
        this.ws.disconnect();
        this.instrumentToContractKey.clear();
        this.lastEmitByContractKey.clear();
        this.subscribedChannels.clear();
    }

    setSubscriptions(contractKeys: string[]): void {
        const nextInstrumentToContractKey = new Map<string, string>();
        const nextChannels = new Set<string>();

        for (const key of contractKeys) {
            const instrument = contractKeyToDeribitInstrument(key);
            if (!instrument) continue;
            nextInstrumentToContractKey.set(instrument, key);
            nextChannels.add(`ticker.${instrument}.100ms`);
        }

        const removed = Array.from(this.subscribedChannels).filter((ch) => !nextChannels.has(ch));
        const added = Array.from(nextChannels).filter((ch) => !this.subscribedChannels.has(ch));

        if (removed.length > 0) {
            this.ws.unsubscribe(removed);
            if (this.ws.isConnected()) {
                this.ws.send({
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: "public/unsubscribe",
                    params: { channels: removed },
                });
            }
        }
        if (added.length > 0) {
            this.ws.subscribe(added);
        }

        this.instrumentToContractKey.clear();
        for (const [instrument, key] of nextInstrumentToContractKey.entries()) {
            this.instrumentToContractKey.set(instrument, key);
        }
        const activeContractKeys = new Set(nextInstrumentToContractKey.values());
        for (const contractKey of this.lastEmitByContractKey.keys()) {
            if (!activeContractKeys.has(contractKey)) {
                this.lastEmitByContractKey.delete(contractKey);
            }
        }
        this.subscribedChannels = nextChannels;
        this.callbacks.onConnectionChange(this.ws.isConnected(), this.subscribedChannels.size);
    }

    private handleMessage(raw: string): void {
        let parsed: DeribitTickerMessage | null = null;
        try {
            parsed = JSON.parse(raw) as DeribitTickerMessage;
        } catch {
            return;
        }

        const channel = parsed.params?.channel;
        const data = parsed.params?.data;
        if (!channel || !data) return;
        if (!channel.startsWith("ticker.")) return;

        const instrumentName = data.instrument_name ?? channel.split(".")[1];
        if (!instrumentName) return;

        const contractKey = this.instrumentToContractKey.get(instrumentName);
        if (!contractKey) return;

        const nowMs = Date.now();
        const lastEmitMs = this.lastEmitByContractKey.get(contractKey);
        if (lastEmitMs != null && nowMs - lastEmitMs < DERIBIT_MIN_EMIT_INTERVAL_MS) {
            return;
        }
        this.lastEmitByContractKey.set(contractKey, nowMs);

        const underlyingPx = data.underlying_price && data.underlying_price > 0 ? data.underlying_price : null;
        const bid = data.best_bid_price != null && underlyingPx != null ? data.best_bid_price * underlyingPx : null;
        const ask = data.best_ask_price != null && underlyingPx != null ? data.best_ask_price * underlyingPx : null;
        const mark = data.mark_price != null && underlyingPx != null ? data.mark_price * underlyingPx : null;
        const mid = bid != null && ask != null ? (bid + ask) / 2 : mark;

        const updateMs = data.timestamp ?? Date.now();
        const nextSeq = ++this.seq;

        const update: StreamQuoteUpdate = {
            key: makeQuoteKey("DERIBIT", contractKey),
            seq: nextSeq,
            patch: {
                bid,
                ask,
                bidSize: data.best_bid_amount ?? null,
                askSize: data.best_ask_amount ?? null,
                mark,
                mid,
                iv: normalizeDeribitIv(data.mark_iv),
                delta: data.greeks?.delta ?? null,
                gamma: data.greeks?.gamma ?? null,
                theta: data.greeks?.theta ?? null,
                vega: data.greeks?.vega ?? null,
                lastUpdateMs: updateMs,
                source: "ws",
            },
        };

        this.callbacks.onBatch([update]);
        this.callbacks.onVenueTick(updateMs);
    }
}

export const DERIBIT_STREAM_VENUE: Venue = "DERIBIT";
