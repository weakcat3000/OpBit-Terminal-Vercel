import { NextRequest, NextResponse } from "next/server";
import { listAllInstruments } from "@/src/services/optionsService";
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
    const venues = parseVenues(searchParams.get("venues"));

    try {
        const result = await listAllInstruments(underlying, venues);

        return NextResponse.json({
            underlying,
            venues,
            expiries: result.expiries,
            strikeRange: result.strikeRange,
            venueStatus: result.venueStatus,
            timestamp: Date.now(),
        });
    } catch (err) {
        return NextResponse.json({
            underlying,
            venues,
            expiries: [],
            strikeRange: null,
            venueStatus: [],
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: Date.now(),
        });
    }
}

