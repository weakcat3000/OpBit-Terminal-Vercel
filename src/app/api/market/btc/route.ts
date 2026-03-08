import { NextRequest, NextResponse } from "next/server";
import { fetchJSON } from "@/src/core/utils/http";
import { TTLCache } from "@/src/core/utils/cache";

const btcCache = new TTLCache();

interface Binance24hTicker {
    lastPrice: string;
    priceChangePercent: string;
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

function normalizeSymbol(raw: string | null): "BTCUSDT" | "ETHUSDT" {
    const value = (raw ?? "BTCUSDT").toUpperCase();
    return value === "ETHUSDT" ? "ETHUSDT" : "BTCUSDT";
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
            try {
                const tickerRes = await fetchJSON<Binance24hTicker>(
                    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
                );
                priceData = {
                    price: Number.parseFloat(tickerRes.lastPrice),
                    change24hPct: Number.parseFloat(tickerRes.priceChangePercent),
                };
                btcCache.set(priceKey, priceData, 2000);
            } catch (err) {
                console.error(`Failed to fetch ${symbol} ticker`, err);
                if (!priceData && !seriesData) throw err;
            }
        }

        if (!seriesData) {
            try {
                const klinesRes = await fetchJSON<BinanceKline[]>(
                    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=3m&limit=90`
                );

                seriesData = klinesRes.map((candle) => ({
                    t: candle[0],
                    p: Number.parseFloat(candle[4]),
                }));
                btcCache.set(seriesKey, seriesData, 10000);
            } catch (err) {
                console.error(`Failed to fetch ${symbol} klines`, err);
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

