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

function rowToLeg(
    row: CompareRow,
    side: "BUY" | "SELL",
    underlying: string
): StrategyLeg {
    const bestVenue = row.bestVenue ?? "DERIBIT";
    const venueData = row.venues[bestVenue] ?? Object.values(row.venues)[0];
    const mid = venueData?.mid ?? row.bestMidUsed ?? 0;
    const iv = venueData?.markIv ?? null;
    const normalizedIv = iv != null ? (iv > 3 ? iv / 100 : iv) : null;

    return {
        id: makeId(),
        contractKey: row.contractKey,
        venue: bestVenue,
        side,
        quantity: 1,
        entryPrice: mid,
        currentMark: mid,
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
