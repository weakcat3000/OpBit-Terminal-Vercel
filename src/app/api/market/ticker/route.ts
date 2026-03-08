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

interface TickerItem {
    symbol: string;
    price: number;
    change24hPct: number;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get("symbols");

    const requestedSymbols = symbolsParam
        ? symbolsParam.split(",").map((s) => `${s.trim().toUpperCase()}USDT`)
        : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "TONUSDT", "LINKUSDT"];

    try {
        let items = tickerCache.get<TickerItem[]>(CACHE_KEY);

        if (!items) {
            const encodedSymbols = encodeURIComponent(JSON.stringify(requestedSymbols));
            const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodedSymbols}`;

            const data = await fetchJSON<BinanceTicker[]>(url);

            items = data.map((t) => {
                const displaySymbol = t.symbol.endsWith("USDT")
                    ? t.symbol.replace("USDT", "")
                    : t.symbol;

                return {
                    symbol: displaySymbol,
                    price: Number.parseFloat(t.lastPrice),
                    change24hPct: Number.parseFloat(t.priceChangePercent),
                };
            });

            tickerCache.set(CACHE_KEY, items, CACHE_TTL);
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

