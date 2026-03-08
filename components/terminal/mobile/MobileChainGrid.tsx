"use client";

import React from "react";
import { CompareRow } from "@/src/services/optionsService";
import { Venue } from "@/src/core/types/venues";
import { getPriceDisplayDecimals, formatPrice } from "@/src/core/utils/numbers";
import { useQuotesForContract } from "@/src/streaming/streamSelectors";
import { ExecutionSide, StreamQuote } from "@/src/streaming/types";
import { VENUE_META } from "../VenueToggles";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useMarketStreamStore } from "@/src/streaming/useMarketStreamStore";
import { computeExecutableBest } from "@/src/router/executableBest";

const MOBILE_VALUE_FLASH_MS = 140;
const MOBILE_NUMBER_FLASH_MS = 180;

interface MobileChainGridProps {
    rows: CompareRow[];
    venues: Venue[];
    underlying: string;
    selectedKey: string | null;
    selectedSide: "C" | "P" | null;
    onSelect: (contractKey: string, side: "C" | "P") => void;
    themeMode: "dark" | "light";
    expiries: string[];
    selectedExpiry: string | null;
    onSelectExpiry: (e: string) => void;
    viewMode: "COMPARE" | "BEST";
    executionSide: ExecutionSide;
    loading?: boolean;
    highlightAtmStrikeRow?: boolean;
}

function finiteOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
}

function mergeSnapshotAndStream(snapshot: CompareRow["venues"][Venue] | undefined, stream: StreamQuote | undefined) {
    const bid = finiteOrNull(stream?.bid) ?? finiteOrNull(snapshot?.bid);
    const ask = finiteOrNull(stream?.ask) ?? finiteOrNull(snapshot?.ask);
    return { bid, ask };
}

function usePriceFlash(value: number | null | undefined): "up" | "down" | null {
    const [flash, setFlash] = React.useState<"up" | "down" | null>(null);
    const prevRef = React.useRef<number | null>(finiteOrNull(value));

    React.useEffect(() => {
        const next = finiteOrNull(value);
        const prev = prevRef.current;

        if (prev != null && next != null && Math.abs(next - prev) > 1e-12) {
            setFlash(next > prev ? "up" : "down");
            const timer = setTimeout(() => setFlash(null), MOBILE_VALUE_FLASH_MS);
            prevRef.current = next;
            return () => clearTimeout(timer);
        }

        prevRef.current = next;
    }, [value]);

    return flash;
}

function MobileExpiryTabs({ expiries, selected, onSelect }: { expiries: string[], selected: string | null, onSelect: (e: string) => void }) {
    if (!expiries || expiries.length === 0) return null;
    return (
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-2 py-2 border-b border-[#1e2a3a] bg-[#060a10] shrink-0">
            {expiries.map(e => (
                <button
                    key={e}
                    onClick={() => onSelect(e)}
                    className={`px-3 py-1.5 text-[12px] font-mono rounded whitespace-nowrap transition-colors border ${selected === e
                        ? "bg-[#102a43] border-[#47b5ff] text-[#47b5ff]"
                        : "bg-[#0d1520] border-[#1e2a3a] text-[#8b9bab]"
                        }`}
                >
                    {e}
                </button>
            ))}
        </div>
    );
}

function MobileRow({
    strike,
    call,
    put,
    venues,
    underlying,
    executionSide,
    selectedKey,
    selectedSide,
    onSelect,
    isAtm,
    highlightAtmStrike,
    viewMode,
    rowRef
}: {
    strike: number;
    call?: CompareRow;
    put?: CompareRow;
    venues: Venue[];
    underlying: string;
    executionSide: ExecutionSide;
    selectedKey: string | null;
    selectedSide: "C" | "P" | null;
    onSelect: (key: string, side: "C" | "P") => void;
    isAtm: boolean;
    highlightAtmStrike: boolean;
    viewMode: "COMPARE" | "BEST";
    rowRef?: React.Ref<HTMLDivElement>;
}) {
    const defaultVenue = venues[0] || "DERIBIT";

    const callKey = call?.contractKey ?? "__none_call__";
    const putKey = put?.contractKey ?? "__none_put__";

    const callStreamByVenue = useQuotesForContract(venues, callKey);
    const putStreamByVenue = useQuotesForContract(venues, putKey);
    const routerFilters = useMarketStreamStore((state) => state.routerFilters);

    const callBest = React.useMemo(() => {
        if (!call || viewMode !== "BEST") return null;
        return computeExecutableBest(call, {
            executionSide,
            activeVenues: venues,
            streamByVenue: callStreamByVenue,
            venueHealth: {},
            filters: routerFilters,
            benchmark: "DERIBIT",
        });
    }, [call, executionSide, venues, callStreamByVenue, routerFilters, viewMode]);

    const putBest = React.useMemo(() => {
        if (!put || viewMode !== "BEST") return null;
        return computeExecutableBest(put, {
            executionSide,
            activeVenues: venues,
            streamByVenue: putStreamByVenue,
            venueHealth: {},
            filters: routerFilters,
            benchmark: "DERIBIT",
        });
    }, [put, executionSide, venues, putStreamByVenue, routerFilters, viewMode]);

    const callPrimaryVenue = viewMode === "BEST" ? (callBest?.venue || call?.bestVenue || defaultVenue) : defaultVenue;
    const putPrimaryVenue = viewMode === "BEST" ? (putBest?.venue || put?.bestVenue || defaultVenue) : defaultVenue;

    const callMerged = call && callPrimaryVenue ? mergeSnapshotAndStream(call.venues[callPrimaryVenue], callStreamByVenue[callPrimaryVenue]) : { bid: null, ask: null };
    const putMerged = put && putPrimaryVenue ? mergeSnapshotAndStream(put.venues[putPrimaryVenue], putStreamByVenue[putPrimaryVenue]) : { bid: null, ask: null };
    const callHasQuote = callMerged.bid != null || callMerged.ask != null;
    const putHasQuote = putMerged.bid != null || putMerged.ask != null;
    const [callPulse, setCallPulse] = React.useState(false);
    const [putPulse, setPutPulse] = React.useState(false);
    const callPrevVenueRef = React.useRef<Venue | null>(null);
    const putPrevVenueRef = React.useRef<Venue | null>(null);

    const isCallSelected = call?.contractKey === selectedKey && selectedSide === "C";
    const isPutSelected = put?.contractKey === selectedKey && selectedSide === "P";
    const isStrikeSelected = isCallSelected || isPutSelected;
    const isGuidedStrike = highlightAtmStrike && isAtm;
    const callBidFlash = usePriceFlash(callMerged.bid);
    const callAskFlash = usePriceFlash(callMerged.ask);
    const putBidFlash = usePriceFlash(putMerged.bid);
    const putAskFlash = usePriceFlash(putMerged.ask);

    const handleStrikeSelect = React.useCallback(() => {
        if (selectedSide === "C" && call) {
            onSelect(call.contractKey, "C");
            return;
        }
        if (selectedSide === "P" && put) {
            onSelect(put.contractKey, "P");
            return;
        }
        if (call) {
            onSelect(call.contractKey, "C");
            return;
        }
        if (put) {
            onSelect(put.contractKey, "P");
        }
    }, [call, put, selectedSide, onSelect]);

    React.useEffect(() => {
        if (viewMode !== "BEST") {
            callPrevVenueRef.current = null;
            return;
        }

        const nextVenue = callHasQuote ? callPrimaryVenue : null;
        if (callPrevVenueRef.current && nextVenue && callPrevVenueRef.current !== nextVenue) {
            callPrevVenueRef.current = nextVenue;
            setCallPulse(true);
            const timer = setTimeout(() => setCallPulse(false), 300);
            return () => clearTimeout(timer);
        }
        callPrevVenueRef.current = nextVenue;
    }, [callPrimaryVenue, callHasQuote, viewMode]);

    React.useEffect(() => {
        if (viewMode !== "BEST") {
            putPrevVenueRef.current = null;
            return;
        }

        const nextVenue = putHasQuote ? putPrimaryVenue : null;
        if (putPrevVenueRef.current && nextVenue && putPrevVenueRef.current !== nextVenue) {
            putPrevVenueRef.current = nextVenue;
            setPutPulse(true);
            const timer = setTimeout(() => setPutPulse(false), 300);
            return () => clearTimeout(timer);
        }
        putPrevVenueRef.current = nextVenue;
    }, [putPrimaryVenue, putHasQuote, viewMode]);

    return (
        <div ref={rowRef} className={`flex items-stretch border-b border-[#0d1520] hover:bg-[#0d1520] min-h-[44px] ${isGuidedStrike ? "relative z-[1] ring-2 ring-[#47b5ff] bg-[#10243a]/80 shadow-[0_0_20px_rgba(71,181,255,0.32)]" : isAtm ? "bg-[#0a1829]/50" : ""}`}>
            {/* CALLS */}
            <div
                className={`flex-1 flex flex-col justify-center px-2 border-r border-[#1e2a3a] cursor-pointer ${isCallSelected ? "bg-[#1a2a4a]" : ""}`}
                onClick={() => call && onSelect(call.contractKey, "C")}
            >
                <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1 w-full">
                    <span className="min-w-0 text-left text-[11px] font-mono text-[#65eab4]">
                        <span
                            className={`inline-flex rounded px-1 transition-colors duration-150 ${
                                callBidFlash === "up"
                                    ? "bg-[#00e676]/26"
                                    : callBidFlash === "down"
                                        ? "bg-[#ff3b3b]/24"
                                        : "bg-transparent"
                            }`}
                        >
                            {callMerged.bid != null ? (
                                <AnimatedNumber
                                    value={callMerged.bid}
                                    decimals={getPriceDisplayDecimals(underlying, callMerged.bid)}
                                    durationMs={420}
                                    flashDurationMs={MOBILE_NUMBER_FLASH_MS}
                                    className="text-[#65eab4]"
                                />
                            ) : (
                                formatPrice(callMerged.bid, underlying)
                            )}
                        </span>
                    </span>
                    <div className={`w-[18px] h-[18px] justify-self-center flex items-center justify-center transition-colors duration-200 ${callPulse ? "bg-[#00e676]/12 rounded-sm" : ""}`}>
                        {viewMode === "BEST" && callPrimaryVenue && callHasQuote && (
                            <div
                                className="w-[15px] h-[15px] flex items-center justify-center [&_svg]:block [&_svg]:w-full [&_svg]:h-full"
                                title={callPrimaryVenue}
                            >
                                {VENUE_META[callPrimaryVenue]?.logo}
                            </div>
                        )}
                    </div>
                    <span className="min-w-0 text-right text-[11px] font-mono text-[#ff8b97]">
                        <span
                            className={`inline-flex rounded px-1 transition-colors duration-150 ${
                                callAskFlash === "up"
                                    ? "bg-[#00e676]/26"
                                    : callAskFlash === "down"
                                        ? "bg-[#ff3b3b]/24"
                                        : "bg-transparent"
                            }`}
                        >
                            {callMerged.ask != null ? (
                                <AnimatedNumber
                                    value={callMerged.ask}
                                    decimals={getPriceDisplayDecimals(underlying, callMerged.ask)}
                                    durationMs={420}
                                    flashDurationMs={MOBILE_NUMBER_FLASH_MS}
                                    className="text-[#ff8b97]"
                                />
                            ) : (
                                formatPrice(callMerged.ask, underlying)
                            )}
                        </span>
                    </span>
                </div>
            </div>

            {/* STRIKE */}
            <div
                className={`w-[80px] shrink-0 flex items-center justify-center font-mono font-bold text-[13px] cursor-pointer ${isGuidedStrike
                ? "border-x border-[#47b5ff] text-[#8fd6ff] bg-[#0f2438]"
                : isStrikeSelected
                    ? "border-x border-[#2f6ea9] text-[#7cc6ff] bg-[#112338]"
                    : isAtm
                        ? "border-r border-[#47b5ff] text-[#47b5ff] bg-[#0c1929]"
                        : "border-r border-[#1e2a3a] text-[#e0e8f0] bg-[#0a1018]"
                }`}
                onClick={handleStrikeSelect}
            >
                {strike.toLocaleString()}
            </div>

            {/* PUTS */}
            <div
                className={`flex-1 flex flex-col justify-center px-2 cursor-pointer ${isPutSelected ? "bg-[#1a2a4a]" : ""}`}
                onClick={() => put && onSelect(put.contractKey, "P")}
            >
                <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1 w-full">
                    <span className="min-w-0 text-left text-[11px] font-mono text-[#65eab4]">
                        <span
                            className={`inline-flex rounded px-1 transition-colors duration-150 ${
                                putBidFlash === "up"
                                    ? "bg-[#00e676]/26"
                                    : putBidFlash === "down"
                                        ? "bg-[#ff3b3b]/24"
                                        : "bg-transparent"
                            }`}
                        >
                            {putMerged.bid != null ? (
                                <AnimatedNumber
                                    value={putMerged.bid}
                                    decimals={getPriceDisplayDecimals(underlying, putMerged.bid)}
                                    durationMs={420}
                                    flashDurationMs={MOBILE_NUMBER_FLASH_MS}
                                    className="text-[#65eab4]"
                                />
                            ) : (
                                formatPrice(putMerged.bid, underlying)
                            )}
                        </span>
                    </span>
                    <div className={`w-[18px] h-[18px] justify-self-center flex items-center justify-center transition-colors duration-200 ${putPulse ? "bg-[#00e676]/12 rounded-sm" : ""}`}>
                        {viewMode === "BEST" && putPrimaryVenue && putHasQuote && (
                            <div
                                className="w-[15px] h-[15px] flex items-center justify-center [&_svg]:block [&_svg]:w-full [&_svg]:h-full"
                                title={putPrimaryVenue}
                            >
                                {VENUE_META[putPrimaryVenue]?.logo}
                            </div>
                        )}
                    </div>
                    <span className="min-w-0 text-right text-[11px] font-mono text-[#ff8b97]">
                        <span
                            className={`inline-flex rounded px-1 transition-colors duration-150 ${
                                putAskFlash === "up"
                                    ? "bg-[#00e676]/26"
                                    : putAskFlash === "down"
                                        ? "bg-[#ff3b3b]/24"
                                        : "bg-transparent"
                            }`}
                        >
                            {putMerged.ask != null ? (
                                <AnimatedNumber
                                    value={putMerged.ask}
                                    decimals={getPriceDisplayDecimals(underlying, putMerged.ask)}
                                    durationMs={420}
                                    flashDurationMs={MOBILE_NUMBER_FLASH_MS}
                                    className="text-[#ff8b97]"
                                />
                            ) : (
                                formatPrice(putMerged.ask, underlying)
                            )}
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
}

export function MobileChainGrid({
    rows,
    venues,
    underlying,
    executionSide,
    selectedKey,
    selectedSide,
    onSelect,
    expiries,
    selectedExpiry,
    onSelectExpiry,
    viewMode,
    loading,
    highlightAtmStrikeRow = false
}: MobileChainGridProps) {
    const calls = rows.filter((r) => r.right === "C");
    const puts = rows.filter((r) => r.right === "P");
    const strikes = Array.from(new Set(rows.map((r) => r.strike))).sort((a, b) => a - b);

    // Estimate ATM strike based on strikes center if no spot available, just keeping it simple for mobile MVP
    const atmStrike = strikes.length > 0 ? strikes[Math.floor(strikes.length / 2)] : null;
    const guidedRowRef = React.useRef<HTMLDivElement | null>(null);
    const didAutoScrollGuidedRef = React.useRef(false);

    const callMap = new Map(calls.map((c) => [c.strike, c]));
    const putMap = new Map(puts.map((p) => [p.strike, p]));

    React.useEffect(() => {
        if (!highlightAtmStrikeRow || loading || strikes.length === 0) {
            didAutoScrollGuidedRef.current = false;
            return;
        }
        if (didAutoScrollGuidedRef.current) return;
        const node = guidedRowRef.current;
        if (!node) return;
        didAutoScrollGuidedRef.current = true;
        requestAnimationFrame(() => {
            node.scrollIntoView({ block: "center", behavior: "smooth" });
        });
    }, [highlightAtmStrikeRow, loading, strikes.length, selectedExpiry]);

    return (
        <div className="flex flex-col h-full w-full bg-[#060a10]">
            <MobileExpiryTabs expiries={expiries} selected={selectedExpiry} onSelect={onSelectExpiry} />

            <div className="flex flex-col bg-[#0d1117] border-b border-[#1e2a3a]">
                <div className="flex text-[11px] font-mono font-bold text-[#e2e8f0] uppercase tracking-wider border-b border-[#1e2a3a]">
                    <div className="flex-1 text-center py-1 border-r border-[#1e2a3a] text-[#00e676]">Calls</div>
                    <div className="w-[80px] shrink-0 border-r border-[#1e2a3a]"></div>
                    <div className="flex-1 text-center py-1 text-[#ff3b3b]">Puts</div>
                </div>
                <div className="flex items-center text-[10px] font-mono text-[#8b9bab] uppercase tracking-wider">
                    <div className="flex-1 grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1 px-2 py-1 border-r border-[#1e2a3a]">
                        <span className="text-left">Bid</span>
                        <span className="text-center text-[8px] text-[#4ea8de]">BEST</span>
                        <span className="text-right">Ask</span>
                    </div>
                    <div className="w-[80px] text-center py-1 border-r border-[#1e2a3a]">Strike</div>
                    <div className="flex-1 grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1 px-2 py-1">
                        <span className="text-left">Bid</span>
                        <span className="text-center text-[8px] text-[#4ea8de]">BEST</span>
                        <span className="text-right">Ask</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-[#1e2a3a] border-t-[#47b5ff] animate-spin"></div>
                        <div className="text-[#5a6a7a] text-[11px] font-mono uppercase tracking-widest animate-pulse">Loading Options Chain...</div>
                    </div>
                ) : strikes.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-[12px] text-[#5a6a7a]">No contracts available</div>
                ) : (
                    strikes.map(strike => (
                        <MobileRow
                            key={strike}
                            strike={strike}
                            call={callMap.get(strike)}
                            put={putMap.get(strike)}
                            venues={venues}
                            underlying={underlying}
                            executionSide={executionSide}
                            selectedKey={selectedKey}
                            selectedSide={selectedSide}
                            onSelect={onSelect}
                            isAtm={strike === atmStrike}
                            highlightAtmStrike={highlightAtmStrikeRow}
                            viewMode={viewMode}
                            rowRef={highlightAtmStrikeRow && strike === atmStrike ? guidedRowRef : undefined}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
