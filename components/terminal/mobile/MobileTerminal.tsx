"use client";
import React from "react";
import { Venue } from "@/src/core/types/venues";
import { CompareRow } from "@/src/services/optionsService";
import { MobileTopBar } from "./MobileTopBar";
import { MobileBottomNav, MobileTab } from "./MobileBottomNav";
import { MobileChainGrid } from "./MobileChainGrid";
import { VolSurfaceWidget } from "@/components/terminal/VolSurfaceWidget";
import { StrategyDrawer } from "@/components/terminal/StrategyDrawer";
import { ExecutionSide } from "@/src/streaming/types";
import { ContractInspector } from "@/components/terminal/ContractInspector";

export interface MobileTerminalProps {
    underlying: string;
    onUnderlyingChange: (u: string) => void;
    venues: Venue[];
    onVenueToggle: (v: Venue) => void;
    viewMode: "COMPARE" | "BEST";
    onViewModeChange: (m: "COMPARE" | "BEST") => void;
    expiries: string[];
    selectedExpiry: string | null;
    onSelectExpiry: (e: string) => void;
    chainRows: CompareRow[];
    chainVenues: Venue[];
    chainLoading: boolean;
    selectedKey: string | null;
    selectedSide: "C" | "P" | null;
    onSelect: (key: string, side: "C" | "P") => void;
    themeMode: "light" | "dark";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fairData: any;
    fairLoading: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panopticRows: any[];
    panopticLoading: boolean;
    executionSide: ExecutionSide;
    liveChartSpots?: { BTC: number | null; ETH: number | null; IBIT?: number | null };
    onAssistantToggle: () => void;
    assistantOpen: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assistantPreset?: any;
    arbOpen: boolean;
    onOpenArb: () => void;
    onCloseArb: () => void;
    mobileWelcomePending: boolean;
    onMobileWelcomeDismissed: () => void;
    onboardingOpen: boolean;
    highlightAtmStrikeRow?: boolean;
    focusTarget: "TOPBAR" | "CHAIN" | "ANALYSIS" | "STRATEGY" | "ASSISTANT" | null;
    onFocusTargetChange: (target: "TOPBAR" | "CHAIN" | "ANALYSIS" | "STRATEGY" | "ASSISTANT" | null) => void;
}

export function MobileTerminal(props: MobileTerminalProps) {
    // Map initial focus target to mobile tab, default to CHAIN
    const initialTab: MobileTab =
        props.focusTarget === "ANALYSIS" ? "CHARTS" :
            props.focusTarget === "STRATEGY" ? "STRATEGY" :
                "CHAIN";

    const [activeTab, setActiveTab] = React.useState<MobileTab>(initialTab);
    const [inspectorOpen, setInspectorOpen] = React.useState(false);
    const [inspectorDragY, setInspectorDragY] = React.useState(0);
    const [showMobileWelcome, setShowMobileWelcome] = React.useState(false);
    const inspectorTouchStartYRef = React.useRef<number | null>(null);
    const topbarFocused = props.onboardingOpen && props.focusTarget === "TOPBAR";
    const chainFocused = props.onboardingOpen && props.focusTarget === "CHAIN";
    const analysisFocused = props.onboardingOpen && props.focusTarget === "ANALYSIS";
    const strategyFocused = props.onboardingOpen && props.focusTarget === "STRATEGY";
    const assistantFocused = props.onboardingOpen && props.focusTarget === "ASSISTANT";
    const shouldShowMobileWelcome = showMobileWelcome;

    const selectedRow = props.chainRows.find(r => r.contractKey === props.selectedKey) || null;

    React.useEffect(() => {
        if (props.selectedKey) {
            setInspectorOpen(true);
        } else {
            setInspectorOpen(false);
        }
    }, [props.selectedKey]);

    React.useEffect(() => {
        if (!inspectorOpen) return;
        if (activeTab !== "CHAIN") {
            setInspectorOpen(false);
            setInspectorDragY(0);
        }
    }, [activeTab, inspectorOpen]);

    React.useEffect(() => {
        if (!inspectorOpen) return;
        if (props.onboardingOpen && props.focusTarget !== "CHAIN") {
            setInspectorOpen(false);
            setInspectorDragY(0);
        }
    }, [props.onboardingOpen, props.focusTarget, inspectorOpen]);

    React.useEffect(() => {
        setShowMobileWelcome(props.mobileWelcomePending);
    }, [props.mobileWelcomePending]);

    // Sync external focusTarget changes to activeTab (e.g. from Ask AI)
    React.useEffect(() => {
        if (props.focusTarget === "ANALYSIS") setActiveTab("CHARTS");
        else if (props.focusTarget === "STRATEGY") setActiveTab("STRATEGY");
        else if (props.focusTarget === "CHAIN") setActiveTab("CHAIN");
    }, [props.focusTarget]);

    const handleChangeTab = (tab: MobileTab) => {
        setActiveTab(tab);
        if (tab === "CHARTS") props.onFocusTargetChange("ANALYSIS");
        else if (tab === "STRATEGY") props.onFocusTargetChange("STRATEGY");
        else if (tab === "CHAIN") props.onFocusTargetChange("CHAIN");
    };

    const handleSelectContract = (key: string, side: "C" | "P") => {
        props.onSelect(key, side);
        setInspectorOpen(true);
    };

    const dismissMobileWelcome = () => {
        setShowMobileWelcome(false);
        try {
            window.sessionStorage.setItem("opbit_mobile_welcome_seen", "1");
        } catch {
            // Ignore storage failures and continue.
        }
        props.onMobileWelcomeDismissed();
    };

    const closeInspector = React.useCallback(() => {
        setInspectorOpen(false);
        setInspectorDragY(0);
        inspectorTouchStartYRef.current = null;
    }, []);

    const handleInspectorTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
        inspectorTouchStartYRef.current = event.touches[0]?.clientY ?? null;
        setInspectorDragY(0);
    }, []);

    const handleInspectorTouchMove = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
        const startY = inspectorTouchStartYRef.current;
        if (startY == null) return;
        const nextY = event.touches[0]?.clientY ?? startY;
        const delta = nextY - startY;
        setInspectorDragY(delta > 0 ? delta : 0);
    }, []);

    const handleInspectorTouchEnd = React.useCallback(() => {
        if (inspectorDragY > 90) {
            closeInspector();
            return;
        }
        setInspectorDragY(0);
        inspectorTouchStartYRef.current = null;
    }, [closeInspector, inspectorDragY]);

    return (
        <div className="flex flex-col h-full w-full bg-[#060a10] text-[#c0ccd8] overflow-hidden">
            <div className={`relative transition-all ${topbarFocused ? "z-[97] ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border" : ""}`}>
                <MobileTopBar
                    underlying={props.underlying}
                    onUnderlyingChange={props.onUnderlyingChange}
                    venues={props.venues}
                    onVenueToggle={props.onVenueToggle}
                    viewMode={props.viewMode}
                    onViewModeChange={props.onViewModeChange}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
                <div className={`relative h-full w-full transition-all ${chainFocused ? "z-[97] ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border" : ""} ${activeTab === "CHAIN" ? "block" : "hidden"}`}>
                    <MobileChainGrid
                        rows={props.chainRows}
                        venues={props.chainVenues}
                        underlying={props.underlying}
                        executionSide={props.executionSide}
                        selectedKey={props.selectedKey}
                        selectedSide={props.selectedSide}
                        onSelect={handleSelectContract}
                        themeMode={props.themeMode}
                        expiries={props.expiries}
                        selectedExpiry={props.selectedExpiry}
                        onSelectExpiry={props.onSelectExpiry}
                        viewMode={props.viewMode}
                        loading={props.chainLoading}
                        highlightAtmStrikeRow={props.highlightAtmStrikeRow}
                    />
                </div>

                <div className={`relative h-full w-full p-2 flex flex-col gap-2 transition-all ${analysisFocused ? "z-[97] ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border" : ""} ${activeTab === "CHARTS" ? "flex" : "hidden"}`}>
                    <VolSurfaceWidget
                        fairData={props.fairData}
                        fairLoading={props.fairLoading}
                        panopticRows={props.panopticRows}
                        panopticLoading={props.panopticLoading}
                        rows={props.chainRows}
                        venues={props.venues}
                        underlying={props.underlying}
                        viewMode="COMPARE"
                        selectedRow={props.chainRows.find((r) => r.contractKey === props.selectedKey) || null}
                        themeMode={props.themeMode}
                    />
                </div>

                <div className={`relative h-full w-full flex justify-end transition-all ${strategyFocused ? "z-[97] ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border" : ""} ${activeTab === "STRATEGY" ? "flex" : "hidden"}`}>
                    <StrategyDrawer
                        rows={props.chainRows}
                        underlying={props.underlying}
                        selectedExpiry={props.selectedExpiry}
                        expiries={props.expiries}
                        onSelectExpiry={props.onSelectExpiry}
                        assistantPreset={props.assistantPreset}
                        themeMode={props.themeMode}
                        venues={props.venues}
                        arbOpen={props.arbOpen}
                        onOpenArb={props.onOpenArb}
                        onCloseArb={props.onCloseArb}
                    />
                </div>
            </div>

            <div className={`relative transition-all ${assistantFocused ? "z-[97]" : ""}`}>
                <MobileBottomNav
                    activeTab={activeTab}
                    onChangeTab={handleChangeTab}
                    onAssistantToggle={props.onAssistantToggle}
                    assistantHighlighted={assistantFocused}
                />
            </div>

            {/* Contract Inspector Bottom Sheet */}
            <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-opacity duration-300 ${inspectorOpen && selectedRow ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                <div
                    className="absolute inset-0 bg-[#000000]/60 backdrop-blur-sm"
                    onClick={closeInspector}
                />
                <div
                    className={`relative bg-[#0d1117] w-full h-[85vh] rounded-t-xl overflow-hidden flex flex-col shadow-2xl transform transition-transform ${inspectorDragY > 0 ? "duration-0" : "duration-300"}`}
                    style={{ transform: inspectorOpen && selectedRow ? `translateY(${inspectorDragY}px)` : "translateY(100%)" }}
                >
                    <div
                        className="w-full flex justify-center pt-3 pb-1 shrink-0 bg-[#0d1117] cursor-pointer touch-pan-y"
                        onClick={closeInspector}
                        onTouchStart={handleInspectorTouchStart}
                        onTouchMove={handleInspectorTouchMove}
                        onTouchEnd={handleInspectorTouchEnd}
                        onTouchCancel={handleInspectorTouchEnd}
                    >
                        <div className="h-1.5 bg-[#2a3547] rounded-full w-12" />
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col bg-[#0d1117]">
                        <ContractInspector
                            row={selectedRow}
                            underlying={props.underlying}
                            viewMode={props.viewMode}
                            executionSide={props.executionSide}
                            liveChartSpots={props.liveChartSpots}
                            themeMode={props.themeMode}
                        />
                    </div>
                </div>
            </div>

            {/* Mobile welcome popout */}
            <div className={`fixed inset-0 z-[120] flex items-center justify-center px-4 transition-opacity duration-200 ${shouldShowMobileWelcome ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} role="dialog" aria-modal="true" aria-label="Mobile experience notice">
                <div
                    className="absolute inset-0 bg-[#000000]/70 backdrop-blur-[2px]"
                    onClick={dismissMobileWelcome}
                />
                <div className="relative w-full max-w-[420px] rounded-lg border border-[#2a4a6a] bg-[#0d1117] px-4 py-4 shadow-[0_0_30px_rgba(71,181,255,0.18)]">
                    <div className="text-[11px] uppercase tracking-widest font-mono text-[#47b5ff]">Mobile Notice</div>
                    <div className="mt-2 text-[16px] font-semibold text-[#e2e8f0]">Looks like you are viewing on mobile.</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#9fb0c2]">
                        OpBit has live options comparison, strategy analytics, and assistant workflows. It is best viewed on desktop for the full experience.
                    </p>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={dismissMobileWelcome}
                            className="rounded-sm border border-[#2f6ea9] bg-[#0d2642] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#b9ddff] transition-colors hover:bg-[#113053] hover:border-[#3f81bf]"
                        >
                            Continue On Mobile
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
