import { NextRequest, NextResponse } from "next/server";
import { fairBest } from "@/src/services/optionsService";

export const dynamic = "force-dynamic";

const VALID_TENORS = new Set(["7D", "14D", "30D", "60D"]);
const VALID_BUCKETS = new Set(["ATM"]);

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const base = (searchParams.get("base") || "BTC").toUpperCase();
    const compare = (searchParams.get("compare") || "IBIT").toUpperCase();
    const tenor = (searchParams.get("tenor") || "30D").toUpperCase();
    const bucket = (searchParams.get("bucket") || "ATM").toUpperCase();
    const selectedExpiry = searchParams.get("selectedExpiry");
    const selectedStrikeRaw = searchParams.get("selectedStrike");
    const selectedStrike =
        selectedStrikeRaw != null && selectedStrikeRaw !== ""
            ? Number(selectedStrikeRaw)
            : null;

    if (!VALID_TENORS.has(tenor)) {
        return NextResponse.json(
            {
                error: "Invalid tenor. Use 7D, 14D, 30D, or 60D.",
                venueStatus: [],
            },
            { status: 400 }
        );
    }

    if (!VALID_BUCKETS.has(bucket)) {
        return NextResponse.json(
            {
                error: "Invalid bucket. Supported: ATM.",
                venueStatus: [],
            },
            { status: 400 }
        );
    }

    if (selectedExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(selectedExpiry)) {
        return NextResponse.json(
            {
                error: "Invalid selectedExpiry. Use YYYY-MM-DD.",
                venueStatus: [],
            },
            { status: 400 }
        );
    }

    if (selectedStrike != null && (!Number.isFinite(selectedStrike) || selectedStrike <= 0)) {
        return NextResponse.json(
            {
                error: "Invalid selectedStrike. Use a positive number.",
                venueStatus: [],
            },
            { status: 400 }
        );
    }

    try {
        const result = await fairBest({
            base,
            compare,
            tenor: tenor as "7D" | "14D" | "30D" | "60D",
            bucket: bucket as "ATM",
            selectedExpiry: selectedExpiry ?? undefined,
            selectedStrike: selectedStrike ?? undefined,
        });

        return NextResponse.json({
            ...result,
            timestamp: Date.now(),
        });
    } catch (err) {
        return NextResponse.json({
            base,
            compare,
            tenor,
            bucket,
            rows: [],
            winner: null,
            explain: err instanceof Error ? err.message : "Unknown error",
            venueStatus: [],
            timestamp: Date.now(),
        });
    }
}

