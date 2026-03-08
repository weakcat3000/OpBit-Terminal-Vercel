import { Venue } from "@/src/core/types/venues";

export type ContractKey = string;
export type QuoteKey = `${Venue}|${ContractKey}`;
export type StreamSource = "ws" | "poll";

export interface StreamQuote {
    bid: number | null;
    ask: number | null;
    bidSize: number | null;
    askSize: number | null;
    mark: number | null;
    mid: number | null;
    iv: number | null;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
    seq: number;
    lastUpdateMs: number;
    source: StreamSource;
}

export type VenueLiveHealth = "LIVE" | "SLOW" | "STALE" | "DELAYED" | "DOWN";

export interface VenueHealthSnapshot {
    venue: Venue;
    health: VenueLiveHealth;
    latencyMs: number | null;
    ageMs: number | null;
    lastUpdateMs: number | null;
    connected: boolean;
    mode: StreamSource | "delayed" | "none";
    reason?: string;
}

export interface StreamDebugStatus {
    connectedVenues: Venue[];
    lastUpdateMsByVenue: Partial<Record<Venue, number | null>>;
    subscriptionCountByVenue: Partial<Record<Venue, number>>;
    timestamp: number;
}

export type ExecutionSide = "BUY" | "SELL";

export interface ExecutableRouterFilters {
    minSize: number;
    maxSpreadPct: number;
    maxQuoteAgeMsWs: number;
    maxQuoteAgeMsPoll: number;
}

export interface ExecutableBestCandidate {
    venue: Venue;
    price: number;
    side: "bid" | "ask";
    bid: number | null;
    ask: number | null;
    mid: number | null;
    size: number | null;
    spreadPct: number | null;
    ageMs: number;
    source: StreamSource | "snapshot";
    confidence: number;
    warnings: string[];
}

export interface ExecutableBestResult {
    venue: Venue | null;
    executablePrice: number | null;
    sideUsed: "bid" | "ask" | null;
    confidence: number;
    warnings: string[];
    candidateByVenue: Partial<Record<Venue, ExecutableBestCandidate>>;
}

