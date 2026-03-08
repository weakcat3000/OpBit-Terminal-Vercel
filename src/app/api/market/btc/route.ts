import { NextRequest, NextResponse } from "next/server";
import { fetchJSON } from "@/src/core/utils/http";
import { TTLCache } from "@/src/core/utils/cache";

const btcCache = new TTLCache();

interface Binance24hTicker {
    lastPrice: string;
    priceChangePercent: string;
}

interface CoinbaseStatsResponse {
    open?: string;
    last?: string;
}

interface CoinbaseSpotResponse {
    data?: {
        amount?: string;
    };
}

type BinanceKline = [
    number,
    string,
    string,
    string,
    string,
    string,
    number,
    string,
    number,
    string,
    string,
    string
];

interface BtcPriceData {
    price: number;
    change24hPct: number;
}

interface BtcSeriesPoint {
    t: number;
    p: number;
}

type CoinbaseCandle = [number, number, number, number, number, number];

function normalizeSymbol(raw: string | null): "BTCUSDT" | "ETHUSDT" {
    const value = (raw ?? "BTCUSDT").toUpperCase();
    return value === "ETHUSDT" ? "ETHUSDT" : "BTCUSDT";
}

function toCoinbaseProduct(symbol: "BTCUSDT" | "ETHUSDT"): "BTC-USD" | "ETH-USD" {
    return symbol === "ETHUSDT" ? "ETH-USD" : "BTC-USD";
}

async function fetchBinance24h(symbol: "BTCUSDT" | "ETHUSDT"): Promise<BtcPriceData | null> {
    const urls = [
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
        `https://api.binance.us/api/v3/ticker/24hr?symbol=${symbol}`,
    ];

    for (const url of urls) {
        try {
            const tickerRes = await fetchJSON<Binance24hTicker>(url);
            return {
                price: Number.parseFloat(tickerRes.lastPrice),
                change24hPct: Number.parseFloat(tickerRes.priceChangePercent),
            };
        } catch {
            // Try next endpoint.
        }
    }

    return null;
}

async function fetchCoinbase24h(symbol: "BTCUSDT" | "ETHUSDT"): Promise<BtcPriceData | null> {
    const product = toCoinbaseProduct(symbol);
    try {
        const stats = await fetchJSON<CoinbaseStatsResponse>(
            `https://api.exchange.coinbase.com/products/${product}/stats`
        );
        const open = Number.parseFloat(stats.open ?? "");
        const last = Number.parseFloat(stats.last ?? "");
        if (Number.isFinite(open) && open > 0 && Number.isFinite(last)) {
            return {
                price: last,
                change24hPct: ((last - open) / open) * 100,
            };
        }
    } catch {
        // Fallback to spot endpoint.
    }

    try {
        const spot = await fetchJSON<CoinbaseSpotResponse>(
            `https://api.coinbase.com/v2/prices/${product}/spot`
        );
        const amount = Number.parseFloat(spot.data?.amount ?? "");
        if (Number.isFinite(amount)) {
            return { price: amount, change24hPct: 0 };
        }
    } catch {
        // No fallback left.
    }

    return null;
}

async function fetchBinanceSeries(symbol: "BTCUSDT" | "ETHUSDT"): Promise<BtcSeriesPoint[] | null> {
    const urls = [
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=3m&limit=90`,
        `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=3m&limit=90`,
    ];
    for (const url of urls) {
        try {
            const klinesRes = await fetchJSON<BinanceKline[]>(url);
            return klinesRes.map((candle) => ({
                t: candle[0],
                p: Number.parseFloat(candle[4]),
            }));
        } catch {
            // Try next endpoint.
        }
    }
    return null;
}

async function fetchCoinbaseSeries(symbol: "BTCUSDT" | "ETHUSDT"): Promise<BtcSeriesPoint[] | null> {
    const product = toCoinbaseProduct(symbol);
    try {
        const candles = await fetchJSON<CoinbaseCandle[]>(
            `https://api.exchange.coinbase.com/products/${product}/candles?granularity=300`
        );
        const series = candles
            .map((c) => ({ t: c[0] * 1000, p: c[4] }))
            .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p))
            .sort((a, b) => a.t - b.t)
            .slice(-90);
        return series;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    try {
        const symbol = normalizeSymbol(request.nextUrl.searchParams.get("symbol"));
        const priceKey = `${symbol}:price`;
        const seriesKey = `${symbol}:series`;
        let priceData = btcCache.get<BtcPriceData>(priceKey);
        let seriesData = btcCache.get<BtcSeriesPoint[]>(seriesKey);

        const now = Date.now();

        if (!priceData) {
            const primary = await fetchBinance24h(symbol);
            if (primary) {
                priceData = primary;
                btcCache.set(priceKey, priceData, 2000);
            } else {
                const fallback = await fetchCoinbase24h(symbol);
                if (fallback) {
                    priceData = fallback;
                    btcCache.set(priceKey, priceData, 2000);
                }
            }
        }

        if (!seriesData) {
            const primary = await fetchBinanceSeries(symbol);
            if (primary && primary.length > 0) {
                seriesData = primary;
                btcCache.set(seriesKey, seriesData, 10000);
            } else {
                const fallback = await fetchCoinbaseSeries(symbol);
                if (fallback && fallback.length > 0) {
                    seriesData = fallback;
                    btcCache.set(seriesKey, seriesData, 10000);
                }
            }
        }

        return NextResponse.json({
            updatedAt: now,
            symbol,
            price: priceData?.price ?? null,
            change24hPct: priceData?.change24hPct ?? null,
            series: seriesData ?? [],
        });
    } catch (error) {
        console.error("BTC market API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch BTC market data" },
            { status: 500 }
        );
    }
}

