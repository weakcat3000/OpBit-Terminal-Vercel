import { Venue } from "../../core/types/venues";

export type ArbKind =
    | "CROSS_VENUE_SAME_CONTRACT"
    | "INTRA_VENUE_BOX"
    | "INTRA_VENUE_PUT_CALL_PARITY";

export interface ArbLeg {
    venue: Venue;
    contractKey: string;
    side: "BUY" | "SELL";
    /** ask if BUY, bid if SELL */
    pxUSD: number;
    midUSD: number;
    bidUSD: number;
    askUSD: number;
    spreadPct: number;
    /** USD notional capacity for this leg */
    sizeUSD?: number;
    strike: number;
    right: "C" | "P";
    expiry: string;
}

export interface ArbOpportunity {
    id: string;
    kind: ArbKind;
    underlying: string;
    expiry: string;
    /** Present for cross-venue + parity */
    strike?: number;
    /** For box spreads */
    strikes?: [number, number];
    /** Cross-venue */
    optionType?: "CALL" | "PUT";
    /** Intra-venue (box / parity) */
    venue?: Venue;
    /** Cross-venue buy side */
    buyVenue?: Venue;
    /** Cross-venue sell side */
    sellVenue?: Venue;
    legs: ArbLeg[];

    // Profitability
    /** Profit per 1 contract unit in USD */
    profitUSD_per1: number;
    /** Capital required per 1 unit (debit cost) */
    capitalUSD_per1: number;
    /** profitUSD_per1 / capitalUSD_per1 */
    profitPct: number;

    // Capacity
    /** Max executable size in USD based on worst leg liquidity */
    maxSizeUSD: number;
    /** Total potential profit at max size */
    profitUSD_max: number;
    /** Worst quote age across all legs */
    quoteAgeMsMax: number;

    // Metadata
    /** Human-readable label */
    label: string;
}

export type ArbPlaybook =
    | "ALL"
    | "CROSS_VENUE"
    | "BOX"
    | "CALLS_ONLY"
    | "PUTS_ONLY";

export interface ArbHistoryPoint {
    ts: number;
    profitPct: number;
    profitUSD_per1: number;
}
