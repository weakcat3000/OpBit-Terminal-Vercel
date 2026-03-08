import { NextRequest, NextResponse } from "next/server";
import { getPanopticLiquidity } from "@/src/services/optionsService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const underlying = (searchParams.get("underlying") || "ETH").toUpperCase();

    try {
        const result = await getPanopticLiquidity(underlying);
        return NextResponse.json({
            underlying,
            rows: result.rows,
            venueStatus: result.venueStatus,
            timestamp: Date.now(),
        });
    } catch (err) {
        return NextResponse.json({
            underlying,
            rows: [],
            venueStatus: [],
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: Date.now(),
        });
    }
}

