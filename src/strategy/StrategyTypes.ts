import { Venue } from "@/src/core/types/venues";

// ─── Strategy Leg ───────────────────────────────────────────────
export interface StrategyLeg {
    id: string;
    contractKey: string;
    venue: Venue;
    side: "BUY" | "SELL";
    quantity: number;
    entryPrice: number;
    currentMark: number | null;
    strike: number;
    type: "CALL" | "PUT";
    expiry: string;
    iv: number | null;
    multiplier: number;
}

// ─── Scenario ───────────────────────────────────────────────────
export interface StrategyScenario {
    spotShiftPct: number;   // e.g. 0.05 = +5%
    volShiftPct: number;    // e.g. -0.10 = -10%
    daysForward: number;    // 0..30
}

// ─── Payoff ─────────────────────────────────────────────────────
export interface PayoffPoint {
    spot: number;
    pnl: number;
}

export interface PayoffResult {
    points: PayoffPoint[];
    maxGain: number | null;   // null = unlimited
    maxLoss: number | null;   // null = unlimited
    breakEvens: number[];
}

// ─── Greeks ─────────────────────────────────────────────────────
export interface AggregatedGreeks {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
}

// ─── Presets ────────────────────────────────────────────────────
export type StrategyPresetKey =
    | "LONG_CALL"
    | "LONG_PUT"
    | "STRADDLE"
    | "STRANGLE"
    | "BULL_CALL_SPREAD"
    | "BEAR_CALL_SPREAD"
    | "BULL_PUT_SPREAD"
    | "BEAR_PUT_SPREAD"
    | "IRON_CONDOR"
    | "COVERED_CALL";

export const PRESET_LABELS: Record<StrategyPresetKey, string> = {
    LONG_CALL: "Long Call",
    LONG_PUT: "Long Put",
    STRADDLE: "Straddle",
    STRANGLE: "Strangle",
    BULL_CALL_SPREAD: "Bull Call Spread",
    BEAR_CALL_SPREAD: "Bear Call Spread",
    BULL_PUT_SPREAD: "Bull Put Spread",
    BEAR_PUT_SPREAD: "Bear Put Spread",
    IRON_CONDOR: "Iron Condor",
    COVERED_CALL: "Covered Call",
};

// ─── Margin ─────────────────────────────────────────────────────
export interface MarginEstimate {
    estimatedMarginUsd: number;
    disclaimer: string;
}
