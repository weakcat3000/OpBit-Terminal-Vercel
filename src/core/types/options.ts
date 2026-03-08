import { Venue } from "./venues";

export type Right = "C" | "P";
export type QuoteType = "ORDERBOOK" | "AMM" | "TRADFI" | "LIQUIDITY_ONLY";
export type UnderlyingFamily = "BTC" | "ETH" | "IBIT";

export interface StandardizedOption {
    spot: number | null;
    T: number | null;
    moneyness: number | null;
    midUsd: number | null;
    midUsdPerUnderlying: number | null;
    iv: number | null;
    delta?: number | null;
    gamma?: number | null;
    theta?: number | null;
    vega?: number | null;
    rho?: number | null;
    warnings?: string[];
}

/**
 * Canonical normalized option across all venues.
 * contractKey format: UNDERLYING|EXPIRY|STRIKE|RIGHT
 * Example: ETH|2026-03-29|3500|P
 */
export interface NormalizedOption {
    venue: Venue;
    underlying: string; // e.g., ETH, BTC, IBIT
    expiry: string;     // UTC date string YYYY-MM-DD
    strike: number;
    right: Right;
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
    rho?: number | null;
    openInterest: number | null;
    last: number | null;
    updatedAt: number;  // unix ms
    contractKey: string;
    rawId?: string;     // venue instrument id
    contractMultiplier?: number;
    quoteType?: QuoteType;
    standard?: StandardizedOption;
    warnings?: string[];
}

/**
 * A contract matched across multiple venues.
 */
export interface MatchedContract {
    contractKey: string;
    legsByVenue: Partial<Record<Venue, NormalizedOption>>;
    flags: string[]; // e.g., ["approxExpiryMatch"]
    metrics?: ComparisonMetrics;
}

/**
 * Comparison metrics for a matched contract.
 */
export interface ComparisonMetrics {
    spreadAbs?: number | null;
    spreadPct?: number | null;
    vsBenchmarkAbs?: number | null;
    vsBenchmarkPct?: number | null;
    ivGap?: number | null;
    benchmarkVenue: Venue;
    bestVenueByMid?: Venue | null;
    bestMidUsed?: number | null;
    bestSource?: "mid" | "avgBidAsk" | null;
    bestWarnings?: string[];
    metricWarnings?: string[];
}

/**
 * Build a canonical contractKey.
 */
export function makeContractKey(
    underlying: string,
    expiry: string,
    strike: number,
    right: Right
): string {
    return `${underlying}|${expiry}|${strike}|${right}`;
}

/**
 * Venue status reported per venue in API responses.
 */
export type VenueStatusCode = "ok" | "degraded" | "down";
export type VenueLiveStatusCode = VenueStatusCode | "delayed";

export interface VenueStatus {
    venue: Venue;
    status: VenueLiveStatusCode;
    reason?: string;
    lastUpdated: number; // unix ms
}

export function getUnderlyingFamily(underlying: string): UnderlyingFamily | null {
    const u = underlying.trim().toUpperCase();
    if (u.includes("BTC")) return "BTC";
    if (u.includes("ETH")) return "ETH";
    if (u === "IBIT") return "IBIT";
    return null;
}

