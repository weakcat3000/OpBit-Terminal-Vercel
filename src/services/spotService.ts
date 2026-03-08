import { cache } from "../core/utils/cache";
import { getJSON } from "../core/utils/http";
import { fetchWithRetry } from "../core/utils/http";
import { env } from "../core/config/env";

interface BinanceTickerPrice {
    symbol: string;
    price: string;
}

interface CoinbaseSpotResponse {
    data?: {
        amount?: string;
    };
}

interface YahooOptionChainResponse {
    optionChain?: {
        result?: Array<{
            quote?: {
                regularMarketPrice?: number;
                postMarketPrice?: number;
                marketState?: string;
            };
        }>;
        error?: {
            code?: string;
            description?: string;
        } | null;
    };
}

export interface SpotResponse {
    updatedAt: number;
    spots: Record<string, number | null>;
    sources: Record<string, string>;
    marketStates: Record<string, string | null>;
}

function toNumber(value: string | number | undefined): number | null {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

const YAHOO_COOKIE_URL = "https://fc.yahoo.com";
const YAHOO_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const YAHOO_OPTIONS_URL = "https://query2.finance.yahoo.com/v7/finance/options/IBIT";
const YAHOO_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const YAHOO_SESSION_TTL_MS = 30 * 60 * 1000;

interface YahooSession {
    cookieHeader: string;
    crumb: string;
    expiresAt: number;
}

let yahooSessionCache: YahooSession | null = null;

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

    const cookieResp = await fetchWithRetry(
        YAHOO_COOKIE_URL,
        {
            method: "GET",
            headers: {
                "User-Agent": YAHOO_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        },
        {
            throttleKey: "spot:yahoo:cookie",
            minIntervalMs: 120,
        }
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
        {
            throttleKey: "spot:yahoo:crumb",
            minIntervalMs: 120,
        }
    );

    if (!crumbResp.ok) {
        throw new Error(`Yahoo crumb request failed: HTTP ${crumbResp.status}`);
    }

    const crumb = (await crumbResp.text()).trim();
    if (!crumb) {
        throw new Error("Yahoo crumb is empty");
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

async function fetchIbitSpotYahoo(): Promise<{ value: number | null; marketState: string | null }> {
    const attempt = async (forceRefreshSession: boolean): Promise<{ value: number | null; marketState: string | null }> => {
        const session = await getYahooSession(forceRefreshSession);
        const params = new URLSearchParams({ crumb: session.crumb });

        const response = await fetchWithRetry(
            `${YAHOO_OPTIONS_URL}?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    "User-Agent": YAHOO_USER_AGENT,
                    "Accept": "application/json,text/plain,*/*",
                    "Cookie": session.cookieHeader,
                },
            },
            {
                throttleKey: "spot:yahoo:options:IBIT",
                minIntervalMs: 120,
            }
        );

        if ((response.status === 401 || response.status === 403) && !forceRefreshSession) {
            yahooSessionCache = null;
            return attempt(true);
        }

        if (!response.ok) {
            throw new Error(`Yahoo options request failed: HTTP ${response.status}`);
        }

        const json = (await response.json()) as YahooOptionChainResponse;
        const error = json.optionChain?.error;
        if (error?.description && error.description.toLowerCase().includes("invalid crumb") && !forceRefreshSession) {
            yahooSessionCache = null;
            return attempt(true);
        }

        const quote = json.optionChain?.result?.[0]?.quote;
        if (!quote) return { value: null, marketState: null };

        const regular = typeof quote.regularMarketPrice === "number" ? quote.regularMarketPrice : null;
        const post = typeof quote.postMarketPrice === "number" ? quote.postMarketPrice : null;
        const marketState = typeof quote.marketState === "string" ? quote.marketState.toUpperCase() : null;
        return { value: regular ?? post ?? null, marketState };
    };

    return attempt(false);
}

async function fetchBinanceSpots(symbols: string[]): Promise<Record<string, number | null>> {
    const quoteSymbols = symbols
        .filter((s) => s === "BTC" || s === "ETH")
        .map((s) => `${s}USDT`);

    if (quoteSymbols.length === 0) {
        return {};
    }

    const encoded = encodeURIComponent(JSON.stringify(quoteSymbols));
    let data: BinanceTickerPrice[] | null = null;
    const urls = [
        `https://api.binance.com/api/v3/ticker/price?symbols=${encoded}`,
        `https://api.binance.us/api/v3/ticker/price?symbols=${encoded}`,
    ];

    for (const url of urls) {
        try {
            data = await getJSON<BinanceTickerPrice[]>(
                url,
                {
                    throttleKey: "spot:binance",
                    minIntervalMs: 120,
                }
            );
            break;
        } catch {
            // Try next provider endpoint.
        }
    }

    if (!data) {
        throw new Error("No Binance endpoint available for spot quotes");
    }

    const result: Record<string, number | null> = {};
    for (const row of data) {
        if (row.symbol === "BTCUSDT") result.BTC = toNumber(row.price);
        if (row.symbol === "ETHUSDT") result.ETH = toNumber(row.price);
    }

    return result;
}

async function fetchCoinbaseSpots(symbols: string[]): Promise<Record<string, number | null>> {
    const out: Record<string, number | null> = {};
    const supported = symbols.filter((s) => s === "BTC" || s === "ETH");
    for (const symbol of supported) {
        try {
            const response = await getJSON<CoinbaseSpotResponse>(
                `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`,
                {
                    throttleKey: "spot:coinbase",
                    minIntervalMs: 120,
                }
            );
            out[symbol] = toNumber(response.data?.amount);
        } catch {
            out[symbol] = null;
        }
    }
    return out;
}

async function fetchIbitSpot(): Promise<{ value: number | null; source: string; marketState: string | null }> {
    if (!env.ibitEnabled) {
        return { value: null, source: "disabled", marketState: null };
    }

    try {
        const yahoo = await fetchIbitSpotYahoo();
        return { value: yahoo.value, source: "yahoo", marketState: yahoo.marketState };
    } catch {
        return { value: null, source: "fallback", marketState: null };
    }
}

export async function getSpots(symbols: string[]): Promise<SpotResponse> {
    const normalizedSymbols = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
    const cacheKey = `spot:${normalizedSymbols.sort().join(",")}`;

    return cache.wrap(cacheKey, env.spotCacheTtlMs, async () => {
        const spots: Record<string, number | null> = {};
        const sources: Record<string, string> = {};
        const marketStates: Record<string, string | null> = {};

        let primarySpots: Record<string, number | null> = {};
        let primarySource = "binance";
        try {
            primarySpots = await fetchBinanceSpots(normalizedSymbols);
        } catch {
            primarySpots = await fetchCoinbaseSpots(normalizedSymbols);
            primarySource = "coinbase";
        }

        for (const symbol of normalizedSymbols) {
            if (symbol === "BTC" || symbol === "ETH") {
                spots[symbol] = primarySpots[symbol] ?? null;
                sources[symbol] = spots[symbol] != null ? primarySource : "unavailable";
                marketStates[symbol] = null;
                continue;
            }

            if (symbol === "IBIT") {
                const ibit = await fetchIbitSpot();
                spots.IBIT = ibit.value;
                sources.IBIT = ibit.source;
                marketStates.IBIT = ibit.marketState;
                continue;
            }

            spots[symbol] = null;
            sources[symbol] = "unknown";
            marketStates[symbol] = null;
        }

        return {
            updatedAt: Date.now(),
            spots,
            sources,
            marketStates,
        };
    });
}

