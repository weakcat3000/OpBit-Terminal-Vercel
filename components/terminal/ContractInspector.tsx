"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CompareRow } from "@/src/services/optionsService";
import { Venue, VENUE_LABELS } from "@/src/core/types/venues";
import { formatPrice, formatPct, formatIv, getPriceDisplayDecimals } from "@/src/core/utils/numbers";
import { VENUE_META } from "./VenueToggles";
import { useQuotesForContract } from "@/src/streaming/streamSelectors";
import { useMarketStreamStore } from "@/src/streaming/useMarketStreamStore";
import { ExecutionSide, StreamQuote } from "@/src/streaming/types";
import { computeExecutableBest } from "@/src/router/executableBest";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

interface ContractInspectorProps {
    row: CompareRow | null;
    underlying: string;
    viewMode: "COMPARE" | "BEST";
    executionSide: ExecutionSide;
    liveChartSpots?: { BTC: number | null; ETH: number | null; IBIT?: number | null };
    themeMode: "dark" | "light";
}

interface SpotResponse {
    spots?: Record<string, number | null>;
}

interface MergedVenueData {
    bid: number | null;
    ask: number | null;
    mid: number | null;
    iv: number | null;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
    rho: number | null;
    vsBenchmarkPct: number | null;
    source: "ws" | "poll" | "snapshot";
    ageMs: number | null;
}

function finiteOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
}

function mergeSnapshotAndStream(
    snapshot: CompareRow["venues"][Venue] | undefined,
    stream: StreamQuote | undefined,
    nowMs: number
): MergedVenueData {
    const bid = finiteOrNull(stream?.bid) ?? finiteOrNull(snapshot?.bid);
    const ask = finiteOrNull(stream?.ask) ?? finiteOrNull(snapshot?.ask);
    const mid =
        finiteOrNull(stream?.mid) ??
        finiteOrNull(snapshot?.mid) ??
        (bid != null && ask != null ? (bid + ask) / 2 : null);
    const iv = finiteOrNull(stream?.iv) ?? finiteOrNull(snapshot?.markIv);

    const ageMs = stream?.lastUpdateMs != null
        ? Math.max(0, nowMs - stream.lastUpdateMs)
        : snapshot?.updatedAt != null
            ? Math.max(0, nowMs - snapshot.updatedAt)
            : null;

    return {
        bid,
        ask,
        mid,
        iv,
        delta: finiteOrNull(stream?.delta) ?? finiteOrNull(snapshot?.delta),
        gamma: finiteOrNull(stream?.gamma) ?? finiteOrNull(snapshot?.gamma),
        theta: finiteOrNull(stream?.theta) ?? finiteOrNull(snapshot?.theta),
        vega: finiteOrNull(stream?.vega) ?? finiteOrNull(snapshot?.vega),
        rho: finiteOrNull(snapshot?.rho),
        vsBenchmarkPct: snapshot?.vsBenchmarkPct ?? null,
        source: stream?.source ?? "snapshot",
        ageMs,
    };
}

function formatGreek(
    value: number | null | undefined,
    options?: { signed?: boolean; maxDecimals?: number }
): string {
    if (value == null || !Number.isFinite(value)) return "-";
    const signed = options?.signed ?? false;
    const maxDecimals = options?.maxDecimals ?? 4;
    const abs = Math.abs(value);
    const decimals =
        abs >= 100 ? Math.min(2, maxDecimals) :
        abs >= 1 ? Math.min(3, maxDecimals) :
        abs >= 0.01 ? maxDecimals :
        Math.min(6, maxDecimals + 2);
    const prefix = signed && value > 0 ? "+" : "";
    return `${prefix}${value.toFixed(decimals)}`;
}

function monthToDeribit(monthIndex: number): string {
    return ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][monthIndex] ?? "JAN";
}

function canonicalUnderlyingSymbol(row: CompareRow): string {
    const fromKey = row.contractKey.split("|")[0]?.trim().toUpperCase();
    const fromRow = row.underlying.trim().toUpperCase();
    const raw = fromKey || fromRow;
    if (raw.includes("BTC")) return "BTC";
    if (raw.includes("ETH")) return "ETH";
    if (raw.includes("IBIT")) return "IBIT";
    return raw;
}

function toDeribitInstrument(row: CompareRow): string | null {
    const [yearRaw, monthRaw, dayRaw] = row.expiry.split("-");
    const year = Number.parseInt(yearRaw, 10);
    const monthIndex = Number.parseInt(monthRaw, 10) - 1;
    const day = Number.parseInt(dayRaw, 10);
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;
    const yy = String(year).slice(-2);
    const dateCode = `${day}${monthToDeribit(monthIndex)}${yy}`;
    return `${row.underlying.toUpperCase()}-${dateCode}-${Math.round(row.strike)}-${row.right}`;
}

function buildVenueTradeUrl(row: CompareRow, venue: Venue, side: ExecutionSide): string {
    const underlying = canonicalUnderlyingSymbol(row);
    const rightLabel = row.right === "C" ? "call" : "put";
    const sideLabel = side.toLowerCase();
    const strike = String(Math.round(row.strike));
    const expiry = row.expiry;
    const commonQuery = `asset=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry)}&strike=${encodeURIComponent(strike)}&type=${rightLabel}&side=${sideLabel}`;

    if (venue === "DERIBIT") {
        const instrument = toDeribitInstrument(row);
        const base = `https://www.deribit.com/options/${encodeURIComponent(underlying)}`;
        if (instrument) {
            return `${base}?instrument=${encodeURIComponent(instrument)}&side=${sideLabel}`;
        }
        return `${base}?side=${sideLabel}&type=${rightLabel}`;
    }

    if (venue === "AEVO") {
        // Force Aevo options asset route directly so BTC and ETH resolve correctly.
        const aevoAsset = underlying === "ETH" ? "eth" : "btc";
        return `https://app.aevo.xyz/option/${aevoAsset}`;
    }

    if (venue === "LYRA_V2") {
        // Force the underlying via path segment to avoid defaulting to ETH.
        const deriveAsset = underlying === "ETH" ? "eth" : "btc";
        return `https://www.derive.xyz/options/${deriveAsset}?${commonQuery}`;
    }

    if (venue === "PANOPTIC") {
        return `https://app.panoptic.xyz/?${commonQuery}`;
    }

    if (venue === "IBIT") {
        return `https://www.nasdaq.com/market-activity/etf/ibit/option-chain`;
    }

    return "https://www.deribit.com/options/BTC";
}

export function ContractInspector({
    row,
    underlying,
    viewMode,
    executionSide,
    liveChartSpots,
    themeMode,
}: ContractInspectorProps) {
    const [spotMap, setSpotMap] = useState<Record<"BTC" | "ETH" | "IBIT", number | null>>({
        BTC: null,
        ETH: null,
        IBIT: null,
    });
    const [nowMs, setNowMs] = useState<number>(() => Date.now());

    const routerFilters = useMarketStreamStore((state) => state.routerFilters);

    const rowVenues = useMemo(() => {
        if (!row) return [];
        return Object.keys(row.venues) as Venue[];
    }, [row]);

    const streamByVenue = useQuotesForContract(rowVenues, row?.contractKey ?? "__none__");

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 300);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let mounted = true;

        const fetchSpots = async () => {
            try {
                const res = await fetch("/api/market/spot?symbols=BTC,ETH,IBIT");
                if (!res.ok) return;
                const json: SpotResponse = await res.json();
                if (!mounted || !json.spots) return;

                setSpotMap({
                    BTC: json.spots.BTC ?? null,
                    ETH: json.spots.ETH ?? null,
                    IBIT: json.spots.IBIT ?? null,
                });
            } catch {
                // Keep previous values.
            }
        };

        fetchSpots();
        const interval = setInterval(fetchSpots, 5000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const underlyingFamily = useMemo(() => {
        const value = (row?.underlying ?? underlying).toUpperCase();
        if (value.includes("BTC")) return "BTC" as const;
        if (value.includes("ETH")) return "ETH" as const;
        if (value === "IBIT") return "IBIT" as const;
        return null;
    }, [row?.underlying, underlying]);

    const underlyingIndex = useMemo(() => {
        if (underlyingFamily == null) return null;
        if (underlyingFamily === "BTC") {
            return liveChartSpots?.BTC ?? spotMap.BTC ?? null;
        }
        if (underlyingFamily === "ETH") {
            return liveChartSpots?.ETH ?? spotMap.ETH ?? null;
        }
        return spotMap.IBIT ?? null;
    }, [underlyingFamily, liveChartSpots, spotMap]);

    const mergedByVenue = useMemo(() => {
        if (!row) return {} as Partial<Record<Venue, MergedVenueData>>;
        const out: Partial<Record<Venue, MergedVenueData>> = {};
        for (const venue of rowVenues) {
            out[venue] = mergeSnapshotAndStream(row.venues[venue], streamByVenue[venue], nowMs);
        }
        return out;
    }, [row, rowVenues, streamByVenue, nowMs]);

    const executableBest = useMemo(() => {
        if (!row || rowVenues.length === 0) return null;
        return computeExecutableBest(row, {
            executionSide,
            activeVenues: rowVenues,
            streamByVenue,
            venueHealth: {},
            filters: routerFilters,
            benchmark: "DERIBIT",
            nowMs,
        });
    }, [row, rowVenues, streamByVenue, executionSide, routerFilters, nowMs]);

    const resolveTradeVenue = useCallback((side: ExecutionSide): Venue | null => {
        if (!row || rowVenues.length === 0) return null;

        const perSideBest = computeExecutableBest(row, {
            executionSide: side,
            activeVenues: rowVenues,
            streamByVenue,
            venueHealth: {},
            filters: routerFilters,
            benchmark: "DERIBIT",
            nowMs,
        });

        if (perSideBest.venue) return perSideBest.venue;

        const sortedFallback = rowVenues
            .map((venue) => ({
                venue,
                price: side === "BUY" ? mergedByVenue[venue]?.ask ?? null : mergedByVenue[venue]?.bid ?? null,
            }))
            .filter((item): item is { venue: Venue; price: number } => item.price != null && item.price > 0)
            .sort((a, b) => (side === "BUY" ? a.price - b.price : b.price - a.price));

        return sortedFallback[0]?.venue ?? row.bestVenue ?? rowVenues[0] ?? null;
    }, [row, rowVenues, streamByVenue, routerFilters, nowMs, mergedByVenue]);

    const buyTradeVenue = useMemo(() => resolveTradeVenue("BUY"), [resolveTradeVenue]);
    const sellTradeVenue = useMemo(() => resolveTradeVenue("SELL"), [resolveTradeVenue]);

    const handleTradeClick = useCallback((side: ExecutionSide) => {
        if (!row) return;
        const venue = side === "BUY" ? buyTradeVenue : sellTradeVenue;
        if (!venue || typeof window === "undefined") return;
        const url = buildVenueTradeUrl(row, venue, side);
        window.open(url, "_blank", "noopener,noreferrer");
    }, [row, buyTradeVenue, sellTradeVenue]);

    if (!row) {
        return (
            <aside className="w-full flex-1 min-h-0 bg-[#0d1117] border border-[#1e2a3a] flex items-center justify-center overflow-hidden shrink-0">
                <div className="text-[11px] text-[#4a5a6a] text-center">
                    Select a contract to inspect
                </div>
            </aside>
        );
    }

    const summaryVenues: Venue[] = ["DERIBIT", "AEVO", "LYRA_V2"];
    const orderedVenues = [...rowVenues].sort((a, b) => {
        const ia = summaryVenues.indexOf(a);
        const ib = summaryVenues.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    const quoteSummary = summaryVenues
        .filter((venue) => orderedVenues.includes(venue))
        .map((venue) => ({
            venue,
            bid: mergedByVenue[venue]?.bid ?? null,
            ask: mergedByVenue[venue]?.ask ?? null,
        }));

    const bestSideLabel = executionSide === "SELL" ? "Bid" : "Ask";
    const executableBestVenue = executableBest?.venue ?? null;
    const executableBestPrice = executableBest?.executablePrice ?? null;
    const executableBestSide = executableBest?.sideUsed ?? (executionSide === "SELL" ? "bid" : "ask");
    const bestSideEntry = quoteSummary
        .filter((entry) => (executionSide === "SELL" ? entry.bid != null : entry.ask != null))
        .sort((a, b) => {
            if (executionSide === "SELL") {
                return (b.bid ?? Number.NEGATIVE_INFINITY) - (a.bid ?? Number.NEGATIVE_INFINITY);
            }
            return (a.ask ?? Number.POSITIVE_INFINITY) - (b.ask ?? Number.POSITIVE_INFINITY);
        })[0] ?? null;

    const bestVenue = executableBest?.venue ?? row.bestVenue ?? null;
    const bestSide = executableBest?.sideUsed ?? (executionSide === "BUY" ? "ask" : "bid");
    const bestPrice = executableBest?.executablePrice ?? row.bestMidUsed ?? null;
    const bestPriceDecimals = getPriceDisplayDecimals(underlying, bestPrice);
    const bestConfidence = executableBest?.confidence ?? 0;

    const isPut = row.right === "P";

    return (
        <aside className="w-full flex-1 min-h-0 bg-[#0d1117] border border-[#1e2a3a] flex flex-col overflow-y-auto shrink-0 transition-all font-sans">
            <header className="p-3 border-b border-[#1e2a3a] space-y-2 shrink-0">
                <div className="flex items-start justify-between gap-2">
                    <h1
                        className="text-[#e2e8f0] font-mono font-bold text-[16px] tracking-tight break-all leading-tight"
                        title={row.contractKey}
                    >
                        {row.underlying}-{row.expiry}-{row.strike}-{row.right}
                    </h1>

                    {bestVenue && (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5 bg-[#00e676]/10 border border-[#00e676]/30 px-2 py-0.5 shrink-0">
                                <span className="text-[#00e676] text-[10px] font-bold uppercase tracking-widest">
                                    Best:
                                </span>
                                <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden">
                                    {VENUE_META[bestVenue].logo}
                                </div>
                                <span className="text-[#00e676] text-[10px] font-bold uppercase tracking-widest">
                                    {VENUE_LABELS[bestVenue]}
                                </span>
                                {viewMode === "BEST" && (
                                    <span className="text-[9px] font-mono text-[#8ac1ff]">{bestConfidence}%</span>
                                )}
                            </div>

                            <span className="text-[10px] font-mono text-[#8b9bab] inline-flex items-center gap-1">
                                {bestSide === "ask" ? "Best Ask:" : "Best Bid:"}
                                <AnimatedNumber
                                    value={bestPrice}
                                    decimals={bestPriceDecimals}
                                    durationMs={420}
                                    className="text-[#e2e8f0] font-semibold"
                                />
                            </span>

                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[#8b9bab] text-[11px] uppercase tracking-wider">Underlying Index:</span>
                    <span className="text-[#e2e8f0] font-mono text-[12px] font-bold">
                        {underlyingIndex != null
                            ? underlyingIndex.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })
                            : "-"}
                    </span>
                </div>

                <div className="mt-2 border border-[#2a3a4a] bg-gradient-to-r from-[#0e1724] to-[#0c1520] rounded-sm p-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-[#8b9bab] uppercase tracking-wider font-semibold">Best Ask/Bid Snapshot</span>
                        <span className="inline-flex items-center gap-1 text-[9px] text-[#5a7a9a] uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
                            Live
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {quoteSummary.map((entry) => {
                            const isBest = executableBestVenue != null
                                ? executableBestVenue === entry.venue
                                : bestSideEntry?.venue === entry.venue;
                            return (
                                <div
                                    key={entry.venue}
                                    className={`px-2 py-1 rounded-sm border ${
                                        isBest
                                            ? "border-[#00e676]/50 bg-[#00e676]/10"
                                            : "border-[#213244] bg-[#111a27]/70"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 shrink-0 flex items-center justify-center overflow-hidden">
                                            {VENUE_META[entry.venue].logo}
                                        </div>
                                        <span className="text-[9px] text-[#8b9bab] uppercase tracking-wider">
                                            {VENUE_LABELS[entry.venue]}
                                        </span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 font-mono text-[10px]">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[#6f8092] uppercase tracking-wider">Bid</span>
                                            <span
                                                className={
                                                    executionSide === "SELL" && isBest
                                                        ? "text-[#00e676] font-bold"
                                                        : themeMode === "light"
                                                            ? "snapshot-bid-value !text-black opacity-100"
                                                            : "snapshot-bid-value text-[#cdd8e4]"
                                                }
                                            >
                                                {formatPrice(entry.bid, underlying)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[#6f8092] uppercase tracking-wider">Ask</span>
                                            <span className={executionSide === "BUY" && isBest ? "text-[#00e676] font-bold" : "text-[#e2e8f0]"}>
                                                {formatPrice(entry.ask, underlying)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-1.5 text-[9px] font-mono">
                        {((executableBestVenue != null && executableBestPrice != null) || bestSideEntry) ? (
                            <>
                                <span className="text-[#6a7f95]">Best {bestSideLabel} now:</span>{" "}
                                <span className="text-[#00e676] font-semibold">
                                    {VENUE_LABELS[(executableBestVenue ?? bestSideEntry!.venue)]}{" "}
                                    {formatPrice(
                                        executableBestPrice ??
                                            (executionSide === "SELL" ? bestSideEntry!.bid : bestSideEntry!.ask),
                                        underlying
                                    )}
                                </span>
                                {executableBestVenue != null && executableBestSide !== (executionSide === "SELL" ? "bid" : "ask") && (
                                    <span className="ml-1 text-[#6a7f95]">({executableBestSide.toUpperCase()} mode)</span>
                                )}
                            </>
                        ) : (
                            <span className="text-[#6a7f95]">
                                No executable {executionSide === "SELL" ? "bids" : "asks"} from selected venues
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-0">
                {orderedVenues.map((venue) => {
                    const data = mergedByVenue[venue];
                    if (!data) return null;

                    const deltaClass = data.delta == null
                        ? "text-[#8b9bab]"
                        : data.delta > 0
                            ? "text-[#00e676]"
                            : data.delta < 0
                                ? "text-[#ff3b3b]"
                                : "text-[#e2e8f0]";

                    return (
                        <div key={venue} className="border-b border-[#2a3547] pb-2">
                            <div className="bg-[#1e2532] px-4 py-1.5 flex justify-between items-center border-b border-[#2a3547]/50">
                                <span className="text-[#e2e8f0] text-[11px] uppercase tracking-widest font-bold">
                                    {VENUE_LABELS[venue]}
                                </span>
                                <span className="text-[9px] font-mono text-[#6f8092]">
                                    {data.source.toUpperCase()}
                                </span>
                            </div>

                            <section className="px-4 py-3 border-b border-[#2a3547]/30">
                                <h3 className="text-[#8b9bab] text-[10px] uppercase tracking-wider mb-2 font-semibold">Price & Liquidity</h3>
                                <div className="flex flex-col gap-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[#8b9bab] font-mono text-[11px]">Best Bid</span>
                                        <span className="text-[#e2e8f0] font-mono text-[12px] font-medium">{formatPrice(data.bid, underlying)}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-[#1e2532]/30 px-1 -mx-1 py-0.5 rounded-sm">
                                        <span className="text-[#8b9bab] font-mono text-[11px]">Mid</span>
                                        <span className="text-[#e2e8f0] font-mono text-[12px] font-bold">
                                            <AnimatedNumber
                                                value={data.mid}
                                                decimals={getPriceDisplayDecimals(underlying, data.mid)}
                                                durationMs={420}
                                                className="text-[#e2e8f0]"
                                            />
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[#8b9bab] font-mono text-[11px]">Best Ask</span>
                                        <span className="text-[#e2e8f0] font-mono text-[12px] font-medium">{formatPrice(data.ask, underlying)}</span>
                                    </div>
                                </div>
                            </section>

                            <section className="px-4 py-3 border-b border-[#2a3547]/30">
                                <h3 className="text-[#8b9bab] text-[10px] uppercase tracking-wider mb-2 font-semibold">Greeks & Risk</h3>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                    <div className="flex justify-between items-end border-b border-[#2a3547]/30 pb-1">
                                        <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Mark IV</span>
                                        <span className="text-[#e2e8f0] font-mono text-[12px] font-bold">{formatIv(data.iv)}</span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-[#2a3547]/30 pb-1">
                                        <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Delta</span>
                                        <span className={`font-mono text-[12px] font-bold ${deltaClass}`}>
                                            {formatGreek(data.delta, { signed: true, maxDecimals: 4 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-[#2a3547]/30 pb-1">
                                        <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Gamma</span>
                                        <span className="text-[#8b9bab] font-mono text-[12px]">{formatGreek(data.gamma, { maxDecimals: 6 })}</span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-[#2a3547]/30 pb-1">
                                        <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Theta</span>
                                        <span className="text-[#8b9bab] font-mono text-[12px]">{formatGreek(data.theta, { signed: true, maxDecimals: 4 })}</span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-[#2a3547]/30 pb-1">
                                        <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Vega</span>
                                        <span className="text-[#8b9bab] font-mono text-[12px]">{formatGreek(data.vega, { maxDecimals: 4 })}</span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-[#2a3547]/30 pb-1">
                                        <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Rho</span>
                                        <span className="text-[#8b9bab] font-mono text-[12px]">{formatGreek(data.rho, { signed: true, maxDecimals: 4 })}</span>
                                    </div>
                                </div>
                            </section>

                            {data.vsBenchmarkPct != null && (
                                <section className="px-4 py-3 border-b border-[#2a3547]/30">
                                    <h3 className="text-[#8b9bab] text-[10px] uppercase tracking-wider mb-2 font-semibold">Yield & Spread</h3>
                                    <div className="flex justify-between items-end">
                                        <div className="flex flex-col">
                                            <span className="text-[#8b9bab] text-[10px] uppercase tracking-wider">Vs Benchmark</span>
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className={`font-mono text-[12px] font-bold ${
                                                    data.vsBenchmarkPct > 0
                                                        ? "text-[#00e676]"
                                                        : data.vsBenchmarkPct < 0
                                                            ? "text-[#ff3b3b]"
                                                            : "text-[#e2e8f0]"
                                                }`}>
                                                    {data.vsBenchmarkPct > 0 ? "+" : ""}{formatPct(data.vsBenchmarkPct)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    );
                })}
            </div>

            <footer className="p-4 border-t border-[#2a3547] flex gap-2 shrink-0">
                <button
                    onClick={() => handleTradeClick("BUY")}
                    disabled={buyTradeVenue == null}
                    title={buyTradeVenue ? `Open ${VENUE_LABELS[buyTradeVenue]} to buy this contract` : "No venue available"}
                    className={`flex-1 h-8 text-[11px] font-bold font-mono flex items-center justify-center hover:opacity-90 transition-opacity rounded-none ${
                        isPut ? "bg-[#ff3b3b] text-[#080c14]" : "bg-[#00e676] text-[#080c14]"
                    }`}
                >
                    {row.right === "C" ? "BUY CALL" : "BUY PUT"}
                </button>
                <button
                    onClick={() => handleTradeClick("SELL")}
                    disabled={sellTradeVenue == null}
                    title={sellTradeVenue ? `Open ${VENUE_LABELS[sellTradeVenue]} to sell this contract` : "No venue available"}
                    className={`flex-1 h-8 border text-[11px] font-bold font-mono flex items-center justify-center transition-colors rounded-none ${
                        isPut
                            ? "border-[#ff3b3b] text-[#ff3b3b] hover:bg-[#ff3b3b]/10"
                            : "border-[#00e676] text-[#00e676] hover:bg-[#00e676]/10"
                    }`}
                >
                    {row.right === "C" ? "SELL CALL" : "SELL PUT"}
                </button>
            </footer>
        </aside>
    );
}
