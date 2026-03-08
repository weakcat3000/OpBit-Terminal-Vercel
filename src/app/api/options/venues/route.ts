import { NextResponse } from "next/server";
import { ALL_VENUES } from "@/src/core/types/venues";
import { listAllInstruments } from "@/src/services/optionsService";
import { missingRequiredEnvForVenue, venueEnabled } from "@/src/core/config/env";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const probe = await listAllInstruments("ETH", ALL_VENUES);

        const enabled: Record<string, boolean> = {};
        const missingEnv: Record<string, string[]> = {};

        for (const venue of ALL_VENUES) {
            enabled[venue] = venueEnabled(venue);
            if (venue === "LYRA_V2" || venue === "PANOPTIC" || venue === "IBIT") {
                missingEnv[venue] = missingRequiredEnvForVenue(venue);
            } else {
                missingEnv[venue] = [];
            }
        }

        return NextResponse.json({
            enabled,
            missingEnv,
            venueStatus: probe.venueStatus,
            timestamp: Date.now(),
        });
    } catch (err) {
        const enabled: Record<string, boolean> = {};
        const missingEnv: Record<string, string[]> = {};

        for (const venue of ALL_VENUES) {
            enabled[venue] = venueEnabled(venue);
            if (venue === "LYRA_V2" || venue === "PANOPTIC" || venue === "IBIT") {
                missingEnv[venue] = missingRequiredEnvForVenue(venue);
            } else {
                missingEnv[venue] = [];
            }
        }

        return NextResponse.json({
            enabled,
            missingEnv,
            venueStatus: [],
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: Date.now(),
        });
    }
}

