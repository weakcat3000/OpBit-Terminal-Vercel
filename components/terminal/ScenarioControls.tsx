"use client";

import React from "react";
import { useStrategyBuilderStore } from "@/src/strategy/StrategyBuilderStore";

export function ScenarioControls() {
    const scenario = useStrategyBuilderStore((s) => s.scenario);
    const setScenario = useStrategyBuilderStore((s) => s.setScenario);

    return (
        <div className="px-3 py-2 space-y-2">
            <div className="text-[9px] text-[#5a6a7a] uppercase tracking-wider font-semibold">
                Scenario Analysis
            </div>

            {/* Spot Shift */}
            <div className="flex items-center gap-2">
                <label className="text-[9px] text-[#8b9bab] w-[70px] shrink-0">
                    Spot {scenario.spotShiftPct >= 0 ? "+" : ""}{(scenario.spotShiftPct * 100).toFixed(0)}%
                </label>
                <input
                    type="range"
                    min="-20" max="20" step="1"
                    value={scenario.spotShiftPct * 100}
                    onChange={(e) => setScenario({ spotShiftPct: Number(e.target.value) / 100 })}
                    className="flex-1 h-1 accent-[#39d5ff] bg-[#1e2a3a] rounded cursor-pointer"
                    title="Spot price shift percentage"
                />
            </div>

            {/* Vol Shift */}
            <div className="flex items-center gap-2">
                <label className="text-[9px] text-[#8b9bab] w-[70px] shrink-0">
                    Vol {scenario.volShiftPct >= 0 ? "+" : ""}{(scenario.volShiftPct * 100).toFixed(0)}%
                </label>
                <input
                    type="range"
                    min="-30" max="30" step="1"
                    value={scenario.volShiftPct * 100}
                    onChange={(e) => setScenario({ volShiftPct: Number(e.target.value) / 100 })}
                    className="flex-1 h-1 accent-[#39d5ff] bg-[#1e2a3a] rounded cursor-pointer"
                    title="Implied volatility shift percentage"
                />
            </div>

            {/* Days Forward */}
            <div className="flex items-center gap-2">
                <label className="text-[9px] text-[#8b9bab] w-[70px] shrink-0">
                    +{scenario.daysForward}d
                </label>
                <input
                    type="range"
                    min="0" max="30" step="1"
                    value={scenario.daysForward}
                    onChange={(e) => setScenario({ daysForward: Number(e.target.value) })}
                    className="flex-1 h-1 accent-[#39d5ff] bg-[#1e2a3a] rounded cursor-pointer"
                    title="Days forward to expiry"
                />
            </div>

            {/* Reset */}
            {(scenario.spotShiftPct !== 0 || scenario.volShiftPct !== 0 || scenario.daysForward !== 0) && (
                <button
                    type="button"
                    onClick={() => setScenario({ spotShiftPct: 0, volShiftPct: 0, daysForward: 0 })}
                    className="text-[9px] text-[#5a6a7a] hover:text-[#39d5ff] transition-colors"
                >
                    Reset Scenario
                </button>
            )}
        </div>
    );
}
