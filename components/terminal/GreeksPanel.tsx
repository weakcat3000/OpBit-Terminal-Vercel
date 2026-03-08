"use client";

import React, { useMemo } from "react";
import { StrategyLeg, StrategyScenario, AggregatedGreeks } from "@/src/strategy/StrategyTypes";
import { aggregateGreeks } from "@/src/strategy/GreeksAggregator";

interface GreeksPanelProps {
    legs: StrategyLeg[];
    spot: number;
    scenario: StrategyScenario;
}

function formatGreek(value: number, decimals: number): string {
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${value.toFixed(decimals)}`;
}

const GREEK_CONFIG: Array<{
    key: keyof AggregatedGreeks;
    label: string;
    decimals: number;
}> = [
        { key: "delta", label: "Δ Delta", decimals: 4 },
        { key: "gamma", label: "Γ Gamma", decimals: 6 },
        { key: "theta", label: "Θ Theta", decimals: 2 },
        { key: "vega", label: "ν Vega", decimals: 2 },
    ];

export function GreeksPanel({ legs, spot, scenario }: GreeksPanelProps) {
    const greeks = useMemo(
        () => aggregateGreeks(legs, spot, scenario),
        [legs, spot, scenario]
    );

    if (legs.length === 0) {
        return null;
    }

    return (
        <div className="grid grid-cols-4 gap-1 px-3 py-2">
            {GREEK_CONFIG.map(({ key, label, decimals }) => {
                const value = greeks[key];
                const color =
                    value > 0
                        ? "text-[#00e676]"
                        : value < 0
                            ? "text-[#ff5252]"
                            : "text-[#5a6a7a]";
                return (
                    <div key={key} className="text-center">
                        <div className="text-[8px] text-[#5a6a7a] uppercase tracking-wider mb-0.5">
                            {label}
                        </div>
                        <div className={`text-[11px] font-mono font-semibold ${color}`}>
                            {formatGreek(value, decimals)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
