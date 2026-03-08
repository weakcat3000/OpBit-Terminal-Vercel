import { NextResponse } from "next/server";
import { listAllInstruments } from "@/src/services/optionsService";
import { ALL_VENUES } from "@/src/core/types/venues";

export const dynamic = "force-dynamic";

/**
 * GET /api/options/health
 * Returns venue status and timestamps.
 */
export async function GET() {
    try {
        const { venueStatus } = await listAllInstruments("ETH", ALL_VENUES);

        return NextResponse.json({
            ok: true,
            timestamp: Date.now(),
            venues: venueStatus,
        });
    } catch (err) {
        return NextResponse.json(
            {
                ok: false,
                error: err instanceof Error ? err.message : "Unknown error",
                timestamp: Date.now(),
            },
            { status: 200 } // Never 500 â€” show partial results
        );
    }
}

