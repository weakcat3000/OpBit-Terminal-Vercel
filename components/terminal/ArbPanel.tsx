"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { useShallow } from "zustand/react/shallow";
import { ArbOpportunity, ArbPlaybook, ArbHistoryPoint } from "@/src/services/arbitrage/arbTypes";
import { arbHistoryStore } from "@/src/services/arbitrage/arbHistoryStore";
import { Venue } from "@/src/core/types/venues";
import { makeQuoteKey } from "@/src/streaming/streamSelectors";
import { QuoteKey, StreamQuote } from "@/src/streaming/types";
import { useMarketStreamStore } from "@/src/streaming/useMarketStreamStore";
import { ArbOpportunityTable } from "./ArbOpportunityTable";
import { ArbLineChart } from "./ArbLineChart";

export interface ArbContractNavigationTarget {
    expiry: string;
    strike: number;
    side: "C" | "P";
    contractKey?: string;
}

export interface ArbUiContextSnapshot {
    playbook: ArbPlaybook;
    loading: boolean;
    needsRescan: boolean;
    scanStatusLabel: string;
    scanProgressPct: number;
    scannedContracts: number;
    scannedExpiriesCount: number;
    opportunityCount: number;
    trackedContractCount: number;
    topOpportunities: Array<{
        id: string;
        kind: ArbOpportunity["kind"];
        expiry: string;
        strike: number | null;
        optionType: "CALL" | "PUT" | null;
        profitPct: number;
        profitUSD_per1: number;
        maxSizeUSD: number;
    }>;
}

interface ArbPanelProps {
    underlying: string;
    expiry: string | null;
    venues: Venue[];
    themeMode: "dark" | "light";
    onOpenStrategy?: () => void;
    onClose?: () => void;
    onNavigateToContract?: (target: ArbContractNavigationTarget) => void;
    onTrackedContractsChange?: (contractKeys: string[]) => void;
    onContextChange?: (snapshot: ArbUiContextSnapshot | null) => void;
}

interface ArbApiResponse {
    opportunities?: ArbOpportunity[];
    count?: number;
    expiry?: string;
    requestedExpiry?: string;
    fallbackUsed?: boolean;
    scannedExpiries?: string[];
    scannedRows?: number;
    scannedCalls?: number;
    scannedPuts?: number;
    scanAllExpiries?: boolean;
    scanErrors?: string[];
    scanPhase?: string;
    latestFirstCount?: number;
    totalExpiriesAvailable?: number;
    remainingExpiries?: number;
    scanCursor?: number;
    scanBatchSize?: number;
    nextCursor?: number | null;
    scanComplete?: boolean;
    error?: string;
}

const LATEST_FIRST_COUNT = 8;
const ARB_INITIAL_SCAN_DONE_KEY = "opbit_arb_initial_scan_done_v1";
const MAX_TRACKED_IDENTIFIED_CONTRACTS = 8;
const HISTORY_SAMPLE_INTERVAL_MS = 2000;
const HISTORY_MIN_SAMPLE_GAP_MS = 1800;

function finite(value: number | null | undefined): number | null {
    return value != null && Number.isFinite(value) ? value : null;
}

function updateLegFromQuote(leg: ArbOpportunity["legs"][number], quote?: StreamQuote) {
    const bid = finite(quote?.bid) ?? finite(leg.bidUSD);
    const ask = finite(quote?.ask) ?? finite(leg.askUSD);
    const mid = finite(quote?.mid) ?? (bid != null && ask != null ? (bid + ask) / 2 : finite(leg.midUSD));
    const pxUSD = leg.side === "BUY"
        ? (ask ?? finite(leg.pxUSD) ?? 0)
        : (bid ?? finite(leg.pxUSD) ?? 0);
    const liveSize = leg.side === "BUY"
        ? (finite(quote?.askSize) != null && ask != null ? finite(quote?.askSize)! * ask : null)
        : (finite(quote?.bidSize) != null && bid != null ? finite(quote?.bidSize)! * bid : null);
    const spreadPct = mid != null && mid > 0 && ask != null && bid != null
        ? (ask - bid) / mid
        : leg.spreadPct;

    return {
        ...leg,
        pxUSD,
        bidUSD: bid ?? leg.bidUSD,
        askUSD: ask ?? leg.askUSD,
        midUSD: mid ?? leg.midUSD,
        sizeUSD: liveSize != null && liveSize > 0 ? liveSize : leg.sizeUSD,
        spreadPct,
    };
}

function repriceOpportunity(opp: ArbOpportunity, quoteMap: Record<string, StreamQuote | undefined>): ArbOpportunity {
    const legs = opp.legs.map((leg) => updateLegFromQuote(leg, quoteMap[makeQuoteKey(leg.venue, leg.contractKey)]));
    const buyLegs = legs.filter((leg) => leg.side === "BUY");
    const sellLegs = legs.filter((leg) => leg.side === "SELL");
    const now = Date.now();
    const quoteAgeMsMax = legs.reduce((maxAge, leg) => {
        const streamQuote = quoteMap[makeQuoteKey(leg.venue, leg.contractKey)];
        if (!streamQuote?.lastUpdateMs) return maxAge;
        return Math.max(maxAge, Math.max(0, now - streamQuote.lastUpdateMs));
    }, opp.quoteAgeMsMax);

    if (opp.kind === "CROSS_VENUE_SAME_CONTRACT") {
        const buy = buyLegs[0];
        const sell = sellLegs[0];
        if (!buy || !sell) return { ...opp, legs, quoteAgeMsMax };
        const capitalUSD_per1 = buy.pxUSD > 0 ? buy.pxUSD : opp.capitalUSD_per1;
        const profitUSD_per1 = sell.pxUSD - buy.pxUSD;
        const buySize = finite(buy.sizeUSD);
        const sellSize = finite(sell.sizeUSD);
        const maxSizeUSD = buySize != null && sellSize != null
            ? Math.min(buySize, sellSize)
            : buySize ?? sellSize ?? opp.maxSizeUSD;
        const maxQty = maxSizeUSD > 0 && capitalUSD_per1 > 0 ? maxSizeUSD / capitalUSD_per1 : 1;
        return {
            ...opp,
            legs,
            quoteAgeMsMax,
            capitalUSD_per1,
            profitUSD_per1,
            profitPct: capitalUSD_per1 > 0 ? profitUSD_per1 / capitalUSD_per1 : opp.profitPct,
            maxSizeUSD,
            profitUSD_max: profitUSD_per1 * maxQty,
        };
    }

    if (opp.kind === "INTRA_VENUE_BOX") {
        const fixedPayoff = opp.strikes
            ? Math.abs(opp.strikes[1] - opp.strikes[0])
            : (opp.profitUSD_per1 + opp.capitalUSD_per1);
        const capitalUSD_per1 = legs.reduce((sum, leg) => sum + (leg.side === "BUY" ? leg.pxUSD : -leg.pxUSD), 0);
        const safeCapital = capitalUSD_per1 > 0 ? capitalUSD_per1 : opp.capitalUSD_per1;
        const profitUSD_per1 = fixedPayoff - capitalUSD_per1;
        const knownSizes = legs.map((leg) => finite(leg.sizeUSD)).filter((value): value is number => value != null && value > 0);
        const maxSizeUSD = knownSizes.length > 0 ? Math.min(...knownSizes) : opp.maxSizeUSD;
        const maxQty = maxSizeUSD > 0 && safeCapital > 0 ? maxSizeUSD / safeCapital : 1;
        return {
            ...opp,
            legs,
            quoteAgeMsMax,
            capitalUSD_per1: safeCapital,
            profitUSD_per1,
            profitPct: safeCapital > 0 ? profitUSD_per1 / safeCapital : opp.profitPct,
            maxSizeUSD,
            profitUSD_max: profitUSD_per1 * maxQty,
        };
    }

    return { ...opp, legs, quoteAgeMsMax };
}

export function ArbPanel({ underlying, expiry, venues, themeMode, onOpenStrategy, onClose, onNavigateToContract, onTrackedContractsChange, onContextChange }: ArbPanelProps) {
    const playbook: ArbPlaybook = "ALL";
    const [opportunities, setOpportunities] = useState<ArbOpportunity[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [histories, setHistories] = useState<Record<string, ArbHistoryPoint[]>>({});
    const [scanMeta, setScanMeta] = useState<{
        effectiveExpiry: string | null;
        requestedExpiry: string | null;
        fallbackUsed: boolean;
        scanAllExpiries: boolean;
        scannedExpiries: string[];
        scannedRows: number;
        scannedCalls: number;
        scannedPuts: number;
        error: string | null;
    }>({
        effectiveExpiry: null,
        requestedExpiry: null,
        fallbackUsed: false,
        scanAllExpiries: false,
        scannedExpiries: [],
        scannedRows: 0,
        scannedCalls: 0,
        scannedPuts: 0,
        error: null,
    });

    const loadingDoneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const latestDisplayedByIdRef = useRef<Map<string, ArbOpportunity>>(new Map());
    const latestTrackedIdsRef = useRef<string[]>([]);
    const lastHistorySnapshotAtRef = useRef(0);
    const inFlightRef = useRef(false);
    const hasInitialScanRef = useRef(false);
    const lastScanKeyRef = useRef<string | null>(null);
    const seqRef = useRef(0);
    const fallbackAttemptedKeyRef = useRef<string | null>(null);
    const [scanProgressPct, setScanProgressPct] = useState(0);
    const [scanStatusLabel, setScanStatusLabel] = useState("Idle");
    const [needsRescan, setNeedsRescan] = useState(false);
    const [initialAllScanDone, setInitialAllScanDone] = useState<boolean | null>(null);
    const isDark = themeMode === "dark";
    const scanKey = `${underlying}|${expiry ?? ""}|${venues.join(",")}|${playbook}`;
    const trackedOpportunityIds = useMemo(() => {
        const ids: string[] = [];
        if (selectedId) ids.push(selectedId);
        for (const opp of opportunities) {
            if (ids.length >= MAX_TRACKED_IDENTIFIED_CONTRACTS) break;
            if (!ids.includes(opp.id)) ids.push(opp.id);
        }
        return ids;
    }, [opportunities, selectedId]);
    const trackedContractKeys = useMemo(() => {
        const tracked = new Set<string>();
        const trackedIdSet = new Set(trackedOpportunityIds);
        for (const opp of opportunities) {
            if (!trackedIdSet.has(opp.id)) continue;
            for (const leg of opp.legs) tracked.add(leg.contractKey);
        }
        return Array.from(tracked);
    }, [opportunities, trackedOpportunityIds]);
    const trackedQuoteKeys = useMemo(() => {
        const tracked = new Set<QuoteKey>();
        const trackedIdSet = new Set(trackedOpportunityIds);
        for (const opp of opportunities) {
            if (!trackedIdSet.has(opp.id)) continue;
            for (const leg of opp.legs) tracked.add(makeQuoteKey(leg.venue, leg.contractKey));
        }
        return Array.from(tracked);
    }, [opportunities, trackedOpportunityIds]);
    const trackedQuotes = useMarketStreamStore(
        useShallow((state) => {
            const subset: Record<string, StreamQuote | undefined> = {};
            for (const key of trackedQuoteKeys) {
                subset[key] = state.quotes[key];
            }
            return subset;
        })
    );
    const displayedOpportunities = useMemo(() => {
        if (opportunities.length === 0) return opportunities;
        return [...opportunities]
            .map((opp) => repriceOpportunity(opp, trackedQuotes))
            .sort((a, b) => {
                if (b.profitPct !== a.profitPct) return b.profitPct - a.profitPct;
                if (b.profitUSD_max !== a.profitUSD_max) return b.profitUSD_max - a.profitUSD_max;
                return a.quoteAgeMsMax - b.quoteAgeMsMax;
            });
    }, [opportunities, trackedQuotes]);

    const sortOpportunities = useCallback((items: ArbOpportunity[]) => {
        const sorted = [...items].sort((a, b) => {
            if (b.profitPct !== a.profitPct) return b.profitPct - a.profitPct;
            if (b.profitUSD_max !== a.profitUSD_max) return b.profitUSD_max - a.profitUSD_max;
            return a.quoteAgeMsMax - b.quoteAgeMsMax;
        });
        return sorted.slice(0, 250);
    }, []);

    const mergeOpportunities = useCallback((left: ArbOpportunity[], right: ArbOpportunity[]) => {
        const merged = new Map<string, ArbOpportunity>();
        for (const opportunity of [...left, ...right]) {
            const current = merged.get(opportunity.id);
            if (!current || opportunity.profitUSD_max > current.profitUSD_max) {
                merged.set(opportunity.id, opportunity);
            }
        }
        return sortOpportunities(Array.from(merged.values()));
    }, [sortOpportunities]);

    const fetchArbs = useCallback(async () => {
        if (!expiry) {
            setOpportunities([]);
            setScanMeta({
                effectiveExpiry: null,
                requestedExpiry: null,
                fallbackUsed: false,
                scanAllExpiries: false,
                scannedExpiries: [],
                scannedRows: 0,
                scannedCalls: 0,
                scannedPuts: 0,
                error: null,
            });
            setLoading(false);
            setScanProgressPct(0);
            setScanStatusLabel("Idle");
            setNeedsRescan(false);
            return;
        }

        if (inFlightRef.current) return;
        inFlightRef.current = true;

        const seq = ++seqRef.current;
        setLoading(true);
        setScanProgressPct(0);
        setScanStatusLabel("Preparing scan...");
        setNeedsRescan(false);
        if (loadingDoneRef.current) {
            clearTimeout(loadingDoneRef.current);
            loadingDoneRef.current = null;
        }
        const requestKey = `${underlying}|${expiry}|${venues.join(",")}|${playbook}`;

        const requestArbs = async (options: {
            withFallback?: boolean;
            scanCursor?: number;
            scanBatchSize?: number;
        }): Promise<ArbApiResponse> => {
            const params = new URLSearchParams({
                underlying,
                expiry,
                venues: venues.join(","),
                playbook,
            });
            if (playbook === "ALL") {
                params.set("scanAllExpiries", "1");
                params.set("latestFirstCount", String(LATEST_FIRST_COUNT));
                params.set("scanCursor", String(options.scanCursor ?? 0));
                params.set("scanBatchSize", String(options.scanBatchSize ?? LATEST_FIRST_COUNT));
            }
            if (options.withFallback) {
                params.set("fallback", "1");
                params.set("fallbackLimit", "4");
            }

            try {
                const res = await fetch(`/api/arb?${params}`);
                if (!res.ok) {
                    return {
                        opportunities: [],
                        count: 0,
                        error: `HTTP ${res.status}`,
                    };
                }
                return (await res.json()) as ArbApiResponse;
            } catch (err) {
                return {
                    opportunities: [],
                    count: 0,
                    error: err instanceof Error ? err.message : "Network error",
                };
            }
        };

        let completedAllExpiryScan = false;
        try {
            let opps: ArbOpportunity[] = [];

            if (playbook === "ALL") {
                const batchSize = LATEST_FIRST_COUNT;
                let cursor = 0;
                let totalExpiries = 0;
                let allScannedRows = 0;
                let allScannedCalls = 0;
                let allScannedPuts = 0;
                let allScannedExpiries: string[] = [];
                let firstError: string | null = null;

                while (true) {
                    if (seq !== seqRef.current) return;
                    if (totalExpiries > 0) {
                        const statusTarget = Math.min(cursor + batchSize, totalExpiries);
                        setScanStatusLabel(`Scanning expiries ${statusTarget}/${totalExpiries}...`);
                    } else {
                        setScanStatusLabel("Preparing scan...");
                    }

                    const batch = await requestArbs({
                        scanCursor: cursor,
                        scanBatchSize: batchSize,
                    });
                    if (seq !== seqRef.current) return;

                    totalExpiries = batch.totalExpiriesAvailable ?? totalExpiries;
                    allScannedRows += batch.scannedRows ?? 0;
                    allScannedCalls += batch.scannedCalls ?? 0;
                    allScannedPuts += batch.scannedPuts ?? 0;
                    allScannedExpiries = Array.from(new Set([
                        ...allScannedExpiries,
                        ...(batch.scannedExpiries ?? []),
                    ]));
                    if (!firstError && batch.error) {
                        firstError = batch.error;
                    }

                    opps = mergeOpportunities(opps, batch.opportunities ?? []);
                    setOpportunities(opps);

                    const nextCursor = batch.nextCursor ?? totalExpiries;
                    const scannedCount = totalExpiries > 0
                        ? Math.min(totalExpiries, nextCursor)
                        : allScannedExpiries.length;
                    const pct = totalExpiries > 0
                        ? Math.min(99, Math.floor((scannedCount / totalExpiries) * 100))
                        : 0;
                    setScanProgressPct((prev) => Math.max(prev, pct));

                    setScanMeta({
                        effectiveExpiry: "ALL",
                        requestedExpiry: batch.requestedExpiry ?? expiry,
                        fallbackUsed: false,
                        scanAllExpiries: true,
                        scannedExpiries: allScannedExpiries,
                        scannedRows: allScannedRows,
                        scannedCalls: allScannedCalls,
                        scannedPuts: allScannedPuts,
                        error: firstError,
                    });

                    if (batch.scanComplete === true || batch.nextCursor == null || nextCursor <= cursor) {
                        break;
                    }
                    cursor = nextCursor;
                }
                completedAllExpiryScan = true;
            } else {
                setScanStatusLabel("Scanning selected expiry...");
                let data = await requestArbs({});
                if (seq !== seqRef.current) return;
                setScanProgressPct(70);

                const baseCount = data.opportunities?.length ?? 0;
                const shouldTryFallback = baseCount === 0 && fallbackAttemptedKeyRef.current !== requestKey;
                if (shouldTryFallback) {
                    fallbackAttemptedKeyRef.current = requestKey;
                    setScanStatusLabel("Checking nearby expiries...");
                    data = await requestArbs({ withFallback: true });
                    if (seq !== seqRef.current) return;
                }

                opps = sortOpportunities(data.opportunities ?? []);
                setOpportunities(opps);
                setScanMeta({
                    effectiveExpiry: data.expiry ?? expiry,
                    requestedExpiry: data.requestedExpiry ?? expiry,
                    fallbackUsed: data.fallbackUsed === true,
                    scanAllExpiries: false,
                    scannedExpiries: data.scannedExpiries ?? [expiry],
                    scannedRows: data.scannedRows ?? 0,
                    scannedCalls: data.scannedCalls ?? 0,
                    scannedPuts: data.scannedPuts ?? 0,
                    error: data.error ?? null,
                });
            }

        } finally {
            inFlightRef.current = false;
            if (seq !== seqRef.current) return;
            if (completedAllExpiryScan && playbook === "ALL" && typeof window !== "undefined") {
                window.sessionStorage.setItem(ARB_INITIAL_SCAN_DONE_KEY, "1");
                setInitialAllScanDone(true);
            }
            lastScanKeyRef.current = scanKey;
            setScanStatusLabel("Scan complete.");
            setScanProgressPct(100);
            loadingDoneRef.current = setTimeout(() => {
                if (seq === seqRef.current) {
                    setLoading(false);
                }
            }, 170);
        }
    }, [underlying, expiry, venues, playbook, sortOpportunities, mergeOpportunities, scanKey]);

    useEffect(() => {
        if (!expiry) return;
        if (initialAllScanDone == null) return;

        if (!hasInitialScanRef.current) {
            hasInitialScanRef.current = true;
            if (initialAllScanDone) {
                setNeedsRescan(true);
                setScanProgressPct(0);
                setScanStatusLabel("Press Rescan to scan.");
                return;
            }
            void fetchArbs();
            return;
        }

        if (lastScanKeyRef.current !== scanKey) {
            setNeedsRescan(true);
            setScanProgressPct(0);
            setScanStatusLabel("View changed. Press Rescan.");
        }
    }, [expiry, scanKey, fetchArbs, initialAllScanDone]);

    useEffect(() => {
        return () => arbHistoryStore.pruneStale();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            setInitialAllScanDone(false);
            return;
        }
        const value = window.sessionStorage.getItem(ARB_INITIAL_SCAN_DONE_KEY) === "1";
        setInitialAllScanDone(value);
    }, []);

    useEffect(() => {
        return () => {
            if (loadingDoneRef.current) {
                clearTimeout(loadingDoneRef.current);
                loadingDoneRef.current = null;
            }
            if (historyTimerRef.current) {
                clearInterval(historyTimerRef.current);
                historyTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        onTrackedContractsChange?.(trackedContractKeys);
    }, [trackedContractKeys, onTrackedContractsChange]);

    useEffect(() => {
        return () => {
            onTrackedContractsChange?.([]);
        };
    }, [onTrackedContractsChange]);

    useEffect(() => {
        const topOpportunities = displayedOpportunities.slice(0, 8).map((opp) => ({
            id: opp.id,
            kind: opp.kind,
            expiry: opp.expiry,
            strike: opp.strike ?? (opp.strikes?.[0] ?? null),
            optionType: opp.optionType ?? null,
            profitPct: opp.profitPct,
            profitUSD_per1: opp.profitUSD_per1,
            maxSizeUSD: opp.maxSizeUSD,
        }));
        onContextChange?.({
            playbook,
            loading,
            needsRescan,
            scanStatusLabel,
            scanProgressPct,
            scannedContracts: scanMeta.scannedRows,
            scannedExpiriesCount: scanMeta.scannedExpiries.length,
            opportunityCount: displayedOpportunities.length,
            trackedContractCount: trackedContractKeys.length,
            topOpportunities,
        });
    }, [
        onContextChange,
        playbook,
        loading,
        needsRescan,
        scanStatusLabel,
        scanProgressPct,
        scanMeta.scannedRows,
        scanMeta.scannedExpiries.length,
        displayedOpportunities,
        trackedContractKeys.length,
    ]);

    useEffect(() => {
        return () => {
            onContextChange?.(null);
        };
    }, [onContextChange]);

    useEffect(() => {
        latestTrackedIdsRef.current = trackedOpportunityIds;
        latestDisplayedByIdRef.current = new Map(displayedOpportunities.map((opp) => [opp.id, opp]));
    }, [displayedOpportunities, trackedOpportunityIds]);

    const pushHistorySnapshot = useCallback((force = false) => {
        const now = Date.now();
        if (!force && now - lastHistorySnapshotAtRef.current < HISTORY_MIN_SAMPLE_GAP_MS) {
            return;
        }
        const trackedIds = latestTrackedIdsRef.current;
        if (trackedIds.length === 0) return;
        const byId = latestDisplayedByIdRef.current;
        if (byId.size === 0) return;

        const nextHistories: Record<string, ArbHistoryPoint[]> = {};
        for (const id of trackedIds) {
            const opp = byId.get(id);
            if (!opp) continue;
            arbHistoryStore.record(id, opp.profitPct, opp.profitUSD_per1);
            nextHistories[id] = arbHistoryStore.getHistory(id);
        }
        const nextKeys = Object.keys(nextHistories);
        if (nextKeys.length === 0) return;

        lastHistorySnapshotAtRef.current = now;
        setHistories((prev) => {
            const prevKeys = Object.keys(prev);
            if (prevKeys.length !== nextKeys.length) return nextHistories;
            for (const key of nextKeys) {
                const prevSeries = prev[key] ?? [];
                const nextSeries = nextHistories[key] ?? [];
                if (prevSeries.length !== nextSeries.length) return nextHistories;
                const prevLast = prevSeries[prevSeries.length - 1];
                const nextLast = nextSeries[nextSeries.length - 1];
                if (
                    prevLast?.ts !== nextLast?.ts ||
                    prevLast?.profitPct !== nextLast?.profitPct ||
                    prevLast?.profitUSD_per1 !== nextLast?.profitUSD_per1
                ) {
                    return nextHistories;
                }
            }
            return prev;
        });
    }, []);

    useEffect(() => {
        if (historyTimerRef.current) {
            clearInterval(historyTimerRef.current);
            historyTimerRef.current = null;
        }
        if (trackedOpportunityIds.length === 0) return;

        pushHistorySnapshot(true);
        historyTimerRef.current = setInterval(() => {
            pushHistorySnapshot(false);
        }, HISTORY_SAMPLE_INTERVAL_MS);

        return () => {
            if (historyTimerRef.current) {
                clearInterval(historyTimerRef.current);
                historyTimerRef.current = null;
            }
        };
    }, [trackedOpportunityIds.length, pushHistorySnapshot]);

    const handleSelect = useCallback((opp: ArbOpportunity) => {
        setSelectedId((prev) => (prev === opp.id ? null : opp.id));
        const side: "C" | "P" | undefined =
            opp.optionType === "CALL"
                ? "C"
                : opp.optionType === "PUT"
                    ? "P"
                    : opp.legs.find((leg) => leg.right === "C" || leg.right === "P")?.right;
        const strike = opp.strike ?? opp.legs.find((leg) => Number.isFinite(leg.strike))?.strike;
        const targetExpiry = opp.expiry || opp.legs[0]?.expiry;
        if (!side || strike == null || !Number.isFinite(strike) || !targetExpiry) return;
        const contractLeg =
            opp.legs.find((leg) => leg.right === side) ??
            opp.legs.find((leg) => Number.isFinite(leg.strike) && leg.strike === strike) ??
            opp.legs[0];
        onNavigateToContract?.({
            expiry: targetExpiry,
            strike,
            side,
            contractKey: contractLeg?.contractKey,
        });
    }, [onNavigateToContract]);

    const labels = useMemo(() => {
        const map: Record<string, string> = {};
        for (const opp of displayedOpportunities) {
            if (opp.kind === "CROSS_VENUE_SAME_CONTRACT") {
                map[opp.id] = `CV ${opp.strike} ${opp.optionType === "CALL" ? "C" : "P"}`;
            } else if (opp.kind === "INTRA_VENUE_BOX") {
                map[opp.id] = `BOX ${opp.strikes?.[0]}/${opp.strikes?.[1]}`;
            } else {
                map[opp.id] = opp.id.slice(0, 15);
            }
        }
        return map;
    }, [displayedOpportunities]);

    return (
        <div className={`flex flex-col h-full overflow-hidden ${isDark ? "bg-[#080c14] text-slate-100" : "bg-[#f3f7fc] text-[#18253a]"}`}>
            <div className={`px-3 py-2.5 border-b shrink-0 overflow-visible ${isDark ? "bg-[#111622] border-[#2a3547]" : "bg-[#f8fbff] border-[#c8d8ea]"}`}>
                <div className="relative z-10 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                        <div className="shrink-0 flex items-center gap-1.5">
                            <Image
                                src="/opbit_icon_transparent.png"
                                alt="OpBit"
                                width={30}
                                height={24}
                                className="no-theme-invert h-[18px] w-auto"
                                suppressHydrationWarning
                                priority
                            />
                            <span className="text-[15px] italic leading-[1.1] tracking-tight pb-[1px]">
                                <span className="font-extrabold text-[#ffffff] [-webkit-text-stroke:1.1px_#ff8c00]">
                                    Op
                                </span>
                                <span className="font-bold text-[#ff8c00] [-webkit-text-stroke:1.1px_#ff8c00]">
                                    Bit
                                </span>
                            </span>
                        </div>
                        <div className="min-w-0 flex items-center gap-1">
                            <h1 className={`truncate text-[14px] font-bold tracking-tight leading-[1.18] pb-[1px] ${isDark ? "text-[#f2f8ff]" : "text-[#1e3a56]"}`}>
                                Arbitrage Scanner
                            </h1>
                            <span className={`font-medium text-[10px] italic leading-none ${isDark ? "text-[#9fb2c8]" : "text-[#5d7895]"}`}>BETA</span>
                        </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                        {onOpenStrategy && (
                            <button
                                type="button"
                                onClick={onOpenStrategy}
                                className={`px-2 py-0.5 text-[9px] border rounded transition-colors ${isDark
                                    ? "text-[#88bbdd] border-[#2a4a6a] hover:bg-[#16304a]"
                                    : "text-[#315d86] border-[#a9c2db] hover:bg-[#e5f0fa]"
                                    }`}
                            >
                                Strategy
                            </button>
                        )}
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className={`px-1.5 py-0.5 text-[9px] transition-colors ${isDark ? "text-[#5a6a7a] hover:text-[#c0ccd8]" : "text-[#5f7d9a] hover:text-[#2e4f6e]"}`}
                                title="Collapse"
                            >
                                X
                            </button>
                        )}
                    </div>
                </div>

                <div className="relative z-0 mt-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className={`min-w-0 truncate text-[10px] font-mono font-bold tracking-[0.08em] leading-[1.45] pb-[2px] ${isDark ? "text-[#0ce4ae]" : "text-[#0cae8c]"}`}>
                            {loading
                                ? `${scanStatusLabel} ${scanProgressPct}%`
                                : needsRescan
                                    ? "VIEW CHANGED. PRESS RESCAN."
                                : `${displayedOpportunities.length} FOUND | ${scanMeta.scannedRows} CONTRACTS SCANNED`}
                        </span>
                        <div className="shrink-0 flex items-center gap-2">
                            {loading && (
                                <div className="relative flex items-center justify-center w-2 h-2 shrink-0">
                                    <span className="absolute inline-flex w-full h-full rounded-full bg-[#0ce4ae] opacity-75 animate-ping" />
                                    <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[#0ce4ae]" />
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => void fetchArbs()}
                                disabled={loading}
                                className={`px-2 py-0.5 text-[9px] font-mono border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark
                                    ? "text-[#88bbdd] border-[#2a4a6a] hover:bg-[#16304a]"
                                    : "text-[#315d86] border-[#a9c2db] hover:bg-[#e5f0fa]"
                                    }`}
                            >
                                Rescan
                            </button>
                        </div>
                    </div>
                    <div className={`mt-1 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-[#0a1628] border border-[#1f3147]" : "bg-[#e8f1fb] border border-[#c5d6ea]"}`}>
                        <div
                            className={`h-full rounded-full transition-[width] duration-100 ${loading
                                ? (isDark ? "bg-[#0ce4ae]" : "bg-[#12cda5]")
                                : (isDark ? "bg-[#47b5ff]" : "bg-[#3aa2e6]")
                                }`}
                            style={{ width: `${loading ? scanProgressPct : (needsRescan ? 0 : 100)}%` }}
                        />
                    </div>
                </div>
            </div>

            {scanMeta.fallbackUsed && scanMeta.effectiveExpiry && (
                <div className={`px-4 py-2 text-[10px] border-b ${isDark ? "bg-[#161c2b] text-[#8b9bab] border-[#2a3547]" : "bg-[#e9f1fa] text-[#31597d] border-[#c8d8ea]"}`}>
                    No opportunities on {scanMeta.requestedExpiry}. Showing nearest expiry with opportunities: {scanMeta.effectiveExpiry}.
                </div>
            )}
            {scanMeta.scanAllExpiries && scanMeta.scannedExpiries.length > 0 && (
                <div className={`px-4 py-2 text-[10px] border-b ${isDark ? "bg-[#161c2b] text-[#8b9bab] border-[#2a3547]" : "bg-[#e9f1fa] text-[#31597d] border-[#c8d8ea]"}`}>
                    Scanning all expiries for {underlying}: {scanMeta.scannedExpiries.length} expiries checked.
                </div>
            )}

            {scanMeta.error && (
                <div className={`px-4 py-2 text-[10px] border-b ${isDark ? "bg-[#1a1014] text-[#ff3b3b] border-[#3a1f27]" : "bg-[#fff1f1] text-[#c0392b] border-[#f2c3c3]"}`}>
                    ARB scan error: {scanMeta.error}
                </div>
            )}

            <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${isDark ? "bg-[#080c14]" : "bg-[#f8fbff]"}`}>
                <ArbOpportunityTable
                    opportunities={displayedOpportunities}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    themeMode={themeMode}
                    loading={loading}
                    scannedContracts={scanMeta.scannedRows}
                    emptyLabel={
                        scanMeta.scannedRows > 0
                            ? `No riskless opportunities found after scanning ${scanMeta.scannedRows} contracts.`
                            : "No contracts available to scan for this underlying/expiry."
                    }
                />
            </div>

            <div className={`h-[30%] min-h-[170px] shrink-0 border-t flex flex-col ${isDark ? "bg-[#111622] border-[#2a3547]" : "bg-[#f8fbff] border-[#c8d8ea]"}`}>
                <div className={`flex justify-between items-center px-4 py-2 border-b shrink-0 ${isDark ? "border-[#2a3547]" : "border-[#c8d8ea]"}`}>
                    <span className={`text-[10px] uppercase font-bold tracking-widest ${isDark ? "text-[#64748b]" : "text-[#5d7895]"}`}>Real-Time Performance (5m)</span>
                    <div className="flex items-center gap-3">
                        <span className={`font-mono text-[9px] flex items-center gap-1 ${isDark ? "text-[#e2e8f0]" : "text-[#1e3a56]"}`}><span className="w-1.5 h-1.5 bg-[#0ce4ae]"></span> PROFIT %</span>
                        <span className={`font-mono text-[9px] flex items-center gap-1 ${isDark ? "text-[#64748b]" : "text-[#5d7895]"}`}><span className={`w-1.5 h-1.5 ${isDark ? "bg-[#2a3547]" : "bg-[#9db4cc]"}`}></span> THRESHOLD (2%)</span>
                    </div>
                </div>
                <div className="flex-1 relative min-h-0">
                    <ArbLineChart
                        histories={histories}
                        selectedId={selectedId}
                        labels={labels}
                        themeMode={themeMode}
                    />
                </div>
            </div>
        </div>
    );
}
