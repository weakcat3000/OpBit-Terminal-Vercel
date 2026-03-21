import { StrategyLeg, StrategyScenario, PayoffPoint, PayoffResult } from "./StrategyTypes";

const NUM_POINTS = 200;
const ZERO_EPS = 1e-9;

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

function isNearZero(value: number): boolean {
    return Math.abs(value) <= ZERO_EPS;
}

function pushBreakEvenUnique(target: number[], spot: number, tolerance: number): void {
    if (!Number.isFinite(spot)) return;
    const prev = target[target.length - 1];
    if (prev != null && Math.abs(prev - spot) <= tolerance) return;
    target.push(spot);
}

/**
 * PnL of a single leg at a given simulated spot.
 * Uses intrinsic value at expiry.
 */
function legPnl(leg: StrategyLeg, simSpot: number, mode: "profit" | "payoff"): number {
    const strike = leg.strike > 0 && Number.isFinite(leg.strike) ? leg.strike : 0;
    const entryPrice = leg.entryPrice >= 0 && Number.isFinite(leg.entryPrice) ? leg.entryPrice : 0;
    const multiplier = leg.multiplier > 0 && Number.isFinite(leg.multiplier) ? leg.multiplier : 1;
    const quantity = leg.quantity > 0 && Number.isFinite(leg.quantity) ? leg.quantity : 0;

    const intrinsicValue = leg.type === "CALL"
        ? Math.max(0, simSpot - strike)
        : Math.max(0, strike - simSpot);

    const sign = leg.side === "BUY" ? 1 : -1;
    if (mode === "payoff") {
        // Pure payoff: raw value without subtracting premium
        return sign * intrinsicValue * multiplier * quantity;
    }
    // Profit at expiry: intrinsic minus premium paid/received.
    return sign * (intrinsicValue - entryPrice) * multiplier * quantity;
}

/**
 * Compute the payoff curve for the entire strategy.
 */
export function computePayoffCurve(
    legs: StrategyLeg[],
    currentSpot: number,
    scenario: StrategyScenario,
    mode: "profit" | "payoff" = "payoff"
): PayoffResult {
    if (legs.length === 0 || currentSpot <= 0) {
        return { points: [], maxGain: null, maxLoss: null, breakEvens: [] };
    }

    const adjustedSpot = currentSpot * (1 + scenario.spotShiftPct);
    const strikes = legs
        .map((leg) => (Number.isFinite(leg.strike) && leg.strike > 0 ? leg.strike : null))
        .filter((value): value is number => value != null);
    const maxStrikeDistance = strikes.length > 0
        ? Math.max(...strikes.map((strike) => Math.abs(strike - adjustedSpot)))
        : 0;

    // Keep spot roughly centered while still including S=0 for put-side max gain visibility.
    const span = Math.max(adjustedSpot, maxStrikeDistance * 1.25, 1);
    const low = Math.max(0, adjustedSpot - span);
    const high = Math.max(adjustedSpot + span, low + 1);
    const step = (high - low) / NUM_POINTS;

    const points: PayoffPoint[] = [];
    let maxPnl = -Infinity;
    let minPnl = Infinity;

    for (let i = 0; i <= NUM_POINTS; i++) {
        const simSpot = low + step * i;
        let totalPnl = 0;
        for (const leg of legs) {
            const legContribution = legPnl(leg, simSpot, mode);
            if (Number.isFinite(legContribution)) {
                totalPnl += legContribution;
            }
        }
        totalPnl = finiteOr(totalPnl, 0);
        points.push({ spot: simSpot, pnl: totalPnl });
        maxPnl = Math.max(maxPnl, totalPnl);
        minPnl = Math.min(minPnl, totalPnl);
    }

    // Break-even points: where PnL crosses zero
    const breakEvens: number[] = [];
    const beTolerance = Math.max(step * 0.75, ZERO_EPS);
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const aPnl = finiteOr(a.pnl, 0);
        const bPnl = finiteOr(b.pnl, 0);

        // Skip flat-zero plateaus to avoid 0/0 interpolation NaNs.
        if (isNearZero(aPnl) && isNearZero(bPnl)) continue;
        if (isNearZero(aPnl)) {
            pushBreakEvenUnique(breakEvens, a.spot, beTolerance);
            continue;
        }
        if (isNearZero(bPnl)) {
            pushBreakEvenUnique(breakEvens, b.spot, beTolerance);
            continue;
        }
        if (aPnl * bPnl < 0) {
            const denom = Math.abs(aPnl) + Math.abs(bPnl);
            if (denom <= ZERO_EPS) continue;
            const ratio = Math.abs(aPnl) / denom;
            pushBreakEvenUnique(breakEvens, a.spot + ratio * (b.spot - a.spot), beTolerance);
        }
    }

    // Max gain/loss: if curve is still rising/falling at edges, consider unlimited
    if (!Number.isFinite(maxPnl) || !Number.isFinite(minPnl) || points.length === 0) {
        return {
            points,
            maxGain: null,
            maxLoss: null,
            breakEvens,
        };
    }

    // Structural infinity detection:
    // As S -> +infinity, calls dominate with linear slope:
    // slope = sum(sign * qty * multiplier for CALL legs).
    // Positive slope => unlimited gain, negative slope => unlimited loss.
    let callSlope = 0;
    for (const leg of legs) {
        if (leg.type !== "CALL") continue;
        const sign = leg.side === "BUY" ? 1 : -1;
        const multiplier = Number.isFinite(leg.multiplier) && leg.multiplier > 0 ? leg.multiplier : 1;
        const quantity = Number.isFinite(leg.quantity) && leg.quantity > 0 ? leg.quantity : 0;
        callSlope += sign * multiplier * quantity;
    }
    const hasUnlimitedGain = callSlope > ZERO_EPS;
    const hasUnlimitedLoss = callSlope < -ZERO_EPS;

    return {
        points,
        maxGain: hasUnlimitedGain ? null : maxPnl,
        maxLoss: hasUnlimitedLoss ? null : minPnl,
        breakEvens,
    };
}
