import { StrategyScenario } from "./StrategyTypes";

export interface AdjustedParams {
    spot: number;
    iv: number;
    T: number;
}

/**
 * Apply scenario adjustments to base parameters.
 * Clamps IV >= 0.01 (1%) and T >= 0.
 */
export function applyScenario(
    baseSpot: number,
    baseIv: number,
    baseT: number,
    scenario: StrategyScenario
): AdjustedParams {
    const spot = baseSpot * (1 + scenario.spotShiftPct);
    const iv = Math.max(0.01, baseIv * (1 + scenario.volShiftPct));
    const T = Math.max(0, baseT - scenario.daysForward / 365);
    return { spot, iv, T };
}
