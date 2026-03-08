import { VenueAdapter, RawInstrument, RawQuote, makeVenueStatus } from "../index";
import { VenueStatus } from "../../core/types/options";
import { fetchJSON } from "../../core/utils/http";
import { cache, INSTRUMENTS_TTL, QUOTES_TTL } from "../../core/utils/cache";
import { parseDeribitInstrumentName } from "../../core/utils/time";

const BASE_URL = "https://www.deribit.com/api/v2/public";

// â”€â”€â”€ Deribit API response types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DeribitInstrument {
    instrument_name: string;
    base_currency: string;
    expiration_timestamp: number;
    strike: number;
    option_type: "call" | "put";
    is_active: boolean;
    kind: string;
}

interface DeribitBookSummary {
    instrument_name: string;
    bid_price: number | null;
    ask_price: number | null;
    last: number | null;
    mark_iv: number | null;
    open_interest: number;
    underlying_price: number;
    mid_price: number | null;
}

interface DeribitResponse<T> {
    result: T;
}

// â”€â”€â”€ Adapter implementation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let currentStatus: VenueStatus = makeVenueStatus("DERIBIT", "ok");

export const deribitAdapter: VenueAdapter = {
    venue: "DERIBIT",

    async listInstruments({ underlying }): Promise<RawInstrument[]> {
        const cacheKey = `deribit:instruments:${underlying}`;
        return cache.wrap(cacheKey, INSTRUMENTS_TTL, async () => {
            try {
                const url = `${BASE_URL}/get_instruments?currency=${underlying}&kind=option&expired=false`;
                const data = await fetchJSON<DeribitResponse<DeribitInstrument[]>>(url);
                currentStatus = makeVenueStatus("DERIBIT", "ok");

                return data.result
                    .filter((i) => i.is_active)
                    .map((i): RawInstrument => {
                        const parsed = parseDeribitInstrumentName(i.instrument_name);
                        return {
                            id: i.instrument_name,
                            underlying: parsed.underlying,
                            expiry: parsed.expiry,
                            strike: parsed.strike,
                            right: parsed.right,
                            quoteType: "ORDERBOOK",
                        };
                    });
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "DERIBIT",
                    "down",
                    err instanceof Error ? err.message : "Unknown error"
                );
                return [];
            }
        });
    },

    async getQuotes({ underlying }): Promise<RawQuote[]> {
        const cacheKey = `deribit:quotes:${underlying}`;
        return cache.wrap(cacheKey, QUOTES_TTL, async () => {
            try {
                const url = `${BASE_URL}/get_book_summary_by_currency?currency=${underlying}&kind=option`;
                const data = await fetchJSON<DeribitResponse<DeribitBookSummary[]>>(url);
                currentStatus = makeVenueStatus("DERIBIT", "ok");

                return data.result.map((q): RawQuote => {
                    // Deribit returns prices in underlying units; bid/ask may be 0 meaning no quote
                    const bid = q.bid_price && q.bid_price > 0
                        ? q.bid_price * q.underlying_price
                        : null;
                    const ask = q.ask_price && q.ask_price > 0
                        ? q.ask_price * q.underlying_price
                        : null;

                    return {
                        instrumentId: q.instrument_name,
                        bid,
                        ask,
                        last: q.last != null ? q.last * q.underlying_price : null,
                        markIv: q.mark_iv != null ? q.mark_iv / 100 : null, // convert from pct to decimal
                        openInterest: q.open_interest ?? null,
                        underlyingPrice: q.underlying_price,
                        midPrice: q.mid_price != null ? q.mid_price * q.underlying_price : null,
                        quoteType: "ORDERBOOK",
                    };
                });
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "DERIBIT",
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

