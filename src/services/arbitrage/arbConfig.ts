export interface ArbConfig {
    /** Max bid-ask spread per leg (default 5%) */
    maxSpreadPct: number;
    /** Min profit to display (default 2%) */
    minProfitPct: number;
    /** Min total notional capacity in USD */
    minNotionalUsd: number;
    /** Min per-leg size in USD */
    minLegSizeUsd: number;
    /** Max quote staleness in ms */
    maxQuoteAgeMs: number;
    /** Box spread strike band around spot [low, high] multipliers */
    boxStrikeBand: [number, number];
}

export const DEFAULT_ARB_CONFIG: ArbConfig = {
    maxSpreadPct: 0.15,
    minProfitPct: 0.001,
    minNotionalUsd: 500,
    minLegSizeUsd: 100,
    maxQuoteAgeMs: 60_000,
    boxStrikeBand: [0.8, 1.2],
};
