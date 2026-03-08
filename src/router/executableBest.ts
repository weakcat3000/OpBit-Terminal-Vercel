import { Venue } from "@/src/core/types/venues";
import { CompareRow } from "@/src/services/optionsService";
import {
    ExecutionSide,
    ExecutableBestCandidate,
    ExecutableBestResult,
    ExecutableRouterFilters,
    StreamQuote,
    VenueHealthSnapshot,
} from "@/src/streaming/types";

const EPSILON = 1e-6;
const PRIORITY: Venue[] = ["DERIBIT", "AEVO", "LYRA_V2", "IBIT"];

interface VenueMergedQuote {
    bid: number | null;
    ask: number | null;
    mid: number | null;
    bidSize: number | null;
    askSize: number | null;
    ageMs: number;
    source: "ws" | "poll" | "snapshot";
}

function finiteOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
}

function normalizeSpreadPct(bid: number | null, ask: number | null, mid: number | null): number | null {
    if (!(bid != null && ask != null)) return null;
    const safeMid = mid ?? ((bid + ask) / 2);
    if (!(safeMid > 0)) return null;
    return (ask - bid) / safeMid;
}

function comparePriority(a: Venue, b: Venue): number {
    return PRIORITY.indexOf(a) - PRIORITY.indexOf(b);
}

function mergeQuote(
    snapshot: CompareRow["venues"][Venue] | undefined,
    stream: StreamQuote | undefined,
    nowMs: number
): VenueMergedQuote {
    const snapshotBid = finiteOrNull(snapshot?.bid);
    const snapshotAsk = finiteOrNull(snapshot?.ask);
    const snapshotMid = finiteOrNull(snapshot?.mid) ?? (snapshotBid != null && snapshotAsk != null ? (snapshotBid + snapshotAsk) / 2 : null);
    const snapshotBidSize = finiteOrNull(snapshot?.bidSize);
    const snapshotAskSize = finiteOrNull(snapshot?.askSize);
    const snapshotAge = snapshot?.updatedAt != null ? Math.max(0, nowMs - snapshot.updatedAt) : null;

    const streamBid = finiteOrNull(stream?.bid);
    const streamAsk = finiteOrNull(stream?.ask);
    const streamMid = finiteOrNull(stream?.mid) ?? (streamBid != null && streamAsk != null ? (streamBid + streamAsk) / 2 : null);
    const streamBidSize = finiteOrNull(stream?.bidSize);
    const streamAskSize = finiteOrNull(stream?.askSize);
    const streamAge = stream?.lastUpdateMs != null ? Math.max(0, nowMs - stream.lastUpdateMs) : null;

    // Use the freshest source so BEST routing aligns with what users see.
    const useStream = streamAge != null && (snapshotAge == null || streamAge <= snapshotAge);
    if (useStream) {
        const bid = streamBid ?? snapshotBid;
        const ask = streamAsk ?? snapshotAsk;
        const mid = streamMid ?? snapshotMid ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
        return {
            bid,
            ask,
            mid,
            bidSize: streamBidSize ?? snapshotBidSize,
            askSize: streamAskSize ?? snapshotAskSize,
            ageMs: streamAge!,
            source: stream?.source ?? "poll",
        };
    }

    if (snapshotAge != null) {
        return {
            bid: snapshotBid,
            ask: snapshotAsk,
            mid: snapshotMid,
            bidSize: snapshotBidSize,
            askSize: snapshotAskSize,
            ageMs: snapshotAge,
            source: "snapshot",
        };
    }

    const bid = streamBid ?? snapshotBid;
    const ask = streamAsk ?? snapshotAsk;
    const mid = streamMid ?? snapshotMid ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
    const fallbackAge = streamAge ?? 10_000;
    return {
        bid,
        ask,
        mid,
        bidSize: streamBidSize ?? snapshotBidSize,
        askSize: streamAskSize ?? snapshotAskSize,
        ageMs: fallbackAge,
        source: stream?.source ?? "snapshot",
    };
}

function freshnessScore(ageMs: number): number {
    if (ageMs < 250) return 1.0;
    if (ageMs < 1000) return 0.7;
    if (ageMs < 2000) return 0.4;
    if (ageMs < 5000) return 0.1;
    return 0.05;
}

function spreadScore(spreadPct: number | null): number {
    if (spreadPct == null) return 0.35;
    if (spreadPct < 0.01) return 1.0;
    if (spreadPct < 0.03) return 0.7;
    if (spreadPct < 0.07) return 0.4;
    return 0.2;
}

function liquidityScore(size: number | null, maxSize: number | null): number {
    if (size == null || maxSize == null || maxSize <= 0) return 0.45;
    return Math.max(0.1, Math.min(1, size / maxSize));
}

function quoteMaxAge(filters: ExecutableRouterFilters, source: "ws" | "poll" | "snapshot"): number {
    return source === "ws" ? filters.maxQuoteAgeMsWs : filters.maxQuoteAgeMsPoll;
}

export function computeExecutableBest(
    row: CompareRow,
    opts: {
        executionSide: ExecutionSide;
        activeVenues: Venue[];
        streamByVenue: Partial<Record<Venue, StreamQuote | undefined>>;
        venueHealth: Partial<Record<Venue, VenueHealthSnapshot | undefined>>;
        filters: ExecutableRouterFilters;
        benchmark: Venue;
        nowMs?: number;
    }
): ExecutableBestResult {
    const nowMs = opts.nowMs ?? Date.now();
    const sideField = opts.executionSide === "BUY" ? "ask" : "bid";

    const candidates: ExecutableBestCandidate[] = [];
    const candidateByVenue: Partial<Record<Venue, ExecutableBestCandidate>> = {};
    const mergedByVenue = new Map<Venue, VenueMergedQuote>();

    for (const venue of opts.activeVenues) {
        const snapshot = row.venues[venue];
        if (!snapshot) continue;

        const merged = mergeQuote(snapshot, opts.streamByVenue[venue], nowMs);
        mergedByVenue.set(venue, merged);

        const sidePrice = sideField === "ask" ? merged.ask : merged.bid;
        if (!(sidePrice != null && sidePrice > 0)) continue;

        const spreadPct = normalizeSpreadPct(merged.bid, merged.ask, merged.mid);
        if (spreadPct != null && spreadPct > opts.filters.maxSpreadPct) {
            continue;
        }

        const maxAge = quoteMaxAge(opts.filters, merged.source);
        if (merged.ageMs > maxAge) {
            continue;
        }

        const sideSize = sideField === "ask" ? merged.askSize : merged.bidSize;
        const warnings: string[] = [];
        if (sideSize != null && sideSize < opts.filters.minSize) {
            continue;
        }
        if (sideSize == null) warnings.push("NO_SIZE_DATA");
        if (spreadPct != null && spreadPct >= 0.07) warnings.push("WIDE_SPREAD_PENALTY");

        candidates.push({
            venue,
            price: sidePrice,
            side: sideField,
            bid: merged.bid,
            ask: merged.ask,
            mid: merged.mid,
            size: sideSize,
            spreadPct,
            ageMs: merged.ageMs,
            source: merged.source,
            confidence: 0,
            warnings,
        });
    }

    const working = [...candidates];
    const fallbackWarnings: string[] = [];

    if (working.length === 0) {
        // Hard fallback: allow stale quotes when nothing executable passes filters.
        for (const venue of opts.activeVenues) {
            const merged = mergedByVenue.get(venue);
            if (!merged) continue;
            const sidePrice = sideField === "ask" ? merged.ask : merged.bid;
            if (!(sidePrice != null && sidePrice > 0)) continue;
            const spreadPct = normalizeSpreadPct(merged.bid, merged.ask, merged.mid);
            const sideSize = sideField === "ask" ? merged.askSize : merged.bidSize;
            working.push({
                venue,
                price: sidePrice,
                side: sideField,
                bid: merged.bid,
                ask: merged.ask,
                mid: merged.mid,
                size: sideSize,
                spreadPct,
                ageMs: merged.ageMs,
                source: merged.source,
                confidence: 0,
                warnings: ["STALE_QUOTE_FALLBACK", ...(sideSize == null ? ["NO_SIZE_DATA"] : [])],
            });
        }
        if (working.length > 0) {
            fallbackWarnings.push("STALE_QUOTE_FALLBACK");
        }
    }

    if (working.length === 0) {
        return {
            venue: null,
            executablePrice: null,
            sideUsed: null,
            confidence: 0,
            warnings: [],
            candidateByVenue: {},
        };
    }

    const maxSize = working.reduce<number | null>((max, c) => {
        if (c.size == null) return max;
        if (max == null) return c.size;
        return Math.max(max, c.size);
    }, null);

    for (const candidate of working) {
        const f = freshnessScore(candidate.ageMs);
        const l = liquidityScore(candidate.size, maxSize);
        const s = spreadScore(candidate.spreadPct);
        candidate.confidence = Math.round(100 * f * l * s);
        candidateByVenue[candidate.venue] = candidate;
    }

    working.sort((a, b) => {
        const priceCmp = opts.executionSide === "BUY" ? a.price - b.price : b.price - a.price;
        if (Math.abs(priceCmp) > EPSILON) return priceCmp;
        if (a.venue === opts.benchmark) return -1;
        if (b.venue === opts.benchmark) return 1;
        return comparePriority(a.venue, b.venue);
    });

    const winner = working[0];
    const warnings = Array.from(new Set([...(winner.warnings ?? []), ...fallbackWarnings]));
    return {
        venue: winner.venue,
        executablePrice: winner.price,
        sideUsed: winner.side,
        confidence: winner.confidence,
        warnings,
        candidateByVenue,
    };
}
