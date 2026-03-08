import { StrategyLeg, StrategyScenario, PayoffPoint, PayoffResult } from "./StrategyTypes";
import { bsPrice } from "./BlackScholes";
import { applyScenario } from "./ScenarioEngine";

const R = 0; // risk-free rate
const NUM_POINTS = 200;

function timeToExpiry(expiry: string): number {
    const expiryMs = Date.parse(`${expiry}T08:00:00.000Z`);
    if (!Number.isFinite(expiryMs)) return 0;
    return Math.max(0, (expiryMs - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * PnL of a single leg at a given simulated spot.
 * Uses BS pricing if T > 0 (before expiry), intrinsic at expiry.
 */
function legPnl(leg: StrategyLeg, simSpot: number, scenario: StrategyScenario): number {
    const baseT = timeToExpiry(leg.expiry);
    const baseIv = leg.iv ?? 0.5;
    const { spot: adjSpot, iv: adjIv, T: adjT } = applyScenario(simSpot, baseIv, baseT, {
        spotShiftPct: 0, // spot shift already applied via simSpot
        volShiftPct: scenario.volShiftPct,
        daysForward: scenario.daysForward,
    });

    let theoreticalValue: number;
    if (adjT <= 0) {
        // At expiry: intrinsic
        theoreticalValue = leg.type === "CALL"
            ? Math.max(0, adjSpot - leg.strike)
            : Math.max(0, leg.strike - adjSpot);
    } else {
        theoreticalValue = bsPrice(adjSpot, leg.strike, adjT, adjIv, R, leg.type);
    }

    const sign = leg.side === "BUY" ? 1 : -1;
    return sign * (theoreticalValue - leg.entryPrice) * leg.multiplier * leg.quantity;
}

/**
 * Compute the payoff curve for the entire strategy.
 */
export function computePayoffCurve(
    legs: StrategyLeg[],
    currentSpot: number,
    scenario: StrategyScenario
): PayoffResult {
    if (legs.length === 0 || currentSpot <= 0) {
        return { points: [], maxGain: null, maxLoss: null, breakEvens: [] };
    }

    const adjustedSpot = currentSpot * (1 + scenario.spotShiftPct);
    const low = adjustedSpot * 0.5;
    const high = adjustedSpot * 1.5;
    const step = (high - low) / NUM_POINTS;

    const points: PayoffPoint[] = [];
    let maxPnl = -Infinity;
    let minPnl = Infinity;

    for (let i = 0; i <= NUM_POINTS; i++) {
        const simSpot = low + step * i;
        let totalPnl = 0;
        for (const leg of legs) {
            totalPnl += legPnl(leg, simSpot, scenario);
        }
        points.push({ spot: simSpot, pnl: totalPnl });
        maxPnl = Math.max(maxPnl, totalPnl);
        minPnl = Math.min(minPnl, totalPnl);
    }

    // Break-even points: where PnL crosses zero
    const breakEvens: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if ((a.pnl <= 0 && b.pnl >= 0) || (a.pnl >= 0 && b.pnl <= 0)) {
            // Linear interpolation
            const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
            breakEvens.push(a.spot + ratio * (b.spot - a.spot));
        }
    }

    // Max gain/loss: if curve is still rising/falling at edges, consider unlimited
    const edgeTolerance = Math.abs(maxPnl - minPnl) * 0.01;
    const leftPnl = points[0].pnl;
    const rightPnl = points[points.length - 1].pnl;

    const hasUnlimitedGain = rightPnl >= maxPnl - edgeTolerance || leftPnl >= maxPnl - edgeTolerance;
    const hasUnlimitedLoss = rightPnl <= minPnl + edgeTolerance || leftPnl <= minPnl + edgeTolerance;

    return {
        points,
        maxGain: hasUnlimitedGain ? null : maxPnl,
        maxLoss: hasUnlimitedLoss ? null : minPnl,
        breakEvens,
    };
}
