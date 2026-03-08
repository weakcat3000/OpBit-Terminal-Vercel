import { NextRequest, NextResponse } from "next/server";
import { getChain } from "@/src/services/optionsService";
import { Venue, ALL_VENUES } from "@/src/core/types/venues";

export const dynamic = "force-dynamic";

function parseVenues(param: string | null): Venue[] {
    if (!param) return ["DERIBIT"];
    const venues = param
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter((v): v is Venue => ALL_VENUES.includes(v as Venue));
    return venues.length > 0 ? venues : ["DERIBIT"];
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const underlying = (searchParams.get("underlying") || "ETH").toUpperCase();
    const expiry = searchParams.get("expiry");
    const venues = parseVenues(searchParams.get("venues"));

    if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        return NextResponse.json(
            {
                error: "Missing or invalid expiry parameter (YYYY-MM-DD)",
                venueStatus: [],
            },
            { status: 400 }
        );
    }

    try {
        const result = await getChain(underlying, expiry, venues);

        return NextResponse.json({
            underlying,
            expiry,
            venues,
            normalizedCount: result.normalized.length,
            matchedCount: result.matched.length,
            matched: result.matched,
            panopticLiquidity: result.panopticLiquidity,
            venueStatus: result.venueStatus,
            timestamp: Date.now(),
        });
    } catch (err) {
        return NextResponse.json({
            underlying,
            expiry,
            venues,
            matched: [],
            panopticLiquidity: [],
            venueStatus: [],
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: Date.now(),
        });
    }
}

