import { Venue } from "../core/types/venues";
import { NormalizedOption, makeContractKey, Right } from "../core/types/options";
import { RawInstrument, RawQuote } from "../data/index";
import { parseDeribitInstrumentName } from "../core/utils/time";

function getRawMid(quote: RawQuote | undefined): number | null {
    const record = quote as Record<string, unknown> | undefined;
    const direct = record?.midPrice;
    if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
        return direct;
    }
    return null;
}

function positiveOrNull(value: number | null | undefined): number | null {
    if (value == null) return null;
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

function finiteOrNull(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value;
}

function positiveUnknown(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
    return value;
}

export function normalizeInstrumentsAndQuotes(
    venue: Venue,
    rawInstruments: RawInstrument[],
    rawQuotes: RawQuote[]
): NormalizedOption[] {
    const quoteMap = new Map<string, RawQuote>();
    for (const q of rawQuotes) {
        quoteMap.set(q.instrumentId, q);
    }

    const results: NormalizedOption[] = [];

    for (const inst of rawInstruments) {
        const warnings: string[] = [...(inst.warnings ?? [])];
        const quote = quoteMap.get(inst.id);

        let underlying = inst.underlying;
        let expiry = inst.expiry;
        let strike = inst.strike;
        let right: Right = inst.right;

        if (venue === "DERIBIT" && inst.id) {
            try {
                const parsed = parseDeribitInstrumentName(inst.id);
                underlying = parsed.underlying;
                expiry = parsed.expiry;
                strike = parsed.strike;
                right = parsed.right;
            } catch {
                warnings.push(`Could not parse instrument name: ${inst.id}`);
            }
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry !== "-") {
            warnings.push(`Invalid expiry format: ${expiry}`);
        }

        const bid = positiveOrNull(quote?.bid);
        const ask = positiveOrNull(quote?.ask);
        const midFromBook =
            bid != null && ask != null ? (bid + ask) / 2 : null;
        const mid = midFromBook ?? positiveOrNull(quote?.last) ?? getRawMid(quote) ?? null;

        const markIv = quote?.markIv ?? null;
        const delta = finiteOrNull(quote?.delta);
        const gamma = finiteOrNull(quote?.gamma);
        const theta = finiteOrNull(quote?.theta);
        const vega = finiteOrNull(quote?.vega);
        const rho = finiteOrNull(quote?.rho);
        const bidSize = positiveUnknown((quote as Record<string, unknown> | undefined)?.bidSize);
        const askSize = positiveUnknown((quote as Record<string, unknown> | undefined)?.askSize);
        const openInterest = quote?.openInterest ?? null;
        const last = quote?.last ?? null;

        if (quote?.warnings?.length) {
            warnings.push(...quote.warnings);
        }

        if (!quote) {
            warnings.push("NO_QUOTE_DATA");
        }

        if (bid == null && ask == null && mid == null) {
            warnings.push("NO_BID_ASK_OR_MID");
        }

        const contractKey = makeContractKey(underlying, expiry, strike, right);

        results.push({
            venue,
            underlying,
            expiry,
            strike,
            right,
            bid,
            ask,
            bidSize,
            askSize,
            mid,
            markIv,
            delta,
            gamma,
            theta,
            vega,
            rho,
            openInterest,
            last,
            updatedAt: Date.now(),
            contractKey,
            rawId: inst.id,
            contractMultiplier: inst.contractMultiplier,
            quoteType: quote?.quoteType ?? inst.quoteType,
            warnings: warnings.length > 0 ? Array.from(new Set(warnings)) : undefined,
        });
    }

    return results;
}

