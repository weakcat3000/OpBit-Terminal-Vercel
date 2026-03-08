"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Venue } from "@/src/core/types/venues";
import { useStrategyBuilderStore } from "@/src/strategy/StrategyBuilderStore";
import { StrategyPresetKey, PRESET_LABELS } from "@/src/strategy/StrategyTypes";
import { estimateMargin } from "@/src/strategy/MarginEstimator";
import { CompareRow } from "@/src/services/optionsService";
import { StrategyLegRow } from "./StrategyLegRow";
import { PayoffChart } from "./PayoffChart";
import { GreeksPanel } from "./GreeksPanel";
import { ScenarioControls } from "./ScenarioControls";
import { PresetConfigurator } from "./PresetConfigurator";
import { ArbPanel, ArbContractNavigationTarget, ArbUiContextSnapshot } from "./ArbPanel";

interface StrategyDrawerProps {
    rows: CompareRow[];
    underlying: string;
    selectedExpiry: string | null;
    expiries: string[];
    onSelectExpiry: (e: string) => void;
    assistantPreset?: { preset: StrategyPresetKey; nonce: number } | null;
    themeMode: "dark" | "light";
    highlightPresets?: boolean;
    highlightArbButton?: boolean;
    venues: Venue[];
    arbOpen: boolean;
    onOpenArb: () => void;
    onCloseArb: () => void;
    onNavigateArbContract?: (target: ArbContractNavigationTarget) => void;
    onTrackedArbContractsChange?: (contractKeys: string[]) => void;
    onArbContextChange?: (snapshot: ArbUiContextSnapshot | null) => void;
}

const PRESETS: StrategyPresetKey[] = [
    "LONG_CALL",
    "LONG_PUT",
    "STRADDLE",
    "STRANGLE",
    "BULL_CALL_SPREAD",
    "BEAR_CALL_SPREAD",
    "BULL_PUT_SPREAD",
    "BEAR_PUT_SPREAD",
    "IRON_CONDOR",
    "COVERED_CALL",
];

export function StrategyDrawer({
    rows,
    underlying,
    selectedExpiry,
    expiries,
    onSelectExpiry,
    assistantPreset,
    themeMode,
    highlightPresets = false,
    highlightArbButton = false,
    venues,
    arbOpen,
    onOpenArb,
    onCloseArb,
    onNavigateArbContract,
    onTrackedArbContractsChange,
    onArbContextChange,
}: StrategyDrawerProps) {
    const strategyDrawerOpen = useStrategyBuilderStore((s) => s.drawerOpen);
    const openStrategyDrawer = useStrategyBuilderStore((s) => s.openDrawer);
    const legs = useStrategyBuilderStore((s) => s.legs);
    const spot = useStrategyBuilderStore((s) => s.spot);
    const scenario = useStrategyBuilderStore((s) => s.scenario);
    const clearAll = useStrategyBuilderStore((s) => s.clearAll);

    const [activePreset, setActivePreset] = useState<StrategyPresetKey | null>(null);

    const panelMode: "none" | "strategy" | "arb" = strategyDrawerOpen
        ? "strategy"
        : arbOpen
            ? "arb"
            : "none";
    const drawerOpen = panelMode !== "none";

    useEffect(() => {
        if (!assistantPreset) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActivePreset(assistantPreset.preset);
    }, [assistantPreset]);

    const margin = useMemo(
        () => estimateMargin(legs, spot),
        [legs, spot]
    );

    const totalPnl = useMemo(() => {
        let total = 0;
        for (const leg of legs) {
            if (leg.currentMark == null) continue;
            const sign = leg.side === "BUY" ? 1 : -1;
            total += sign * (leg.currentMark - leg.entryPrice) * leg.multiplier * leg.quantity;
        }
        return total;
    }, [legs]);

    const closeStrategyDrawer = () => {
        useStrategyBuilderStore.setState({ drawerOpen: false });
    };

    const handleOpenStrategy = () => {
        if (arbOpen) onCloseArb();
        openStrategyDrawer();
    };

    const handleOpenArb = () => {
        if (strategyDrawerOpen) {
            closeStrategyDrawer();
        }
        onOpenArb();
    };

    return (
        <div
            className={`h-full bg-[#0a0f18] border-l border-[#1e2a3a] flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${drawerOpen ? "w-[400px]" : "w-[36px]"}`}
        >
            {!drawerOpen && (
                <div className="h-full w-full grid grid-rows-2">
                    <button
                        type="button"
                        onClick={handleOpenStrategy}
                        className="group relative h-full w-full flex items-center justify-center bg-gradient-to-b from-[#0d1b2d] to-[#081323] hover:from-[#10233a] hover:to-[#0a1a2e] transition-colors border-b border-[#1e2a3a]"
                        title="Open Options Strategy Builder (S)"
                    >
                        <span className="absolute top-2 text-[8px] font-mono uppercase tracking-[0.2em] text-[#6c8fb1] group-hover:text-[#8db4db]">
                            Open
                        </span>
                        <span
                            aria-hidden="true"
                            className="absolute top-6 text-[11px] leading-none text-[#7ea7cf] group-hover:text-[#b2d7ff]"
                        >
                            &lt;-
                        </span>
                        <span className="text-[9px] text-[#88add2] uppercase tracking-[0.2em] font-mono font-bold [writing-mode:vertical-rl] group-hover:text-[#b2d7ff]">
                            Options Strategy
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenArb}
                        className="group relative h-full w-full flex items-center justify-center bg-gradient-to-b from-[#0d1b2d] to-[#081323] hover:from-[#10233a] hover:to-[#0a1a2e] transition-colors"
                        title="Open Arbitrage Scanner"
                    >
                        <span className="absolute top-2 text-[8px] font-mono uppercase tracking-[0.2em] text-[#6c8fb1] group-hover:text-[#8db4db]">
                            Open
                        </span>
                        <span
                            aria-hidden="true"
                            className="absolute top-6 text-[11px] leading-none text-[#7ea7cf] group-hover:text-[#b2d7ff]"
                        >
                            &lt;-
                        </span>
                        <span className="text-[9px] text-[#88add2] uppercase tracking-[0.2em] font-mono font-bold [writing-mode:vertical-rl] group-hover:text-[#b2d7ff]">
                            Arbitrage
                        </span>
                    </button>
                </div>
            )}

            {drawerOpen && panelMode === "strategy" && (
                <>
                    <div className="px-3 py-2 border-b border-[#1e2a3a] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[#e2e8f0] font-semibold uppercase tracking-wider">
                                Options Strategy Builder
                            </span>
                            {legs.length > 0 && (
                                <span className="text-[9px] text-[#5a6a7a] font-mono">
                                    {legs.length} leg{legs.length !== 1 ? "s" : ""}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={handleOpenArb}
                                className={`px-2 py-0.5 text-[9px] rounded transition-colors ${highlightArbButton
                                        ? "text-[#b9ddff] border border-[#47b5ff] bg-[#47b5ff]/15 shadow-[0_0_14px_rgba(71,181,255,0.55)]"
                                        : "text-[#88bbdd] border border-[#2a4a6a] hover:bg-[#16304a]"
                                    }`}
                            >
                                ARB
                            </button>
                            {legs.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="px-2 py-0.5 text-[9px] text-[#ff5252] border border-[#ff5252]/30 rounded hover:bg-[#ff5252]/10 transition-colors"
                                >
                                    Clear All
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={closeStrategyDrawer}
                                className="px-1.5 py-0.5 text-[9px] text-[#5a6a7a] hover:text-[#c0ccd8] transition-colors"
                                title="Collapse"
                            >
                                X
                            </button>
                        </div>
                    </div>

                    <div className={`px-3 py-2 border-b border-[#1e2a3a] shrink-0 ${highlightPresets ? "onboarding-halo-inset" : ""}`}>
                        <div className={`text-[8px] uppercase tracking-wider mb-1.5 ${highlightPresets ? "text-[#9dd4ff]" : "text-[#5a6a7a]"}`}>Presets</div>
                        <div className="flex flex-wrap gap-1">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setActivePreset(activePreset === preset ? null : preset)}
                                    className={`px-2 py-0.5 text-[9px] border rounded transition-colors bg-[#0d1520] ${activePreset === preset
                                            ? "text-[#39d5ff] border-[#39d5ff]/50 bg-[#39d5ff]/10"
                                            : highlightPresets
                                                ? "border-[#47b5ff]/55 text-[#b9ddff] hover:text-white hover:border-[#47b5ff]"
                                                : "text-[#8b9bab] border-[#2a3a4a] hover:text-[#39d5ff] hover:border-[#39d5ff]/40"
                                        }`}
                                >
                                    {PRESET_LABELS[preset]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {activePreset && (
                        <PresetConfigurator
                            preset={activePreset}
                            rows={rows}
                            underlying={underlying}
                            spot={spot}
                            expiries={expiries}
                            selectedExpiry={selectedExpiry}
                            onSelectExpiry={onSelectExpiry}
                        />
                    )}

                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {legs.length === 0 && !activePreset ? (
                            <div className="flex flex-col items-center justify-center py-8 text-[10px] text-[#5a6a7a] gap-2">
                                <div>No legs added</div>
                                <div className="text-[9px]">Click + in the chain or select a preset above</div>
                            </div>
                        ) : legs.length === 0 ? null : (
                            <>
                                {legs.map((leg) => (
                                    <StrategyLegRow key={leg.id} leg={leg} />
                                ))}

                                <div className="px-3 py-2 border-b border-[#1e2a3a] flex items-center justify-between">
                                    <span className="text-[10px] text-[#8b9bab] uppercase tracking-wider">Total P&L</span>
                                    <span className={`text-[12px] font-mono font-bold ${totalPnl >= 0 ? "text-[#00e676]" : "text-[#ff5252]"}`}>
                                        {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                    </span>
                                </div>

                                <div className="border-b border-[#1e2a3a]">
                                    <GreeksPanel legs={legs} spot={spot} scenario={scenario} />
                                </div>

                                <div className="border-b border-[#1e2a3a] py-2">
                                    <div className="px-3 mb-1 text-[8px] text-[#5a6a7a] uppercase tracking-wider">
                                        Payoff at Expiry
                                    </div>
                                    <PayoffChart legs={legs} spot={spot} scenario={scenario} themeMode={themeMode} />
                                </div>

                                <div className="border-b border-[#1e2a3a]">
                                    <ScenarioControls />
                                </div>

                                <div className="px-3 py-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-[#5a6a7a] uppercase tracking-wider">
                                            Est. Margin
                                        </span>
                                        <span className={`text-[11px] font-mono ${themeMode === "light" ? "text-[#d97706]" : "text-[#ffd740]"}`}>
                                            ${margin.estimatedMarginUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                    <div className="text-[8px] text-[#3a4a5a] mt-0.5 italic">
                                        {margin.disclaimer}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}

            {drawerOpen && panelMode === "arb" && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <ArbPanel
                        underlying={underlying}
                        expiry={selectedExpiry}
                        venues={venues}
                        themeMode={themeMode}
                        onOpenStrategy={handleOpenStrategy}
                        onClose={onCloseArb}
                        onNavigateToContract={onNavigateArbContract}
                        onTrackedContractsChange={onTrackedArbContractsChange}
                        onContextChange={onArbContextChange}
                    />
                </div>
            )}
        </div>
    );
}
