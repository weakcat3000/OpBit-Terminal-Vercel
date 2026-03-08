import { StrategyLeg, MarginEstimate } from "./StrategyTypes";
import { computePayoffCurve } from "./PayoffEngine";

const DISCLAIMER = "Approximation only — not exchange margin.";

/**
 * Basic margin estimation.
 * - Naked short: ~20% of spot minus OTM amount
 * - Defined-risk spreads: max loss
 */
export function estimateMargin(
    legs: StrategyLeg[],
    spot: number
): MarginEstimate {
    if (legs.length === 0) {
        return { estimatedMarginUsd: 0, disclaimer: DISCLAIMER };
    }

    const hasShort = legs.some((l) => l.side === "SELL");
    const hasLong = legs.some((l) => l.side === "BUY");

    // Pure long positions: margin = total premium paid
    if (!hasShort) {
        const totalPremium = legs.reduce(
            (sum, l) => sum + l.entryPrice * l.quantity * l.multiplier,
            0
        );
        return { estimatedMarginUsd: totalPremium, disclaimer: DISCLAIMER };
    }

    // If it's a spread (has both long and short): margin ≈ max loss
    if (hasShort && hasLong) {
        const result = computePayoffCurve(legs, spot, {
            spotShiftPct: 0,
            volShiftPct: 0,
            daysForward: 365, // at expiry
        });
        const maxLoss = result.maxLoss != null ? Math.abs(result.maxLoss) : spot * 0.2;
        return { estimatedMarginUsd: maxLoss, disclaimer: DISCLAIMER };
    }

    // Naked short: 20% * spot - OTM amount per leg
    let margin = 0;
    for (const leg of legs) {
        if (leg.side !== "SELL") continue;
        const otmAmount = leg.type === "CALL"
            ? Math.max(0, leg.strike - spot)
            : Math.max(0, spot - leg.strike);
        const nakedMargin = Math.max(
            0.20 * spot - otmAmount,
            0.10 * spot // floor at 10% of spot
        );
        margin += nakedMargin * leg.quantity * leg.multiplier;
    }

    return { estimatedMarginUsd: margin, disclaimer: DISCLAIMER };
}
