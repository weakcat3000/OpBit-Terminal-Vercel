import { VenueAdapter, RawInstrument, RawQuote, makeVenueStatus } from "../index";
import { VenueStatus } from "../../core/types/options";
import { cache, QUOTES_TTL_TRADFI, IBIT_EXPIRIES_TTL } from "../../core/utils/cache";
import { fetchWithRetry } from "../../core/utils/http";
import { venueEnabled } from "../../core/config/env";
import { toDateString } from "../../core/utils/time";

interface YahooOptionChainResponse {
    optionChain?: {
        result?: YahooOptionResult[];
        error?: {
            code?: string;
            description?: string;
        } | null;
    };
}

interface YahooOptionResult {
    expirationDates?: number[];
    options?: YahooOptionSet[];
}

interface YahooOptionSet {
    calls?: YahooOptionContract[];
    puts?: YahooOptionContract[];
}

interface YahooOptionContract {
    contractSymbol?: string;
    strike?: number;
    expiration?: number;
    bid?: number;
    ask?: number;
    bidSize?: number;
    askSize?: number;
    lastPrice?: number;
    impliedVolatility?: number;
    openInterest?: number;
    volume?: number;
}

interface YahooSession {
    cookieHeader: string;
    crumb: string;
    expiresAt: number;
}

const YAHOO_SYMBOL = "IBIT";
const YAHOO_COOKIE_URL = "https://fc.yahoo.com";
const YAHOO_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const YAHOO_OPTIONS_URL = "https://query2.finance.yahoo.com/v7/finance/options";
const YAHOO_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const YAHOO_SESSION_TTL_MS = 30 * 60 * 1000;
const IBIT_MAX_EXPIRIES = 16;
const IBIT_INSTRUMENT_CHAIN_TTL_MS = 10 * 60 * 1000;

let currentStatus: VenueStatus = makeVenueStatus("IBIT", "degraded", "Not initialized");
let yahooSessionCache: YahooSession | null = null;

function toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeYahooIv(value: unknown): number | null {
    const iv = toNumber(value);
    if (iv == null || iv <= 0) return null;
    return iv > 3 ? iv / 100 : iv;
}

function splitSetCookieHeader(raw: string): string[] {
    return raw
        .split(/,(?=[^;,\s]+=)/g)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function extractCookieHeader(headers: Headers): string {
    const asWithGetter = headers as Headers & { getSetCookie?: () => string[] };
    const setCookies =
        typeof asWithGetter.getSetCookie === "function"
            ? asWithGetter.getSetCookie()
            : (() => {
                const raw = headers.get("set-cookie");
                return raw ? splitSetCookieHeader(raw) : [];
            })();

    const cookiePairs = setCookies
        .map((cookie) => cookie.split(";")[0]?.trim() ?? "")
        .filter((cookie) => cookie.length > 0);

    return Array.from(new Set(cookiePairs)).join("; ");
}

function mergeCookieHeaders(...cookies: Array<string | undefined>): string {
    const parts = cookies
        .flatMap((cookie) => (cookie ?? "").split(";"))
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    return Array.from(new Set(parts)).join("; ");
}

async function getYahooSession(forceRefresh = false): Promise<YahooSession> {
    if (!forceRefresh && yahooSessionCache && yahooSessionCache.expiresAt > Date.now()) {
        return yahooSessionCache;
    }

    const baseHeaders = {
        "User-Agent": YAHOO_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };

    const cookieResp = await fetchWithRetry(
        YAHOO_COOKIE_URL,
        { method: "GET", headers: baseHeaders },
        { throttleKey: "yahoo:cookie", minIntervalMs: 150 }
    );

    const cookieHeader = extractCookieHeader(cookieResp.headers);
    if (!cookieHeader) {
        throw new Error("Yahoo session cookie unavailable");
    }

    const crumbResp = await fetchWithRetry(
        YAHOO_CRUMB_URL,
        {
            method: "GET",
            headers: {
                "User-Agent": YAHOO_USER_AGENT,
                "Accept": "text/plain,*/*",
                "Cookie": cookieHeader,
            },
        },
        { throttleKey: "yahoo:crumb", minIntervalMs: 150 }
    );

    if (!crumbResp.ok) {
        throw new Error(`Yahoo crumb request failed: HTTP ${crumbResp.status}`);
    }

    const crumb = (await crumbResp.text()).trim();
    if (!crumb) {
        throw new Error("Yahoo crumb response was empty");
    }

    const crumbCookieHeader = extractCookieHeader(crumbResp.headers);
    const mergedCookieHeader = mergeCookieHeaders(cookieHeader, crumbCookieHeader);

    yahooSessionCache = {
        cookieHeader: mergedCookieHeader,
        crumb,
        expiresAt: Date.now() + YAHOO_SESSION_TTL_MS,
    };

    return yahooSessionCache;
}

async function fetchYahooOptions(symbol: string, expiryEpoch?: number): Promise<YahooOptionResult> {
    const doFetch = async (forceRefreshSession: boolean): Promise<YahooOptionResult> => {
        const session = await getYahooSession(forceRefreshSession);
        const params = new URLSearchParams({
            crumb: session.crumb,
        });
        if (expiryEpoch != null) {
            params.set("date", String(expiryEpoch));
        }

        const response = await fetchWithRetry(
            `${YAHOO_OPTIONS_URL}/${encodeURIComponent(symbol)}?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    "User-Agent": YAHOO_USER_AGENT,
                    "Accept": "application/json,text/plain,*/*",
                    "Cookie": session.cookieHeader,
                },
            },
            {
                throttleKey: `yahoo:options:${symbol}`,
                minIntervalMs: 150,
            }
        );

        if ((response.status === 401 || response.status === 403) && !forceRefreshSession) {
            yahooSessionCache = null;
            return doFetch(true);
        }

        if (!response.ok) {
            throw new Error(`Yahoo options request failed: HTTP ${response.status}`);
        }

        const json = (await response.json()) as YahooOptionChainResponse;
        const error = json.optionChain?.error;
        if (error?.description) {
            const description = String(error.description);
            if (description.toLowerCase().includes("invalid crumb") && !forceRefreshSession) {
                yahooSessionCache = null;
                return doFetch(true);
            }
            throw new Error(`Yahoo options error: ${description}`);
        }

        const result = json.optionChain?.result?.[0];
        if (!result) {
            throw new Error("Yahoo options returned no result");
        }
        return result;
    };

    return doFetch(false);
}

function toExpiryEpoch(expiry: string): number {
    const ms = Date.parse(`${expiry}T00:00:00.000Z`);
    if (!Number.isFinite(ms)) {
        throw new Error(`Invalid IBIT expiry: ${expiry}`);
    }
    return Math.floor(ms / 1000);
}

function buildIbitRows(
    optionSet: YahooOptionSet,
    expiryFallback: string
): { instruments: RawInstrument[]; quotes: RawQuote[] } {
    const instruments: RawInstrument[] = [];
    const quotes: RawQuote[] = [];

    const pushContract = (contract: YahooOptionContract, right: "C" | "P") => {
        const strike = toNumber(contract.strike);
        if (strike == null) return;

        const expiry =
            typeof contract.expiration === "number" && Number.isFinite(contract.expiration)
                ? toDateString(contract.expiration)
                : expiryFallback;
        const instrumentId =
            contract.contractSymbol?.trim() || `IBIT-${expiry}-${strike}-${right}`;
        const warnings = ["DELAYED_DATA"];
        const bidSizeRaw = toNumber(contract.bidSize);
        const askSizeRaw = toNumber(contract.askSize);
        const volume = toNumber(contract.volume);
        const openInterest = toNumber(contract.openInterest);
        const liquidityProxy = (volume != null && volume > 0 ? volume : null) ??
            (openInterest != null && openInterest > 0 ? openInterest : null);
        const bid = toNumber(contract.bid);
        const ask = toNumber(contract.ask);

        let bidSize = bidSizeRaw;
        let askSize = askSizeRaw;
        if ((bidSize == null || askSize == null) && liquidityProxy != null) {
            const bidPx = bid ?? 0;
            const askPx = ask ?? 0;
            const totalPx = bidPx + askPx;
            if (totalPx > 0) {
                // Estimate side-specific depth from quote skew instead of mirroring one number to both sides.
                if (bidSize == null) {
                    bidSize = Math.max(1, Math.round(liquidityProxy * (bidPx / totalPx)));
                }
                if (askSize == null) {
                    askSize = Math.max(1, Math.round(liquidityProxy * (askPx / totalPx)));
                }
            } else {
                if (bidSize == null) bidSize = liquidityProxy;
                if (askSize == null) askSize = liquidityProxy;
            }
            warnings.push("SIZE_ESTIMATED_FROM_VOLUME_OI");
        }

        instruments.push({
            id: instrumentId,
            underlying: "IBIT",
            expiry,
            strike,
            right,
            contractMultiplier: 100,
            quoteType: "TRADFI",
            warnings,
        });

        quotes.push({
            instrumentId,
            bid,
            ask,
            bidSize,
            askSize,
            last: toNumber(contract.lastPrice),
            markIv: normalizeYahooIv(contract.impliedVolatility),
            openInterest,
            quoteType: "TRADFI",
            warnings,
        });
    };

    for (const contract of optionSet.calls ?? []) {
        pushContract(contract, "C");
    }
    for (const contract of optionSet.puts ?? []) {
        pushContract(contract, "P");
    }

    return { instruments, quotes };
}

async function fetchIbitExpiriesYahoo(): Promise<string[]> {
    const result = await fetchYahooOptions(YAHOO_SYMBOL);
    const epochs = result.expirationDates ?? [];
    return epochs
        .filter((epoch) => Number.isFinite(epoch))
        .map((epoch) => toDateString(epoch))
        .sort();
}

async function fetchIbitChainYahoo(expiry: string): Promise<{ instruments: RawInstrument[]; quotes: RawQuote[] }> {
    const result = await fetchYahooOptions(YAHOO_SYMBOL, toExpiryEpoch(expiry));
    const optionSet = result.options?.[0] ?? { calls: [], puts: [] };
    return buildIbitRows(optionSet, expiry);
}

function disabledStatus(): VenueStatus | null {
    if (!venueEnabled("IBIT")) {
        return makeVenueStatus("IBIT", "degraded", "IBIT_ENABLED=false");
    }
    return null;
}

export const ibitAdapter: VenueAdapter = {
    venue: "IBIT",

    async listInstruments({ underlying }): Promise<RawInstrument[]> {
        const disabled = disabledStatus();
        if (disabled) {
            currentStatus = disabled;
            return [];
        }

        const u = underlying.toUpperCase();
        if (u !== "IBIT") {
            currentStatus = makeVenueStatus("IBIT", "degraded", `Unsupported underlying: ${u}`);
            return [];
        }

        const cacheKey = "ibit:yahoo:instruments";
        return cache.wrap(cacheKey, IBIT_EXPIRIES_TTL, async () => {
            try {
                const expiries = await cache.wrap(
                    "ibit:yahoo:expiries",
                    IBIT_EXPIRIES_TTL,
                    () => fetchIbitExpiriesYahoo()
                );

                if (expiries.length === 0) {
                    currentStatus = makeVenueStatus("IBIT", "degraded", "Yahoo returned no expiries");
                    return [];
                }

                const selectedExpiries = expiries.slice(0, IBIT_MAX_EXPIRIES);
                const instruments: RawInstrument[] = [];

                for (const expiry of selectedExpiries) {
                    const chain = await cache.wrap(
                        `ibit:yahoo:instrument-chain:${expiry}`,
                        IBIT_INSTRUMENT_CHAIN_TTL_MS,
                        () => fetchIbitChainYahoo(expiry)
                    );
                    instruments.push(...chain.instruments);
                }

                currentStatus = makeVenueStatus("IBIT", "delayed", "Yahoo Finance delayed options feed");
                return instruments;
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "IBIT",
                    "down",
                    err instanceof Error ? err.message : "Unknown Yahoo error"
                );
                return [];
            }
        });
    },

    async getQuotes({ underlying, expiry }): Promise<RawQuote[]> {
        const disabled = disabledStatus();
        if (disabled) {
            currentStatus = disabled;
            return [];
        }

        const u = underlying.toUpperCase();
        if (u !== "IBIT") {
            currentStatus = makeVenueStatus("IBIT", "degraded", `Unsupported underlying: ${u}`);
            return [];
        }

        if (!expiry) {
            currentStatus = makeVenueStatus("IBIT", "delayed", "Yahoo Finance delayed options feed");
            return [];
        }

        return cache.wrap(`ibit:yahoo:quotes:${expiry}`, QUOTES_TTL_TRADFI, async () => {
            try {
                const chain = await fetchIbitChainYahoo(expiry);
                currentStatus = makeVenueStatus("IBIT", "delayed", "Yahoo Finance delayed options feed");
                return chain.quotes;
            } catch (err) {
                currentStatus = makeVenueStatus(
                    "IBIT",
                    "down",
                    err instanceof Error ? err.message : "Unknown Yahoo error"
                );
                return [];
            }
        });
    },

    getStatus(): VenueStatus {
        return currentStatus;
    },
};
