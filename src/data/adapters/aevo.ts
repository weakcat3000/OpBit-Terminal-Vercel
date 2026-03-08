import { VenueAdapter, RawInstrument, RawQuote, makeVenueStatus } from "../index";
import { VenueStatus } from "../../core/types/options";
import { fetchJSON } from "../../core/utils/http";
import { cache, INSTRUMENTS_TTL, QUOTES_TTL } from "../../core/utils/cache";

// â”€â”€â”€ Aevo Public REST API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET https://api.aevo.xyz/markets?asset={ASSET}&instrument_type=OPTION
// Returns mark_price, greeks.iv, strike, expiry in nanoseconds, option_type

const AEVO_BASE = "https://api.aevo.xyz";

interface AevoMarket {
    instrument_id: string;
    instrument_name: string;
    instrument_type: string;
    underlying_asset: string;
    quote_asset: string;
    mark_price: string;
    forward_price: string;
    index_price: string;
    is_active: boolean;
    option_type: "call" | "put";
    expiry: string; // nanoseconds as string
    strike: string;
    greeks: {
        delta: string;
        theta: string;
        gamma: string;
        rho: string;
        vega: string;
        iv: string;
    };
}

interface AevoOrderbookSnapshot {
    bids?: Array<[string, string, string?]>;
    asks?: Array<[string, string, string?]>;
}

interface AevoBestLevel {
    price: number | null;
    size: number | null;
}

function parseExpiryNanos(expiryNs: string): string {
    // Aevo returns expiry in nanoseconds (e.g. "1772352000000000000")
    const ms = Number(BigInt(expiryNs) / BigInt(1_000_000));
    return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

// â”€â”€â”€ Adapter implementation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let currentStatus: VenueStatus = makeVenueStatus("AEVO", "ok");

export const aevoAdapter: VenueAdapter = {
    venue: "AEVO",

    async listInstruments({ underlying }): Promise<RawInstrument[]> {
        const cacheKey = `aevo:instruments:${underlying}`;
        return cache.wrap(cacheKey, INSTRUMENTS_TTL, async () => {
            try {
                const markets = await fetchJSON<AevoMarket[]>(
                    `${AEVO_BASE}/markets?asset=${underlying}&instrument_type=OPTION`
                );

                if (!Array.isArray(markets) || markets.length === 0) {
                    currentStatus = makeVenueStatus(
                        "AEVO",
                        "degraded",
                        "No options markets returned"
                    );
                    return [];
                }

                currentStatus = makeVenueStatus("AEVO", "ok");

                return markets
                    .filter((m) => m.is_active)
                    .map(
                        (m): RawInstrument => ({
                            id: m.instrument_name,
                            underlying: m.underlying_asset,
                            expiry: parseExpiryNanos(m.expiry),
                            strike: parseFloat(m.strike),
                            right: m.option_type === "call" ? "C" : "P",
                            quoteType: "ORDERBOOK",
                        })
                    );
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "AEVO",
                    "down",
                    err instanceof Error ? err.message : "Unknown error"
                );
                return [];
            }
        });
    },

    async getQuotes({ underlying, expiry }): Promise<RawQuote[]> {
        const cacheKey = `aevo:quotes:${underlying}:${expiry ?? "ALL"}`;
        return cache.wrap(cacheKey, QUOTES_TTL, async () => {
            try {
                const markets = await fetchJSON<AevoMarket[]>(
                    `${AEVO_BASE}/markets?asset=${underlying}&instrument_type=OPTION`,
                    {
                        throttleKey: `aevo:markets:${underlying}`,
                        minIntervalMs: 120,
                    }
                );

                if (!Array.isArray(markets) || markets.length === 0) {
                    currentStatus = makeVenueStatus(
                        "AEVO",
                        "degraded",
                        "No options markets returned"
                    );
                    return [];
                }

                const filtered = markets.filter((m) => {
                    if (!m.is_active) return false;
                    if (!expiry) return true;
                    return parseExpiryNanos(m.expiry) === expiry;
                });

                if (filtered.length === 0) {
                    currentStatus = makeVenueStatus(
                        "AEVO",
                        "degraded",
                        expiry ? `No active options for expiry ${expiry}` : "No active options returned"
                    );
                    return [];
                }

                let degraded = false;

                const quotes = await mapWithConcurrency(filtered, 8, async (m): Promise<RawQuote> => {
                    const markPrice = parsePositiveOrNull(m.mark_price);
                    const iv = parseNumberOrNull(m.greeks.iv);
                    let orderbook: AevoOrderbookSnapshot | null = null;
                    const warnings: string[] = [];
                    try {
                        orderbook = await cache.wrap(
                            `aevo:orderbook:${m.instrument_name}`,
                            QUOTES_TTL,
                            () =>
                                fetchJSON<AevoOrderbookSnapshot>(
                                    `${AEVO_BASE}/orderbook?instrument_name=${encodeURIComponent(m.instrument_name)}`,
                                    {
                                        throttleKey: `aevo:orderbook:${underlying}`,
                                        minIntervalMs: 120,
                                    }
                                )
                        );
                    } catch {
                        degraded = true;
                        warnings.push("AEVO_ORDERBOOK_UNAVAILABLE_MARK_FALLBACK");
                    }

                    const bestBid = bestLevelFromLevels(orderbook?.bids);
                    const bestAsk = bestLevelFromLevels(orderbook?.asks);
                    const bid = bestBid.price;
                    const ask = bestAsk.price;
                    const bookMid = bid != null && ask != null ? (bid + ask) / 2 : null;
                    const midPrice = bookMid ?? markPrice;

                    if (bid == null || ask == null) {
                        degraded = true;
                        if (midPrice != null) {
                            warnings.push("AEVO_MARK_ONLY_MID");
                        } else {
                            warnings.push("AEVO_NO_EXECUTABLE_QUOTE");
                        }
                    }

                    return {
                        instrumentId: m.instrument_name,
                        bid,
                        ask,
                        bidSize: bestBid.size,
                        askSize: bestAsk.size,
                        last: null,
                        markIv: iv, // Aevo returns IV as decimal (0.6357 = 63.57%)
                        delta: parseNumberOrNull(m.greeks?.delta),
                        gamma: parseNumberOrNull(m.greeks?.gamma),
                        theta: parseNumberOrNull(m.greeks?.theta),
                        vega: parseNumberOrNull(m.greeks?.vega),
                        rho: parseNumberOrNull(m.greeks?.rho),
                        openInterest: null,
                        underlyingPrice: parseNumberOrNull(m.index_price),
                        midPrice,
                        quoteType: "ORDERBOOK",
                        warnings: warnings.length > 0 ? warnings : undefined,
                    };
                });

                currentStatus = makeVenueStatus(
                    "AEVO",
                    "ok",
                    degraded ? "Mark-only fallback on some strikes" : undefined
                );

                return quotes;
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "AEVO",
                    "down",
                    err instanceof Error ? err.message : "Unknown error"
                );
                return [];
            }
        });
    },

    getStatus(): VenueStatus {
        return currentStatus;
    },
};

function parseNumberOrNull(value: string | number | null | undefined): number | null {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function parsePositiveOrNull(value: string | number | null | undefined): number | null {
    const parsed = parseNumberOrNull(value);
    if (parsed == null || parsed <= 0) return null;
    return parsed;
}

function bestLevelFromLevels(levels: Array<[string, string, string?]> | undefined): AevoBestLevel {
    if (!Array.isArray(levels) || levels.length === 0) return { price: null, size: null };
    for (const level of levels) {
        if (!Array.isArray(level)) continue;
        const price = parsePositiveOrNull(level[0]);
        if (price != null) {
            const size = parsePositiveOrNull(level[1]);
            return { price, size };
        }
    }
    return { price: null, size: null };
}

async function mapWithConcurrency<TInput, TResult>(
    items: TInput[],
    concurrency: number,
    mapper: (item: TInput, index: number) => Promise<TResult>
): Promise<TResult[]> {
    const results = new Array<TResult>(items.length);
    let cursor = 0;

    async function worker(): Promise<void> {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await mapper(items[index], index);
        }
    }

    const poolSize = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return results;
}

