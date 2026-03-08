import { NextRequest, NextResponse } from "next/server";
import { fetchJSON } from "@/src/core/utils/http";
import { TTLCache } from "@/src/core/utils/cache";
import { env } from "@/src/core/config/env";

const tickerCache = new TTLCache();
const CACHE_KEY = "global_ticker";
const CACHE_TTL = env.tickerCacheTtlMs;

interface BinanceTicker {
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
}

interface CoinGeckoTicker {
    symbol: string;
    current_price: number;
    price_change_percentage_24h: number | null;
}

interface TickerItem {
    symbol: string;
    price: number;
    change24hPct: number;
}

const COINGECKO_ID_BY_SYMBOL: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    BNB: "binancecoin",
    XRP: "ripple",
    ADA: "cardano",
    DOGE: "dogecoin",
    AVAX: "avalanche-2",
    TON: "the-open-network",
    LINK: "chainlink",
};

function toBaseSymbol(usdtOrBase: string): string {
    return usdtOrBase.endsWith("USDT") ? usdtOrBase.replace("USDT", "") : usdtOrBase;
}

async function fetchBinanceTickers(requestedSymbols: string[]): Promise<TickerItem[] | null> {
    const encodedSymbols = encodeURIComponent(JSON.stringify(requestedSymbols));
    const urls = [
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodedSymbols}`,
        `https://api.binance.us/api/v3/ticker/24hr?symbols=${encodedSymbols}`,
    ];

    for (const url of urls) {
        try {
            const data = await fetchJSON<BinanceTicker[]>(url);
            return data.map((t) => {
                const displaySymbol = t.symbol.endsWith("USDT")
                    ? t.symbol.replace("USDT", "")
                    : t.symbol;

                return {
                    symbol: displaySymbol,
                    price: Number.parseFloat(t.lastPrice),
                    change24hPct: Number.parseFloat(t.priceChangePercent),
                };
            });
        } catch {
            // Try next endpoint.
        }
    }

    return null;
}

async function fetchCoinGeckoTickers(requestedSymbols: string[]): Promise<TickerItem[]> {
    const bases = requestedSymbols.map(toBaseSymbol);
    const ids = Array.from(new Set(
        bases
            .map((s) => COINGECKO_ID_BY_SYMBOL[s])
            .filter((id): id is string => Boolean(id))
    ));

    if (ids.length === 0) return [];

    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&price_change_percentage=24h`;
    const data = await fetchJSON<CoinGeckoTicker[]>(url);

    return data.map((t) => ({
        symbol: t.symbol.toUpperCase(),
        price: Number.isFinite(t.current_price) ? t.current_price : 0,
        change24hPct: Number.isFinite(t.price_change_percentage_24h ?? NaN) ? (t.price_change_percentage_24h as number) : 0,
    }));
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get("symbols");

    const requestedSymbols = symbolsParam
        ? symbolsParam.split(",").map((s) => `${s.trim().toUpperCase()}USDT`)
        : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "TONUSDT", "LINKUSDT"];
    const cacheKey = `${CACHE_KEY}:${requestedSymbols.join(",")}`;

    try {
        let items = tickerCache.get<TickerItem[]>(cacheKey);

        if (!items) {
            const binanceItems = await fetchBinanceTickers(requestedSymbols);
            if (!binanceItems || binanceItems.length === 0) {
                items = await fetchCoinGeckoTickers(requestedSymbols);
            } else {
                items = binanceItems;
            }
            tickerCache.set(cacheKey, items, CACHE_TTL);
        }

        return NextResponse.json({
            updatedAt: Date.now(),
            items,
        });
    } catch (error) {
        console.error("Ticker API error:", error);
        return NextResponse.json(
            { updatedAt: Date.now(), items: [], error: "Failed to fetch ticker data" },
            { status: 200 }
        );
    }
}

