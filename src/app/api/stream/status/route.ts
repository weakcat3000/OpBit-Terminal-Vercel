import { NextRequest, NextResponse } from "next/server";
import { StreamDebugStatus } from "@/src/streaming/types";

export const dynamic = "force-dynamic";

let latestStatus: StreamDebugStatus = {
    connectedVenues: [],
    lastUpdateMsByVenue: {},
    subscriptionCountByVenue: {},
    timestamp: Date.now(),
};

export async function GET() {
    return NextResponse.json(latestStatus);
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as Partial<StreamDebugStatus>;
        latestStatus = {
            connectedVenues: Array.isArray(body.connectedVenues) ? body.connectedVenues : latestStatus.connectedVenues,
            lastUpdateMsByVenue: body.lastUpdateMsByVenue ?? latestStatus.lastUpdateMsByVenue,
            subscriptionCountByVenue: body.subscriptionCountByVenue ?? latestStatus.subscriptionCountByVenue,
            timestamp: Date.now(),
        };
        return NextResponse.json({ ok: true, timestamp: latestStatus.timestamp });
    } catch {
        return NextResponse.json({ ok: false, timestamp: Date.now() }, { status: 400 });
    }
}

