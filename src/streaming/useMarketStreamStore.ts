import { create } from "zustand";
import { ALL_VENUES, Venue } from "@/src/core/types/venues";
import {
    ExecutionSide,
    ExecutableRouterFilters,
    QuoteKey,
    StreamQuote,
    VenueHealthSnapshot,
} from "./types";

export interface StreamQuoteUpdate {
    key: QuoteKey;
    patch: Partial<StreamQuote>;
    seq?: number;
}

interface VenueConnectionState {
    connected: boolean;
    subscriptionCount: number;
    lastError?: string;
    lastUpdateMs: number | null;
}

interface MarketStreamState {
    quotes: Record<QuoteKey, StreamQuote>;
    venueHealth: Record<Venue, VenueHealthSnapshot>;
    venueConnections: Partial<Record<Venue, VenueConnectionState>>;
    executionSide: ExecutionSide;
    routerFilters: ExecutableRouterFilters;
    bestPulseSeqByContract: Record<string, number>;
    setExecutionSide: (side: ExecutionSide) => void;
    setRouterFilters: (patch: Partial<ExecutableRouterFilters>) => void;
    setQuotesBatch: (updates: StreamQuoteUpdate[]) => void;
    clearVenueQuotes: (venue: Venue) => void;
    setVenueConnection: (venue: Venue, patch: Partial<VenueConnectionState>) => void;
    setVenueHealth: (venue: Venue, patch: Partial<VenueHealthSnapshot>) => void;
    bumpBestPulse: (contractKey: string) => void;
}

const MIN_QUOTE_UPDATE_INTERVAL_MS = 250;

function defaultFilters(): ExecutableRouterFilters {
    return {
        minSize: 0,
        maxSpreadPct: 0.1,
        maxQuoteAgeMsWs: 7000,
        maxQuoteAgeMsPoll: 9000,
    };
}

function defaultVenueHealth(venue: Venue): VenueHealthSnapshot {
    return {
        venue,
        health: venue === "IBIT" ? "DELAYED" : "DOWN",
        latencyMs: null,
        ageMs: null,
        lastUpdateMs: null,
        connected: false,
        mode: venue === "IBIT" ? "delayed" : "none",
    };
}

function normalizeFinite(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
}

function normalizeQuote(prev: StreamQuote | undefined, patch: Partial<StreamQuote>, seq: number): StreamQuote {
    const now = Date.now();
    return {
        bid: normalizeFinite(patch.bid ?? prev?.bid ?? null),
        ask: normalizeFinite(patch.ask ?? prev?.ask ?? null),
        bidSize: normalizeFinite(patch.bidSize ?? prev?.bidSize ?? null),
        askSize: normalizeFinite(patch.askSize ?? prev?.askSize ?? null),
        mark: normalizeFinite(patch.mark ?? prev?.mark ?? null),
        mid: normalizeFinite(patch.mid ?? prev?.mid ?? null),
        iv: normalizeFinite(patch.iv ?? prev?.iv ?? null),
        delta: normalizeFinite(patch.delta ?? prev?.delta ?? null),
        gamma: normalizeFinite(patch.gamma ?? prev?.gamma ?? null),
        theta: normalizeFinite(patch.theta ?? prev?.theta ?? null),
        vega: normalizeFinite(patch.vega ?? prev?.vega ?? null),
        seq,
        lastUpdateMs: patch.lastUpdateMs ?? prev?.lastUpdateMs ?? now,
        source: patch.source ?? prev?.source ?? "poll",
    };
}

const initialVenueHealth = ALL_VENUES.reduce((acc, venue) => {
    acc[venue] = defaultVenueHealth(venue);
    return acc;
}, {} as Record<Venue, VenueHealthSnapshot>);

export const useMarketStreamStore = create<MarketStreamState>((set) => ({
    quotes: {},
    venueHealth: initialVenueHealth,
    venueConnections: {},
    executionSide: "BUY",
    routerFilters: defaultFilters(),
    bestPulseSeqByContract: {},
    setExecutionSide: (side) => set({ executionSide: side }),
    setRouterFilters: (patch) => set((state) => ({ routerFilters: { ...state.routerFilters, ...patch } })),
    setQuotesBatch: (updates) =>
        set((state) => {
            if (updates.length === 0) return state;
            const nextQuotes = { ...state.quotes };
            for (const update of updates) {
                const prev = nextQuotes[update.key];
                const incomingSeq = update.seq ?? (prev?.seq ?? 0) + 1;
                if (prev && incomingSeq < prev.seq) {
                    continue;
                }
                const incomingTs = update.patch.lastUpdateMs ?? Date.now();
                const prevTs = prev?.lastUpdateMs ?? null;
                if (prevTs != null && incomingTs - prevTs < MIN_QUOTE_UPDATE_INTERVAL_MS) {
                    continue;
                }
                nextQuotes[update.key] = normalizeQuote(
                    prev,
                    { ...update.patch, lastUpdateMs: incomingTs },
                    incomingSeq
                );
            }
            return { quotes: nextQuotes };
        }),
    clearVenueQuotes: (venue) =>
        set((state) => {
            const nextQuotes: Record<QuoteKey, StreamQuote> = {} as Record<QuoteKey, StreamQuote>;
            for (const [key, quote] of Object.entries(state.quotes) as Array<[QuoteKey, StreamQuote]>) {
                if (!key.startsWith(`${venue}|`)) {
                    nextQuotes[key] = quote;
                }
            }
            return { quotes: nextQuotes };
        }),
    setVenueConnection: (venue, patch) =>
        set((state) => ({
            venueConnections: {
                ...state.venueConnections,
                [venue]: {
                    connected: patch.connected ?? state.venueConnections[venue]?.connected ?? false,
                    subscriptionCount: patch.subscriptionCount ?? state.venueConnections[venue]?.subscriptionCount ?? 0,
                    lastError: patch.lastError ?? state.venueConnections[venue]?.lastError,
                    lastUpdateMs: patch.lastUpdateMs ?? state.venueConnections[venue]?.lastUpdateMs ?? null,
                },
            },
        })),
    setVenueHealth: (venue, patch) =>
        set((state) => ({
            venueHealth: {
                ...state.venueHealth,
                [venue]: {
                    ...state.venueHealth[venue],
                    ...patch,
                },
            },
        })),
    bumpBestPulse: (contractKey) =>
        set((state) => ({
            bestPulseSeqByContract: {
                ...state.bestPulseSeqByContract,
                [contractKey]: (state.bestPulseSeqByContract[contractKey] ?? 0) + 1,
            },
        })),
}));
