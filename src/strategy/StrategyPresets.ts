import { StrategyLeg, StrategyPresetKey } from "./StrategyTypes";
import { CompareRow } from "@/src/services/optionsService";

let _nextId = 1;
function makeId(): string {
    return `leg_${Date.now()}_${_nextId++}`;
}

interface PresetContext {
    rows: CompareRow[];
    spot: number;
    underlying: string;
    selectedExpiry: string | null;
}

function nearestATMStrike(rows: CompareRow[], spot: number, right: "C" | "P"): CompareRow | null {
    let best: CompareRow | null = null;
    let bestDist = Infinity;
    for (const row of rows) {
        if (row.right !== right) continue;
        const dist = Math.abs(row.strike - spot);
        if (dist < bestDist) {
            bestDist = dist;
            best = row;
        }
    }
    return best;
}

function nearestOTMStrike(rows: CompareRow[], spot: number, right: "C" | "P", offsetPct: number): CompareRow | null {
    const targetStrike = right === "C" ? spot * (1 + offsetPct) : spot * (1 - offsetPct);
    let best: CompareRow | null = null;
    let bestDist = Infinity;
    for (const row of rows) {
        if (row.right !== right) continue;
        const dist = Math.abs(row.strike - targetStrike);
        if (dist < bestDist) {
            bestDist = dist;
            best = row;
        }
    }
    return best;
}

function nearestByTarget(
    rows: CompareRow[],
    right: "C" | "P",
    targetStrike: number,
    predicate?: (row: CompareRow) => boolean
): CompareRow | null {
    let best: CompareRow | null = null;
    let bestDist = Infinity;
    for (const row of rows) {
        if (row.right !== right) continue;
        if (predicate && !predicate(row)) continue;
        const dist = Math.abs(row.strike - targetStrike);
        if (dist < bestDist) {
            bestDist = dist;
            best = row;
        }
    }
    return best;
}

function priceOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value) || value < 0) return null;
    return value;
}

interface LegQuoteCandidate {
    venue: StrategyLeg["venue"];
    bid: number | null;
    ask: number | null;
    mid: number | null;
    avgBidAsk: number | null;
    markIv: number | null;
}

function pickExecutionCandidate(
    side: "BUY" | "SELL",
    candidates: LegQuoteCandidate[]
): LegQuoteCandidate | null {
    if (candidates.length === 0) return null;

    if (side === "BUY") {
        const byAsk = candidates
            .filter((c) => c.ask != null)
            .sort((a, b) => (a.ask as number) - (b.ask as number));
        if (byAsk.length > 0) return byAsk[0];

        const byMid = candidates
            .filter((c) => c.mid != null)
            .sort((a, b) => (a.mid as number) - (b.mid as number));
        if (byMid.length > 0) return byMid[0];

        const byAlt = candidates
            .map((c) => ({ c, value: c.avgBidAsk ?? c.bid }))
            .filter((item) => item.value != null)
            .sort((a, b) => (a.value as number) - (b.value as number));
        return byAlt[0]?.c ?? null;
    }

    const byBid = candidates
        .filter((c) => c.bid != null)
        .sort((a, b) => (b.bid as number) - (a.bid as number));
    if (byBid.length > 0) return byBid[0];

    const byMid = candidates
        .filter((c) => c.mid != null)
        .sort((a, b) => (b.mid as number) - (a.mid as number));
    if (byMid.length > 0) return byMid[0];

    const byAlt = candidates
        .map((c) => ({ c, value: c.avgBidAsk ?? c.ask }))
        .filter((item) => item.value != null)
        .sort((a, b) => (b.value as number) - (a.value as number));
    return byAlt[0]?.c ?? null;
}

function rowToLeg(
    row: CompareRow,
    side: "BUY" | "SELL",
    underlying: string
): StrategyLeg {
    const candidates: LegQuoteCandidate[] = Object.entries(row.venues)
        .map(([venueKey, quote]) => {
            if (!quote) return null;
            const bid = priceOrNull(quote.bid);
            const ask = priceOrNull(quote.ask);
            const avgBidAsk = bid != null && ask != null ? (bid + ask) / 2 : null;
            const mid = priceOrNull(quote.mid) ?? avgBidAsk;
            return {
                venue: venueKey as StrategyLeg["venue"],
                bid,
                ask,
                mid,
                avgBidAsk,
                markIv: quote.markIv ?? null,
            } satisfies LegQuoteCandidate;
        })
        .filter((candidate): candidate is LegQuoteCandidate => candidate != null);

    const executionCandidate = pickExecutionCandidate(side, candidates);
    const fallbackVenue = (row.bestVenue ?? candidates[0]?.venue ?? "DERIBIT") as StrategyLeg["venue"];
    const venue = executionCandidate?.venue ?? fallbackVenue;
    const bid = executionCandidate?.bid ?? null;
    const ask = executionCandidate?.ask ?? null;
    const mid = executionCandidate?.mid ?? null;
    const avgBidAsk = executionCandidate?.avgBidAsk ?? null;
    const fallbackMid = priceOrNull(row.bestMidUsed);

    // Current mark is neutral mark-to-market; entry is side-aware fill estimate.
    const mark = mid ?? avgBidAsk ?? fallbackMid ?? ask ?? bid ?? 0;
    const entryPrice = side === "BUY"
        ? ask ?? mid ?? avgBidAsk ?? bid ?? fallbackMid ?? 0
        : bid ?? mid ?? avgBidAsk ?? ask ?? fallbackMid ?? 0;
    const iv = executionCandidate?.markIv ?? null;
    const normalizedIv = iv != null ? (iv > 3 ? iv / 100 : iv) : null;

    return {
        id: makeId(),
        contractKey: row.contractKey,
        venue,
        side,
        quantity: 1,
        entryPrice,
        currentMark: mark,
        strike: row.strike,
        type: row.right === "C" ? "CALL" : "PUT",
        expiry: row.expiry,
        iv: normalizedIv,
        multiplier: underlying === "IBIT" ? 100 : 1,
    };
}

type PresetBuilder = (ctx: PresetContext) => StrategyLeg[];

const builders: Record<StrategyPresetKey, PresetBuilder> = {
    LONG_CALL: ({ rows, spot, underlying }) => {
        const row = nearestATMStrike(rows, spot, "C");
        return row ? [rowToLeg(row, "BUY", underlying)] : [];
    },
    LONG_PUT: ({ rows, spot, underlying }) => {
        const row = nearestATMStrike(rows, spot, "P");
        return row ? [rowToLeg(row, "BUY", underlying)] : [];
    },
    STRADDLE: ({ rows, spot, underlying }) => {
        const call = nearestATMStrike(rows, spot, "C");
        const put = nearestATMStrike(rows, spot, "P");
        const legs: StrategyLeg[] = [];
        if (call) legs.push(rowToLeg(call, "BUY", underlying));
        if (put) legs.push(rowToLeg(put, "BUY", underlying));
        return legs;
    },
    STRANGLE: ({ rows, spot, underlying }) => {
        const call = nearestOTMStrike(rows, spot, "C", 0.05);
        const put = nearestOTMStrike(rows, spot, "P", 0.05);
        const legs: StrategyLeg[] = [];
        if (call) legs.push(rowToLeg(call, "BUY", underlying));
        if (put) legs.push(rowToLeg(put, "BUY", underlying));
        return legs;
    },
    BULL_CALL_SPREAD: ({ rows, spot, underlying }) => {
        const longCall = nearestATMStrike(rows, spot, "C");
        const shortCall = nearestOTMStrike(rows, spot, "C", 0.05);
        const legs: StrategyLeg[] = [];
        if (longCall) legs.push(rowToLeg(longCall, "BUY", underlying));
        if (shortCall && shortCall.contractKey !== longCall?.contractKey) {
            legs.push(rowToLeg(shortCall, "SELL", underlying));
        }
        return legs;
    },
    BEAR_CALL_SPREAD: ({ rows, spot, underlying }) => {
        const shortCall = nearestOTMStrike(rows, spot, "C", 0.03);
        const longCall = nearestByTarget(
            rows,
            "C",
            spot * (1 + 0.08),
            (row) => row.strike > (shortCall?.strike ?? spot)
        );
        const legs: StrategyLeg[] = [];
        if (shortCall) legs.push(rowToLeg(shortCall, "SELL", underlying));
        if (longCall && longCall.contractKey !== shortCall?.contractKey) {
            legs.push(rowToLeg(longCall, "BUY", underlying));
        }
        return legs;
    },
    BULL_PUT_SPREAD: ({ rows, spot, underlying }) => {
        const shortPut = nearestOTMStrike(rows, spot, "P", 0.03);
        const longPut = nearestByTarget(
            rows,
            "P",
            spot * (1 - 0.08),
            (row) => row.strike < (shortPut?.strike ?? spot)
        );
        const legs: StrategyLeg[] = [];
        if (shortPut) legs.push(rowToLeg(shortPut, "SELL", underlying));
        if (longPut && longPut.contractKey !== shortPut?.contractKey) {
            legs.push(rowToLeg(longPut, "BUY", underlying));
        }
        return legs;
    },
    BEAR_PUT_SPREAD: ({ rows, spot, underlying }) => {
        const longPut = nearestATMStrike(rows, spot, "P");
        const shortPut = nearestOTMStrike(rows, spot, "P", 0.05);
        const legs: StrategyLeg[] = [];
        if (longPut) legs.push(rowToLeg(longPut, "BUY", underlying));
        if (shortPut && shortPut.contractKey !== longPut?.contractKey) {
            legs.push(rowToLeg(shortPut, "SELL", underlying));
        }
        return legs;
    },
    IRON_CONDOR: ({ rows, spot, underlying }) => {
        const shortPut = nearestOTMStrike(rows, spot, "P", 0.03);
        const shortCall = nearestOTMStrike(rows, spot, "C", 0.03);
        const longPut = nearestByTarget(
            rows,
            "P",
            spot * (1 - 0.08),
            (row) => row.strike < (shortPut?.strike ?? spot)
        );
        const longCall = nearestByTarget(
            rows,
            "C",
            spot * (1 + 0.08),
            (row) => row.strike > (shortCall?.strike ?? spot)
        );
        const legs: StrategyLeg[] = [];
        if (shortPut) legs.push(rowToLeg(shortPut, "SELL", underlying));
        if (longPut && longPut.contractKey !== shortPut?.contractKey) {
            legs.push(rowToLeg(longPut, "BUY", underlying));
        }
        if (shortCall) legs.push(rowToLeg(shortCall, "SELL", underlying));
        if (longCall && longCall.contractKey !== shortCall?.contractKey) {
            legs.push(rowToLeg(longCall, "BUY", underlying));
        }
        return legs;
    },
    COVERED_CALL: ({ rows, spot, underlying }) => {
        const shortCall = nearestOTMStrike(rows, spot, "C", 0.03);
        if (!shortCall) return [];
        return [rowToLeg(shortCall, "SELL", underlying)];
    },
};

export function buildPreset(preset: StrategyPresetKey, ctx: PresetContext): StrategyLeg[] {
    return builders[preset](ctx);
}

export { makeId, rowToLeg };
