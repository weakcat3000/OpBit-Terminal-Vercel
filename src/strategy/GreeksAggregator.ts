import { StrategyLeg, StrategyScenario, AggregatedGreeks } from "./StrategyTypes";
import { bsDelta, bsGamma, bsTheta, bsVega } from "./BlackScholes";
import { applyScenario } from "./ScenarioEngine";

const R = 0;

function timeToExpiry(expiry: string): number {
    const expiryMs = Date.parse(`${expiry}T08:00:00.000Z`);
    if (!Number.isFinite(expiryMs)) return 0;
    return Math.max(0, (expiryMs - Date.now()) / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Aggregate Black-Scholes Greeks across all strategy legs.
 * Each Greek is multiplied by quantity, multiplier, and side sign.
 */
export function aggregateGreeks(
    legs: StrategyLeg[],
    currentSpot: number,
    scenario: StrategyScenario
): AggregatedGreeks {
    let delta = 0;
    let gamma = 0;
    let theta = 0;
    let vega = 0;

    for (const leg of legs) {
        const baseT = timeToExpiry(leg.expiry);
        const baseIv = leg.iv ?? 0.5;
        const { spot, iv, T } = applyScenario(currentSpot, baseIv, baseT, scenario);

        if (T <= 0 || iv <= 0) continue;

        const sign = leg.side === "BUY" ? 1 : -1;
        const scale = sign * leg.quantity * leg.multiplier;

        delta += bsDelta(spot, leg.strike, T, iv, R, leg.type) * scale;
        gamma += bsGamma(spot, leg.strike, T, iv, R) * scale;
        theta += bsTheta(spot, leg.strike, T, iv, R, leg.type) * scale;
        vega += bsVega(spot, leg.strike, T, iv, R) * scale;
    }

    return { delta, gamma, theta, vega };
}
