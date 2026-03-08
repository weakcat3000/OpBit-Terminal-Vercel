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

    const selectedRow = props.chainRows.find(r => r.contractKey === props.selectedKey) || null;

    React.useEffect(() => {
        if (props.selectedKey) {
            setInspectorOpen(true);
        } else {
            setInspectorOpen(false);
        }
    }, [props.selectedKey]);

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

    return (
        <div className="flex flex-col h-full w-full bg-[#060a10] text-[#c0ccd8] overflow-hidden">
            <MobileTopBar
                underlying={props.underlying}
                onUnderlyingChange={props.onUnderlyingChange}
                venues={props.venues}
                onVenueToggle={props.onVenueToggle}
                viewMode={props.viewMode}
                onViewModeChange={props.onViewModeChange}
            />

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
                <div className={`h-full w-full ${activeTab === "CHAIN" ? "block" : "hidden"}`}>
                    <MobileChainGrid
                        rows={props.chainRows}
                        venues={props.chainVenues}
                        underlying={props.underlying}
                        executionSide={props.executionSide}
                        selectedKey={props.selectedKey}
                        selectedSide={props.selectedSide}
                        onSelect={props.onSelect}
                        themeMode={props.themeMode}
                        expiries={props.expiries}
                        selectedExpiry={props.selectedExpiry}
                        onSelectExpiry={props.onSelectExpiry}
                        viewMode={props.viewMode}
                        loading={props.chainLoading}
                    />
                </div>

                <div className={`h-full w-full p-2 flex flex-col gap-2 ${activeTab === "CHARTS" ? "flex" : "hidden"}`}>
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

                <div className={`h-full w-full flex justify-end ${activeTab === "STRATEGY" ? "flex" : "hidden"}`}>
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

            <MobileBottomNav
                activeTab={activeTab}
                onChangeTab={handleChangeTab}
                onAssistantToggle={props.onAssistantToggle}
            />

            {/* Contract Inspector Bottom Sheet */}
            <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-opacity duration-300 ${inspectorOpen && selectedRow ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                <div
                    className="absolute inset-0 bg-[#000000]/60 backdrop-blur-sm"
                    onClick={() => {
                        setInspectorOpen(false);
                        if (props.selectedKey && props.selectedSide) {
                            props.onSelect(props.selectedKey, props.selectedSide);
                        }
                    }}
                />
                <div className={`relative bg-[#0d1117] w-full h-[85vh] rounded-t-xl overflow-hidden flex flex-col shadow-2xl transform transition-transform duration-300 ${inspectorOpen && selectedRow ? "translate-y-0" : "translate-y-full"}`}>
                    <div className="w-full flex justify-center pt-3 pb-1 shrink-0 bg-[#0d1117] cursor-pointer" onClick={() => {
                        setInspectorOpen(false);
                        if (props.selectedKey && props.selectedSide) {
                            props.onSelect(props.selectedKey, props.selectedSide);
                        }
                    }}>
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
        </div>
    );
}
