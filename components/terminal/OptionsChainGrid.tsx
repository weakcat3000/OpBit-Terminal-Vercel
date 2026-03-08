"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { CompareRow } from "@/src/services/optionsService";
import { Venue } from "@/src/core/types/venues";
import { formatIv, formatPct, formatPrice, getPriceDisplayDecimals } from "@/src/core/utils/numbers";
import { ExpiryTabs } from "./ExpiryTabs";
import { VENUE_META } from "./VenueToggles";
import { useQuotesForContract } from "@/src/streaming/streamSelectors";
import { useMarketStreamStore } from "@/src/streaming/useMarketStreamStore";
import { ExecutionSide, StreamQuote } from "@/src/streaming/types";
import { computeExecutableBest } from "@/src/router/executableBest";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useStrategyBuilderStore } from "@/src/strategy/StrategyBuilderStore";
import { rowToLeg } from "@/src/strategy/StrategyPresets";

interface OptionsChainGridProps {
    rows: CompareRow[];
    venues: Venue[];
    selectedKey: string | null;
    selectedSide: "C" | "P" | null;
    onSelect: (contractKey: string, side: "C" | "P") => void;
    underlying: string;
    viewMode: "COMPARE" | "BEST";
    bestScopeLabel?: string | null;
    executionSide: ExecutionSide;
    onExecutionSideChange: (side: ExecutionSide) => void;
    expiries: string[];
    selectedExpiry: string | null;
    onSelectExpiry: (e: string) => void;
    spotPrice?: number | null;
    themeMode: "dark" | "light";
    highlightAtmStrikeRow?: boolean;
    highlightStrike?: number | null;
    ibitMarketClosed?: boolean;
}

interface DisplayVenueData {
    venue: Venue | null;
    bid: number | null;
    ask: number | null;
    mid: number | null;
    iv: number | null;
    vsBenchmarkPct: number | null;
    bidSize: number | null;
    askSize: number | null;
}

function finiteOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
}

function mergeSnapshotAndStream(snapshot: CompareRow["venues"][Venue] | undefined, stream: StreamQuote | undefined) {
    const bid = finiteOrNull(stream?.bid) ?? finiteOrNull(snapshot?.bid);
    const ask = finiteOrNull(stream?.ask) ?? finiteOrNull(snapshot?.ask);
    const mid = finiteOrNull(stream?.mid) ?? finiteOrNull(snapshot?.mid) ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
    const iv = finiteOrNull(stream?.iv) ?? finiteOrNull(snapshot?.markIv);
    return {
        bid,
        ask,
        mid,
        iv,
        bidSize: finiteOrNull(stream?.bidSize) ?? finiteOrNull(snapshot?.bidSize),
        askSize: finiteOrNull(stream?.askSize) ?? finiteOrNull(snapshot?.askSize),
        vsBenchmarkPct: snapshot?.vsBenchmarkPct ?? null,
    };
}

function depthRatio(size: number | null, maxSize: number | null): number | null {
    if (size == null || maxSize == null || maxSize <= 0) return null;
    return Math.max(0, Math.min(1, size / maxSize));
}

function maxSideSize(
    row: CompareRow | undefined,
    streamByVenue: Partial<Record<Venue, StreamQuote | undefined>>,
    venues: Venue[],
    side: "bid" | "ask"
): number | null {
    if (!row) return null;
    let max: number | null = null;
    for (const venue of venues) {
        const snapshot = row.venues[venue];
        const stream = streamByVenue[venue];
        const size = side === "bid"
            ? finiteOrNull(stream?.bidSize) ?? finiteOrNull(snapshot?.bidSize)
            : finiteOrNull(stream?.askSize) ?? finiteOrNull(snapshot?.askSize);
        if (size == null) continue;
        max = max == null ? size : Math.max(max, size);
    }
    return max;
}

function formatCellValue(
    value: number | null | undefined,
    formatter: (v: number | null | undefined, u?: string) => string
): string {
    return formatter(value);
}

function ExecutionToggle({
    executionSide,
    onExecutionSideChange,
}: {
    executionSide: ExecutionSide;
    onExecutionSideChange: (side: ExecutionSide) => void;
}) {
    return (
        <div className="inline-flex items-center border border-[#2a3a4a] rounded-sm overflow-hidden">
            <button
                onClick={() => onExecutionSideChange("BUY")}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${executionSide === "BUY"
                        ? "bg-[#0f2a1d] text-[#65eab4]"
                        : "bg-[#0c1320] text-[#6f8092]"
                    }`}
            >
                Buy
            </button>
            <button
                onClick={() => onExecutionSideChange("SELL")}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${executionSide === "SELL"
                        ? "bg-[#2a1518] text-[#ff8b97]"
                        : "bg-[#0c1320] text-[#6f8092]"
                    }`}
            >
                Sell
            </button>
        </div>
    );
}

function formatCompactSize(size: number | null): string {
    if (size == null || !Number.isFinite(size)) return "-";
    if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)}m`;
    if (size >= 1_000) return `${(size / 1_000).toFixed(1)}k`;
    return size.toFixed(0);
}

function positiveOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value) || value <= 0) return null;
    return value;
}

function percentile90(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor((sorted.length - 1) * 0.9);
    return sorted[index] ?? sorted[sorted.length - 1] ?? null;
}

function DepthMeter({
    ratio,
    size,
    label,
}: {
    ratio: number | null;
    size: number | null;
    label: "ASK" | "BID";
}) {
    const base = ratio ?? 0;
    const normalized = Math.pow(Math.max(0, Math.min(1, base)), 1.35);
    const heightClasses = ["h-[4px]", "h-[6px]", "h-[8px]", "h-[10px]", "h-[12px]"];
    const thresholds = [0.08, 0.2, 0.38, 0.62, 0.9];

    return (
        <div className="flex items-center gap-1">
            <div className="flex items-end gap-[1px]">
                {heightClasses.map((heightClass, i) => {
                    const threshold = thresholds[i] ?? 1;
                    const filled = normalized >= threshold;
                    return (
                        <span
                            key={i}
                            className={`depth-meter-bar w-[3px] ${heightClass} rounded-[1px] ${filled ? "depth-meter-bar-filled bg-[#65eab4]" : "depth-meter-bar-empty bg-[#2a3a4a]"}`}
                        />
                    );
                })}
            </div>
            <span className="text-[8px] font-mono text-[#5f7ea3]">{label}</span>
            <span className="text-[8px] font-mono text-[#8ac1ff]">{formatCompactSize(size)}</span>
        </div>
    );
}

function DepthValueCell({
    value,
    formatter,
    selected,
    highlight,
    depth,
    decimals,
    animate = true,
    className = "",
}: {
    value: number | null | undefined;
    formatter: (v: number | null | undefined, u?: string) => string;
    selected: boolean;
    highlight?: boolean;
    depth?: number | null;
    decimals?: number;
    animate?: boolean;
    className?: string;
}) {
    const numeric = finiteOrNull(value);
    const isPositive = numeric != null && numeric > 0;
    const isNegative = numeric != null && numeric < 0;
    const textClass = highlight && isPositive
        ? "text-emerald-400"
        : highlight && isNegative
            ? "text-red-400"
            : "text-[#c0ccd8]";

    return (
        <div className={`relative px-1.5 py-0.5 text-right cursor-pointer ${selected ? "bg-[#1a2a4a]" : ""} ${className}`}>
            {depth != null && (
                <div
                    className="absolute left-0 top-0 bottom-0 bg-transparent pointer-events-none"
                    style={{ width: `${Math.round(depth * 100)}%` }}
                />
            )}
            <span className={`relative font-mono text-[11px] ${textClass}`}>
                {numeric != null && animate ? (
                    <AnimatedNumber
                        value={numeric}
                        decimals={decimals ?? 2}
                        durationMs={420}
                        flashDurationMs={540}
                        className={textClass}
                    />
                ) : (
                    formatCellValue(value, formatter)
                )}
            </span>
        </div>
    );
}

const ChainStrikeRow = memo(function ChainStrikeRow({
    strike,
    call,
    put,
    venues,
    primaryVenue,
    viewMode,
    selectedKey,
    selectedSide,
    onSelect,
    underlying,
    executionSide,
    callBidScaleMax,
    callAskScaleMax,
    putBidScaleMax,
    putAskScaleMax,
    themeMode,
    highlightAtmStrike,
    highlightStrike,
}: {
    strike: number;
    call: CompareRow | undefined;
    put: CompareRow | undefined;
    venues: Venue[];
    primaryVenue: Venue;
    viewMode: "COMPARE" | "BEST";
    selectedKey: string | null;
    selectedSide: "C" | "P" | null;
    onSelect: (contractKey: string, side: "C" | "P") => void;
    underlying: string;
    executionSide: ExecutionSide;
    callBidScaleMax: number | null;
    callAskScaleMax: number | null;
    putBidScaleMax: number | null;
    putAskScaleMax: number | null;
    themeMode: "dark" | "light";
    highlightAtmStrike: boolean;
    highlightStrike: boolean;
}) {
    const addLeg = useStrategyBuilderStore((s) => s.addLeg);
    const callKey = call?.contractKey ?? "__none_call__";
    const putKey = put?.contractKey ?? "__none_put__";

    const callStreamByVenue = useQuotesForContract(venues, callKey);
    const putStreamByVenue = useQuotesForContract(venues, putKey);
    const routerFilters = useMarketStreamStore((state) => state.routerFilters);

    const callBest = useMemo(() => {
        if (!call) return null;
        return computeExecutableBest(call, {
            executionSide,
            activeVenues: venues,
            streamByVenue: callStreamByVenue,
            venueHealth: {},
            filters: routerFilters,
            benchmark: "DERIBIT",
        });
    }, [call, executionSide, venues, callStreamByVenue, routerFilters]);

    const putBest = useMemo(() => {
        if (!put) return null;
        return computeExecutableBest(put, {
            executionSide,
            activeVenues: venues,
            streamByVenue: putStreamByVenue,
            venueHealth: {},
            filters: routerFilters,
            benchmark: "DERIBIT",
        });
    }, [put, executionSide, venues, putStreamByVenue, routerFilters]);

    const [callPulse, setCallPulse] = useState(false);
    const [putPulse, setPutPulse] = useState(false);
    const callPrevVenueRef = useRef<Venue | null>(null);
    const putPrevVenueRef = useRef<Venue | null>(null);

    useEffect(() => {
        const nextVenue = callBest?.venue ?? null;
        if (callPrevVenueRef.current && nextVenue && callPrevVenueRef.current !== nextVenue) {
            callPrevVenueRef.current = nextVenue;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCallPulse(true);
            const timer = setTimeout(() => setCallPulse(false), 300);
            return () => clearTimeout(timer);
        }
        callPrevVenueRef.current = nextVenue;
    }, [callBest?.venue]);

    useEffect(() => {
        const nextVenue = putBest?.venue ?? null;
        if (putPrevVenueRef.current && nextVenue && putPrevVenueRef.current !== nextVenue) {
            putPrevVenueRef.current = nextVenue;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPutPulse(true);
            const timer = setTimeout(() => setPutPulse(false), 300);
            return () => clearTimeout(timer);
        }
        putPrevVenueRef.current = nextVenue;
    }, [putBest?.venue]);

    const callDisplay: DisplayVenueData = useMemo(() => {
        if (!call) {
            return {
                venue: null,
                bid: null,
                ask: null,
                mid: null,
                iv: null,
                vsBenchmarkPct: null,
                bidSize: null,
                askSize: null,
            };
        }

        const selectedVenue =
            viewMode === "BEST" && callBest?.venue
                ? callBest.venue
                : primaryVenue;

        const merged = mergeSnapshotAndStream(call.venues[selectedVenue], callStreamByVenue[selectedVenue]);
        return {
            venue: selectedVenue,
            bid: merged.bid,
            ask: merged.ask,
            mid: merged.mid,
            iv: merged.iv,
            vsBenchmarkPct: call.venues[selectedVenue]?.vsBenchmarkPct ?? null,
            bidSize: merged.bidSize,
            askSize: merged.askSize,
        };
    }, [call, callBest, callStreamByVenue, primaryVenue, viewMode]);

    const putDisplay: DisplayVenueData = useMemo(() => {
        if (!put) {
            return {
                venue: null,
                bid: null,
                ask: null,
                mid: null,
                iv: null,
                vsBenchmarkPct: null,
                bidSize: null,
                askSize: null,
            };
        }

        const selectedVenue =
            viewMode === "BEST" && putBest?.venue
                ? putBest.venue
                : primaryVenue;

        const merged = mergeSnapshotAndStream(put.venues[selectedVenue], putStreamByVenue[selectedVenue]);
        return {
            venue: selectedVenue,
            bid: merged.bid,
            ask: merged.ask,
            mid: merged.mid,
            iv: merged.iv,
            vsBenchmarkPct: put.venues[selectedVenue]?.vsBenchmarkPct ?? null,
            bidSize: merged.bidSize,
            askSize: merged.askSize,
        };
    }, [put, putBest, putStreamByVenue, primaryVenue, viewMode]);

    const callVsBenchmarkPct = useMemo(() => {
        const selectedVenue = callDisplay.venue;
        if (!call || !selectedVenue || selectedVenue === "DERIBIT") return null;
        const fallback = call.venues[selectedVenue]?.vsBenchmarkPct ?? null;
        if (viewMode !== "BEST") return fallback;

        const selected = callBest?.venue ? callBest.candidateByVenue[callBest.venue] : null;
        const benchmark = callBest?.candidateByVenue.DERIBIT ?? null;
        if (!selected || !benchmark || benchmark.price <= 0) return null;
        // Side-adjusted edge: positive means better than Deribit for current execution side.
        return executionSide === "SELL"
            ? (selected.price - benchmark.price) / benchmark.price
            : (benchmark.price - selected.price) / benchmark.price;
    }, [call, callDisplay.venue, callBest, executionSide, viewMode]);

    const putVsBenchmarkPct = useMemo(() => {
        const selectedVenue = putDisplay.venue;
        if (!put || !selectedVenue || selectedVenue === "DERIBIT") return null;
        const fallback = put.venues[selectedVenue]?.vsBenchmarkPct ?? null;
        if (viewMode !== "BEST") return fallback;

        const selected = putBest?.venue ? putBest.candidateByVenue[putBest.venue] : null;
        const benchmark = putBest?.candidateByVenue.DERIBIT ?? null;
        if (!selected || !benchmark || benchmark.price <= 0) return null;
        // Side-adjusted edge: positive means better than Deribit for current execution side.
        return executionSide === "SELL"
            ? (selected.price - benchmark.price) / benchmark.price
            : (benchmark.price - selected.price) / benchmark.price;
    }, [put, putDisplay.venue, putBest, executionSide, viewMode]);

    const callBidMax = maxSideSize(call, callStreamByVenue, venues, "bid");
    const callAskMax = maxSideSize(call, callStreamByVenue, venues, "ask");
    const putBidMax = maxSideSize(put, putStreamByVenue, venues, "bid");
    const putAskMax = maxSideSize(put, putStreamByVenue, venues, "ask");
    const forceIbitMaxDepth = underlying.toUpperCase().includes("IBIT");
    const bestDepthLabel = executionSide === "SELL" ? "BID" : "ASK";
    const callBestDepth = forceIbitMaxDepth
        ? 1
        : executionSide === "SELL"
            ? depthRatio(callDisplay.bidSize, callBidScaleMax ?? callBidMax)
            : depthRatio(callDisplay.askSize, callAskScaleMax ?? callAskMax);
    const putBestDepth = forceIbitMaxDepth
        ? 1
        : executionSide === "SELL"
            ? depthRatio(putDisplay.bidSize, putBidScaleMax ?? putBidMax)
            : depthRatio(putDisplay.askSize, putAskScaleMax ?? putAskMax);
    const callBestSize = executionSide === "SELL" ? callDisplay.bidSize : callDisplay.askSize;
    const putBestSize = executionSide === "SELL" ? putDisplay.bidSize : putDisplay.askSize;

    const isCallSelected = call?.contractKey === selectedKey && selectedSide === "C";
    const isPutSelected = put?.contractKey === selectedKey && selectedSide === "P";
    const highlightSelection = call
        ? { contractKey: call.contractKey, side: "C" as const }
        : put
            ? { contractKey: put.contractKey, side: "P" as const }
            : null;
    const arbStrikeHighlightClass = highlightStrike
        ? "bg-[#133765]/45 shadow-[inset_0_0_0_1px_rgba(71,181,255,0.65),0_0_16px_rgba(71,181,255,0.35)]"
        : "";

    return (
        <tr
            className={`border-b border-[#0d1520] hover:bg-[#0d1520] ${highlightAtmStrike ? "onboarding-atm-strike-row cursor-pointer" : ""} ${arbStrikeHighlightClass}`}
            data-strike={strike}
            data-call-key={call?.contractKey ?? ""}
            data-put-key={put?.contractKey ?? ""}
            onClick={() => {
                if (highlightAtmStrike && highlightSelection) {
                    onSelect(highlightSelection.contractKey, highlightSelection.side);
                }
            }}
        >
            {viewMode === "BEST" && (
                <td
                    className={`px-1 py-0.5 text-center cursor-pointer ${isCallSelected ? "bg-[#1a2a4a]" : ""} ${callPulse ? "bg-[#00e676]/12" : ""}`}
                    onClick={() => call && onSelect(call.contractKey, "C")}
                >
                    {callDisplay.venue && (
                        <div
                            className="flex items-center justify-center gap-1"
                            title={`Best venue ${callDisplay.venue}. ${bestDepthLabel} depth ${Math.round((callBestDepth ?? 0) * 100)}% at this strike.`}
                        >
                            <div className="no-theme-invert w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden" title={callDisplay.venue}>
                                {VENUE_META[callDisplay.venue].logo}
                            </div>
                            <DepthMeter ratio={callBestDepth} size={callBestSize} label={bestDepthLabel} />
                        </div>
                    )}
                </td>
            )}

            <td onClick={() => call && onSelect(call.contractKey, "C")}>
                <DepthValueCell
                    value={callDisplay.bid}
                    formatter={(v) => formatPrice(v, underlying)}
                    selected={isCallSelected}
                    depth={forceIbitMaxDepth ? 1 : depthRatio(callDisplay.bidSize, callBidMax)}
                    decimals={getPriceDisplayDecimals(underlying, callDisplay.bid)}
                />
            </td>
            <td onClick={() => call && onSelect(call.contractKey, "C")}>
                <DepthValueCell
                    value={callDisplay.ask}
                    formatter={(v) => formatPrice(v, underlying)}
                    selected={isCallSelected}
                    depth={forceIbitMaxDepth ? 1 : depthRatio(callDisplay.askSize, callAskMax)}
                    decimals={getPriceDisplayDecimals(underlying, callDisplay.ask)}
                />
            </td>
            <td onClick={() => call && onSelect(call.contractKey, "C")}>
                <DepthValueCell
                    value={callDisplay.mid}
                    formatter={(v) => formatPrice(v, underlying)}
                    selected={isCallSelected}
                    decimals={getPriceDisplayDecimals(underlying, callDisplay.mid)}
                />
            </td>
            <td onClick={() => call && onSelect(call.contractKey, "C")}>
                <DepthValueCell
                    value={callDisplay.iv}
                    formatter={(v) => formatIv(v, 2)}
                    selected={isCallSelected}
                    decimals={2}
                    animate={false}
                />
            </td>
            <td onClick={() => call && onSelect(call.contractKey, "C")}>
                <DepthValueCell
                    value={callVsBenchmarkPct}
                    formatter={formatPct}
                    selected={isCallSelected}
                    highlight
                    decimals={2}
                    animate={false}
                />
            </td>

            {/* Add to strategy: Call */}
            <td className="px-0.5 py-0.5 text-center">
                {call && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            addLeg(rowToLeg(call, "BUY", underlying));
                        }}
                        className="w-4 h-4 text-[10px] text-[#3a4f67] hover:text-[#00e676] hover:bg-[#00e676]/10 rounded transition-colors leading-none"
                        title="Add call to strategy"
                    >
                        +
                    </button>
                )}
            </td>

            <td
                className={`strike-col-cell px-2 py-0.5 text-center font-mono font-bold text-[12px] bg-[#0a1018] sticky left-0 z-20 border-x border-[#1e2a3a] ${
                    themeMode === "light" ? "!text-black opacity-100" : "text-[#e0e8f0]"
                }`}
            >
                <div className="inline-flex items-center justify-center gap-1">
                    <span>{strike.toLocaleString()}</span>
                    {highlightAtmStrike && (
                        <span className="rounded-sm border border-[#47b5ff]/70 bg-[#0b2342]/90 px-1 py-[1px] text-[8px] leading-none text-[#8fd0ff]">
                            ATM
                        </span>
                    )}
                </div>
            </td>

            {/* Add to strategy: Put */}
            <td className="px-0.5 py-0.5 text-center">
                {put && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            addLeg(rowToLeg(put, "BUY", underlying));
                        }}
                        className="w-4 h-4 text-[10px] text-[#3a4f67] hover:text-[#00e676] hover:bg-[#00e676]/10 rounded transition-colors leading-none"
                        title="Add put to strategy"
                    >
                        +
                    </button>
                )}
            </td>

            {viewMode === "BEST" && (
                <td
                    className={`px-1 py-0.5 text-center cursor-pointer ${isPutSelected ? "bg-[#1a2a4a]" : ""} ${putPulse ? "bg-[#00e676]/12" : ""}`}
                    onClick={() => put && onSelect(put.contractKey, "P")}
                >
                    {putDisplay.venue && (
                        <div
                            className="flex items-center justify-center gap-1"
                            title={`Best venue ${putDisplay.venue}. ${bestDepthLabel} depth ${Math.round((putBestDepth ?? 0) * 100)}% at this strike.`}
                        >
                            <div className="no-theme-invert w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden" title={putDisplay.venue}>
                                {VENUE_META[putDisplay.venue].logo}
                            </div>
                            <DepthMeter ratio={putBestDepth} size={putBestSize} label={bestDepthLabel} />
                        </div>
                    )}
                </td>
            )}

            <td onClick={() => put && onSelect(put.contractKey, "P")}>
                <DepthValueCell
                    value={putDisplay.bid}
                    formatter={(v) => formatPrice(v, underlying)}
                    selected={isPutSelected}
                    depth={forceIbitMaxDepth ? 1 : depthRatio(putDisplay.bidSize, putBidMax)}
                    decimals={getPriceDisplayDecimals(underlying, putDisplay.bid)}
                />
            </td>
            <td onClick={() => put && onSelect(put.contractKey, "P")}>
                <DepthValueCell
                    value={putDisplay.ask}
                    formatter={(v) => formatPrice(v, underlying)}
                    selected={isPutSelected}
                    depth={forceIbitMaxDepth ? 1 : depthRatio(putDisplay.askSize, putAskMax)}
                    decimals={getPriceDisplayDecimals(underlying, putDisplay.ask)}
                />
            </td>
            <td onClick={() => put && onSelect(put.contractKey, "P")}>
                <DepthValueCell
                    value={putDisplay.mid}
                    formatter={(v) => formatPrice(v, underlying)}
                    selected={isPutSelected}
                    decimals={getPriceDisplayDecimals(underlying, putDisplay.mid)}
                />
            </td>
            <td onClick={() => put && onSelect(put.contractKey, "P")}>
                <DepthValueCell
                    value={putDisplay.iv}
                    formatter={(v) => formatIv(v, 2)}
                    selected={isPutSelected}
                    decimals={2}
                    animate={false}
                />
            </td>
            <td onClick={() => put && onSelect(put.contractKey, "P")}>
                <DepthValueCell
                    value={putVsBenchmarkPct}
                    formatter={formatPct}
                    selected={isPutSelected}
                    highlight
                    decimals={2}
                    animate={false}
                />
            </td>
        </tr>
    );
});

export function OptionsChainGrid({
    rows,
    venues,
    selectedKey,
    selectedSide,
    onSelect,
    underlying,
    viewMode,
    bestScopeLabel,
    executionSide,
    onExecutionSideChange,
    expiries,
    selectedExpiry,
    onSelectExpiry,
    spotPrice,
    themeMode,
    highlightAtmStrikeRow = false,
    highlightStrike = null,
    ibitMarketClosed = false,
}: OptionsChainGridProps) {
    const calls = rows.filter((r) => r.right === "C");
    const puts = rows.filter((r) => r.right === "P");
    void bestScopeLabel;
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const lastCenteredMarkerKeyRef = useRef<string | null>(null);

    const strikes = Array.from(new Set(rows.map((r) => r.strike))).sort((a, b) => a - b);
    const atmStrike = useMemo(() => {
        if (strikes.length === 0) return null;
        if (spotPrice == null || !Number.isFinite(spotPrice)) {
            const mid = strikes[Math.floor(strikes.length / 2)];
            return mid ?? null;
        }
        return strikes.reduce((best, strike) => {
            if (best == null) return strike;
            return Math.abs(strike - spotPrice) < Math.abs(best - spotPrice) ? strike : best;
        }, null as number | null);
    }, [strikes, spotPrice]);
    const callMap = new Map(calls.map((c) => [c.strike, c]));
    const putMap = new Map(puts.map((p) => [p.strike, p]));
    const primaryVenue = venues[0] || "DERIBIT";
    const callBidScaleMax = useMemo(() => {
        const values: number[] = [];
        for (const row of rows) {
            if (row.right !== "C") continue;
            for (const venue of venues) {
                const size = positiveOrNull(row.venues[venue]?.bidSize ?? null);
                if (size != null) values.push(size);
            }
        }
        return percentile90(values);
    }, [rows, venues]);
    const callAskScaleMax = useMemo(() => {
        const values: number[] = [];
        for (const row of rows) {
            if (row.right !== "C") continue;
            for (const venue of venues) {
                const size = positiveOrNull(row.venues[venue]?.askSize ?? null);
                if (size != null) values.push(size);
            }
        }
        return percentile90(values);
    }, [rows, venues]);
    const putBidScaleMax = useMemo(() => {
        const values: number[] = [];
        for (const row of rows) {
            if (row.right !== "P") continue;
            for (const venue of venues) {
                const size = positiveOrNull(row.venues[venue]?.bidSize ?? null);
                if (size != null) values.push(size);
            }
        }
        return percentile90(values);
    }, [rows, venues]);
    const putAskScaleMax = useMemo(() => {
        const values: number[] = [];
        for (const row of rows) {
            if (row.right !== "P") continue;
            for (const venue of venues) {
                const size = positiveOrNull(row.venues[venue]?.askSize ?? null);
                if (size != null) values.push(size);
            }
        }
        return percentile90(values);
    }, [rows, venues]);
    const spotMarkerBeforeIndex = useMemo(() => {
        if (spotPrice == null || !Number.isFinite(spotPrice) || strikes.length === 0) return null;
        if (spotPrice <= strikes[0]) return 0;

        const lastIndex = strikes.length - 1;
        if (spotPrice >= strikes[lastIndex]) return strikes.length;

        for (let i = 0; i < lastIndex; i += 1) {
            const lower = strikes[i];
            const upper = strikes[i + 1];
            if (spotPrice >= lower && spotPrice < upper) {
                return i + 1;
            }
        }

        return strikes.length;
    }, [spotPrice, strikes]);
    const spotLabel = useMemo(() => {
        if (spotPrice == null || !Number.isFinite(spotPrice)) return null;
        const upper = underlying.toUpperCase();
        const asset = upper.includes("IBIT") ? "IBIT" : upper.includes("ETH") ? "ETH" : "BTC";
        const maxFractionDigits = asset === "IBIT" ? 2 : 0;
        return `${asset} spot ${spotPrice.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits })}`;
    }, [spotPrice, underlying]);
    const bestPriceHeader = "BEST PRICE";
    const sideColSpan = viewMode === "BEST" ? 7 : 6;
    const spotMarkerKey = useMemo(() => {
        if (spotMarkerBeforeIndex == null) return null;
        return `${underlying}:${selectedExpiry ?? "none"}:${spotMarkerBeforeIndex}`;
    }, [underlying, selectedExpiry, spotMarkerBeforeIndex]);

    useEffect(() => {
        if (!spotMarkerKey) {
            lastCenteredMarkerKeyRef.current = null;
            return;
        }
        if (lastCenteredMarkerKeyRef.current === spotMarkerKey) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const markerRow = container.querySelector<HTMLTableRowElement>('tr[data-spot-marker="true"]');
        if (!markerRow) return;

        const containerRect = container.getBoundingClientRect();
        const markerRect = markerRow.getBoundingClientRect();
        const markerCenterY = markerRect.top - containerRect.top + container.scrollTop + markerRect.height / 2;
        const targetScrollTop = markerCenterY - container.clientHeight / 2;
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));

        container.scrollTo({
            top: clampedScrollTop,
            behavior: lastCenteredMarkerKeyRef.current ? "smooth" : "auto",
        });
        lastCenteredMarkerKeyRef.current = spotMarkerKey;
    }, [spotMarkerKey, strikes.length]);

    useEffect(() => {
        if (!selectedKey) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const rowsInView = Array.from(
            container.querySelectorAll<HTMLTableRowElement>("tbody tr[data-strike]")
        );
        const selectedRow = rowsInView.find(
            (row) => row.dataset.callKey === selectedKey || row.dataset.putKey === selectedKey
        );
        if (!selectedRow) return;
        selectedRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [selectedKey, selectedSide]);

    useEffect(() => {
        if (!highlightAtmStrikeRow || atmStrike == null) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const atmRow = container.querySelector<HTMLTableRowElement>(`tbody tr[data-strike="${atmStrike}"]`);
        if (!atmRow) return;
        atmRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [highlightAtmStrikeRow, atmStrike, underlying, selectedExpiry]);

    if (strikes.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[#4a5a6a] text-sm">
                No options data available. Select an expiry above.
            </div>
        );
    }

    const renderSpotMarker = () => (
        <tr className="pointer-events-none" data-spot-marker="true">
            <td colSpan={sideColSpan} className="p-0">
                <div className="relative h-3">
                    <div
                        className={`absolute left-0 right-0 top-1/2 ${
                            themeMode === "light"
                                ? "border-t-2 border-[#f59e0b]"
                                : "border-t border-[#ffd740]/85"
                        }`}
                    />
                </div>
            </td>
            <td className="p-0 bg-[#0a1018] border-x border-[#1e2a3a]">
                <div className="h-3 flex items-center justify-center">
                    {spotLabel && (
                        <div
                            className={`px-1.5 py-0.5 text-[8px] leading-none font-mono uppercase tracking-wider rounded-sm whitespace-nowrap ${
                                themeMode === "light"
                                    ? "font-bold text-[#d97706] bg-[#fff3df] border border-[#f59e0b]"
                                    : "text-[#ffd740] bg-[#111826] border border-[#ffd740]/40"
                            }`}
                        >
                            {spotLabel}
                        </div>
                    )}
                </div>
            </td>
            <td colSpan={sideColSpan} className="p-0">
                <div className="relative h-3">
                    <div
                        className={`absolute left-0 right-0 top-1/2 ${
                            themeMode === "light"
                                ? "border-t-2 border-[#f59e0b]"
                                : "border-t border-[#ffd740]/85"
                        }`}
                    />
                </div>
            </td>
        </tr>
    );

    return (
        <div className="relative h-full">
            {viewMode === "BEST" && (
                <div className="absolute top-1.5 right-2 z-40">
                    <ExecutionToggle executionSide={executionSide} onExecutionSideChange={onExecutionSideChange} />
                </div>
            )}
            {ibitMarketClosed && (
                <div
                    className={`mx-1 mt-1 rounded-sm border px-2 py-1 text-[10px] font-mono uppercase ${
                        themeMode === "light"
                            ? "border-[#d9c69e] bg-[#fff7e8] text-[#8c5a16]"
                            : "border-[#5b4422] bg-[#1f160a] text-[#e2bb73]"
                    }`}
                >
                    STOCK MARKET CURRENTLY CLOSED
                </div>
            )}
            <div ref={scrollContainerRef} className="chain-scroll overflow-auto h-full">
            <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 z-30 bg-[#070b12]">
                    <tr className="bg-[#070b12]">
                        <th colSpan={viewMode === "BEST" ? 15 : 13} className="p-0 border-none font-normal text-left">
                            <div className="flex items-center justify-start">
                                <ExpiryTabs expiries={expiries} selected={selectedExpiry} onSelect={onSelectExpiry} />
                            </div>
                        </th>
                    </tr>
                    <tr>
                        <th
                            colSpan={viewMode === "BEST" ? 7 : 6}
                            className={`text-center text-[10px] font-bold uppercase tracking-widest border-b border-[#1e2a3a] py-1 ${
                                themeMode === "light"
                                    ? "text-[#00a765] bg-[#bff3dd]"
                                    : "text-emerald-500 bg-emerald-950/20"
                            }`}
                        >
                            CALLS
                        </th>
                        <th
                            className={`strike-col-head text-center text-[10px] font-bold uppercase tracking-widest border-b border-[#1e2a3a] py-1 bg-[#0a1018] ${
                                themeMode === "light" ? "!text-black opacity-100" : "text-[#8899aa]"
                            }`}
                        >
                            STRIKE
                        </th>
                        <th
                            colSpan={viewMode === "BEST" ? 7 : 6}
                            className="text-center text-[10px] font-bold uppercase tracking-widest text-red-500 border-b border-[#1e2a3a] py-1 bg-red-950/20"
                        >
                            PUTS
                        </th>
                    </tr>
                    <tr>
                        {viewMode === "BEST" && (
                            <th
                                className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#5a7a9a] border-b border-[#1e2a3a] text-center whitespace-nowrap"
                                title={`Best venue with ${executionSide === "SELL" ? "BID" : "ASK"} liquidity depth bars at this strike.`}
                            >
                                {bestPriceHeader}
                            </th>
                        )}
                        {["Bid", "Ask", "Mid", "IV %", "VS Deribit %"].map((h) => (
                            <th
                                key={`c-${h}`}
                                className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#5a7a9a] border-b border-[#1e2a3a] text-right whitespace-nowrap"
                            >
                                {h}
                            </th>
                        ))}
                        <th className="px-0.5 py-0.5 text-[8px] text-center text-[#3a4f67] border-b border-[#1e2a3a]" title="Add to strategy">
                            +
                        </th>
                        <th
                            className={`strike-col-head px-2 py-0.5 text-[10px] text-center border-b border-[#1e2a3a] bg-[#0a1018] sticky left-0 z-20 ${
                                themeMode === "light" ? "!text-black opacity-100" : "text-[#8899aa]"
                            }`}
                        >
                            Strike
                        </th>
                        <th className="px-0.5 py-0.5 text-[8px] text-center text-[#3a4f67] border-b border-[#1e2a3a]" title="Add to strategy">
                            +
                        </th>
                        {viewMode === "BEST" && (
                            <th
                                className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#5a7a9a] border-b border-[#1e2a3a] text-center whitespace-nowrap"
                                title={`Best venue with ${executionSide === "SELL" ? "BID" : "ASK"} liquidity depth bars at this strike.`}
                            >
                                {bestPriceHeader}
                            </th>
                        )}
                        {["Bid", "Ask", "Mid", "IV %", "VS Deribit %"].map((h) => (
                            <th
                                key={`p-${h}`}
                                className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#5a7a9a] border-b border-[#1e2a3a] text-right whitespace-nowrap"
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {strikes.map((strike, index) => (
                        <React.Fragment key={strike}>
                            {spotMarkerBeforeIndex != null && spotMarkerBeforeIndex === index && renderSpotMarker()}
                            <ChainStrikeRow
                                strike={strike}
                                call={callMap.get(strike)}
                                put={putMap.get(strike)}
                                venues={venues}
                                primaryVenue={primaryVenue}
                                viewMode={viewMode}
                                selectedKey={selectedKey}
                                selectedSide={selectedSide}
                                onSelect={onSelect}
                                underlying={underlying}
                                executionSide={executionSide}
                                callBidScaleMax={callBidScaleMax}
                                callAskScaleMax={callAskScaleMax}
                                putBidScaleMax={putBidScaleMax}
                                putAskScaleMax={putAskScaleMax}
                                themeMode={themeMode}
                                highlightAtmStrike={highlightAtmStrikeRow && atmStrike != null && strike === atmStrike}
                                highlightStrike={highlightStrike != null && strike === highlightStrike}
                            />
                        </React.Fragment>
                    ))}
                    {spotMarkerBeforeIndex != null && spotMarkerBeforeIndex === strikes.length && renderSpotMarker()}
                </tbody>
            </table>
            </div>
        </div>
    );
}
