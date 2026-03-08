import { VenueAdapter, RawInstrument, RawQuote, makeVenueStatus } from "../index";
import { VenueStatus } from "../../core/types/options";
import { cache, INSTRUMENTS_TTL, QUOTES_TTL_CRYPTO } from "../../core/utils/cache";
import { postJSON } from "../../core/utils/http";
import { env, missingRequiredEnvForVenue, venueEnabled } from "../../core/config/env";
import { toDateString } from "../../core/utils/time";

interface LyraEnvelope<T> {
    result?: T;
    error?: {
        code?: number;
        message?: string;
        data?: unknown;
    };
}

interface LyraInstrument {
    instrument_type: string;
    instrument_name: string;
    is_active: boolean;
    base_currency: string;
    option_details: {
        expiry: number;
        strike: string;
        option_type: "C" | "P";
    };
}

interface LyraTicker {
    a?: string;
    b?: string;
    M?: string;
    stats?: {
        oi?: string;
    };
    option_pricing?: {
        i?: string;
        m?: string;
        d?: string;
        t?: string;
        g?: string;
        v?: string;
        r?: string;
    };
}

interface LyraTickersResult {
    tickers: Record<string, LyraTicker>;
}

let currentStatus: VenueStatus = makeVenueStatus("LYRA_V2", "degraded", "Not initialized");

function parsePositiveOrNull(raw?: string | null): number | null {
    if (raw == null) return null;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

function parseFiniteOrNull(raw?: string | null): number | null {
    if (raw == null) return null;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return null;
    return value;
}

function parseUnknownPositiveOrNull(raw: unknown): number | null {
    if (raw == null) return null;
    if (typeof raw === "number") {
        return Number.isFinite(raw) && raw > 0 ? raw : null;
    }
    if (typeof raw === "string") {
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }
    return null;
}

function parseTickerSize(ticker: LyraTicker, side: "bid" | "ask"): number | null {
    const payload = ticker as Record<string, unknown>;
    const candidates = side === "bid"
        ? [
            payload.best_bid_amount,
            payload.bid_size,
            payload.bid_amount,
            payload.bid_qty,
            payload.B,
            payload.bq,
            payload.bs,
        ]
        : [
            payload.best_ask_amount,
            payload.ask_size,
            payload.ask_amount,
            payload.ask_qty,
            payload.A,
            payload.aq,
            payload.as,
        ];

    for (const candidate of candidates) {
        const size = parseUnknownPositiveOrNull(candidate);
        if (size != null) return size;
    }
    return null;
}

function disabledOrMissingStatus(): VenueStatus | null {
    if (!venueEnabled("LYRA_V2")) {
        return makeVenueStatus("LYRA_V2", "degraded", "LYRA_ENABLED=false");
    }

    const missing = missingRequiredEnvForVenue("LYRA_V2");
    if (missing.length > 0) {
        return makeVenueStatus("LYRA_V2", "degraded", `Missing env: ${missing.join(", ")}`);
    }

    return null;
}

function toExpiryDateCode(yyyyMmDd: string): string {
    const [y, m, d] = yyyyMmDd.split("-");
    return `${y}${m}${d}`;
}

async function fetchInstruments(underlying: string): Promise<LyraInstrument[]> {
    const payload = {
        currency: underlying,
        instrument_type: "option",
        expired: false,
    };

    const response = await postJSON<LyraEnvelope<LyraInstrument[]>, typeof payload>(
        `${env.lyraApiBase}/public/get_instruments`,
        payload,
        {
            throttleKey: `lyra:instruments:${underlying}`,
            minIntervalMs: 120,
        }
    );

    if (response.error) {
        throw new Error(response.error.message || "Lyra instruments error");
    }

    return response.result ?? [];
}

async function fetchTickersByExpiry(
    underlying: string,
    expiryYmd: string
): Promise<Record<string, LyraTicker>> {
    const payload = {
        currency: underlying,
        instrument_type: "option",
        expiry_date: toExpiryDateCode(expiryYmd),
    };

    const response = await postJSON<LyraEnvelope<LyraTickersResult>, typeof payload>(
        `${env.lyraApiBase}/public/get_tickers`,
        payload,
        {
            throttleKey: `lyra:tickers:${underlying}`,
            minIntervalMs: 120,
        }
    );

    if (response.error) {
        throw new Error(response.error.message || "Lyra tickers error");
    }

    return response.result?.tickers ?? {};
}

export const lyraV2Adapter: VenueAdapter = {
    venue: "LYRA_V2",

    async listInstruments({ underlying }): Promise<RawInstrument[]> {
        const disabledStatus = disabledOrMissingStatus();
        if (disabledStatus) {
            currentStatus = disabledStatus;
            return [];
        }

        const u = underlying.toUpperCase();
        if (u !== "BTC" && u !== "ETH") {
            currentStatus = makeVenueStatus("LYRA_V2", "degraded", `Unsupported underlying: ${u}`);
            return [];
        }

        const cacheKey = `lyra:instruments:${u}`;
        return cache.wrap(cacheKey, INSTRUMENTS_TTL, async () => {
            try {
                const instruments = await fetchInstruments(u);
                const mapped = instruments
                    .filter((i) => i.instrument_type === "option" && i.base_currency.toUpperCase() === u)
                    .map((i): RawInstrument => ({
                        id: i.instrument_name,
                        underlying: u,
                        expiry: toDateString(i.option_details.expiry),
                        strike: Number.parseFloat(i.option_details.strike),
                        right: i.option_details.option_type,
                        quoteType: "AMM",
                    }));

                const hasInactive = mapped.length === 0;
                currentStatus = hasInactive
                    ? makeVenueStatus("LYRA_V2", "degraded", "No active options returned")
                    : makeVenueStatus("LYRA_V2", "ok");

                return mapped;
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "LYRA_V2",
                    "down",
                    err instanceof Error ? err.message : "Unknown Lyra error"
                );
                return [];
            }
        });
    },

    async getQuotes({ underlying, expiry }): Promise<RawQuote[]> {
        const disabledStatus = disabledOrMissingStatus();
        if (disabledStatus) {
            currentStatus = disabledStatus;
            return [];
        }

        const u = underlying.toUpperCase();
        if (u !== "BTC" && u !== "ETH") {
            currentStatus = makeVenueStatus("LYRA_V2", "degraded", `Unsupported underlying: ${u}`);
            return [];
        }

        const cacheKey = `lyra:quotes:${u}:${expiry ?? "ALL"}`;
        return cache.wrap(cacheKey, QUOTES_TTL_CRYPTO, async () => {
            try {
                const expiries = new Set<string>();

                if (expiry) {
                    expiries.add(expiry);
                } else {
                    const instruments = await fetchInstruments(u);
                    for (const inst of instruments) {
                        if (!inst.option_details?.expiry) continue;
                        expiries.add(toDateString(inst.option_details.expiry));
                    }
                }

                const quoteList: RawQuote[] = [];
                let degraded = false;

                for (const exp of expiries) {
                    const tickers = await fetchTickersByExpiry(u, exp);

                    for (const [instrumentName, ticker] of Object.entries(tickers)) {
                        const rawBid = ticker.b != null ? Number.parseFloat(ticker.b) : null;
                        const rawAsk = ticker.a != null ? Number.parseFloat(ticker.a) : null;
                        const bid = parsePositiveOrNull(ticker.b);
                        const ask = parsePositiveOrNull(ticker.a);
                        const mark = ticker.option_pricing?.m ?? ticker.M;
                        const markMid = parsePositiveOrNull(mark ?? null);
                        const iv = ticker.option_pricing?.i != null
                            ? Number.parseFloat(ticker.option_pricing.i)
                            : null;

                        const warnings: string[] = [];
                        if (rawBid != null && rawBid <= 0) {
                            warnings.push("LYRA_NON_POSITIVE_BID_IGNORED");
                            degraded = true;
                        }
                        if (rawAsk != null && rawAsk <= 0) {
                            warnings.push("LYRA_NON_POSITIVE_ASK_IGNORED");
                            degraded = true;
                        }
                        if (bid == null && ask == null && markMid != null) {
                            warnings.push("LYRA_MARK_ONLY_MID");
                            degraded = true;
                        }
                        if ((bid == null || ask == null) && markMid != null) {
                            warnings.push("LYRA_PARTIAL_BOOK_MARK_MID");
                            degraded = true;
                        }
                        if (bid == null && ask == null && markMid == null) {
                            warnings.push("LYRA_NO_EXECUTABLE_QUOTE");
                            degraded = true;
                        }

                        quoteList.push({
                            instrumentId: instrumentName,
                            bid,
                            ask,
                            bidSize: parseTickerSize(ticker, "bid"),
                            askSize: parseTickerSize(ticker, "ask"),
                            last: null,
                            markIv: iv,
                            delta: parseFiniteOrNull(ticker.option_pricing?.d ?? null),
                            gamma: parseFiniteOrNull(ticker.option_pricing?.g ?? null),
                            theta: parseFiniteOrNull(ticker.option_pricing?.t ?? null),
                            vega: parseFiniteOrNull(ticker.option_pricing?.v ?? null),
                            rho: parseFiniteOrNull(ticker.option_pricing?.r ?? null),
                            openInterest: ticker.stats?.oi != null
                                ? Number.parseFloat(ticker.stats.oi)
                                : null,
                            midPrice: markMid,
                            quoteType: "AMM",
                            warnings,
                        });
                    }
                }

                if (quoteList.length === 0) {
                    currentStatus = makeVenueStatus("LYRA_V2", "degraded", "No quote data returned");
                } else {
                    currentStatus = makeVenueStatus(
                        "LYRA_V2",
                        "ok",
                        degraded ? "Mark-only fallback on some strikes" : undefined
                    );
                }

                return quoteList;
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "LYRA_V2",
                    "down",
                    err instanceof Error ? err.message : "Unknown Lyra error"
                );
                return [];
            }
        });
    },

    getStatus(): VenueStatus {
        return currentStatus;
    },
};

