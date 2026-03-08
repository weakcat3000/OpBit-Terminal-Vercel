import { NextRequest, NextResponse } from "next/server";
import { getSpots } from "@/src/services/spotService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    const symbols = symbolsParam
        ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : ["BTC", "ETH", "IBIT"];

    try {
        const result = await getSpots(symbols);
        return NextResponse.json(result);
    } catch (err) {
        const emptySpots: Record<string, number | null> = {};
        const emptySources: Record<string, string> = {};
        const emptyMarketStates: Record<string, string | null> = {};
        for (const symbol of symbols) {
            emptySpots[symbol] = null;
            emptySources[symbol] = "error";
            emptyMarketStates[symbol] = null;
        }

        return NextResponse.json(
            {
                updatedAt: Date.now(),
                spots: emptySpots,
                sources: emptySources,
                marketStates: emptyMarketStates,
                error: err instanceof Error ? err.message : "Unknown error",
            },
            { status: 200 }
        );
    }
}

