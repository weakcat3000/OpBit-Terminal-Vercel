import { Venue } from "@/src/core/types/venues";
import { VenueHealthSnapshot, VenueLiveHealth } from "@/src/streaming/types";

function classifyHealth(venue: Venue, ageMs: number | null, connected: boolean): VenueLiveHealth {
    if (venue === "IBIT") return "DELAYED";
    if (ageMs == null) return connected ? "LIVE" : "DOWN";

    // Keep venues green unless there has been no update for at least 60s.
    if (ageMs < 60000) return "LIVE";
    if (ageMs <= 120000) return "SLOW";
    return "STALE";
}

export class MarketHealthEngine {
    static evaluate(snapshot: VenueHealthSnapshot, nowMs = Date.now()): VenueHealthSnapshot {
        const ageMs = snapshot.lastUpdateMs != null ? Math.max(0, nowMs - snapshot.lastUpdateMs) : null;
        const nextHealth = classifyHealth(snapshot.venue, ageMs, snapshot.connected);
        return {
            ...snapshot,
            ageMs,
            health: nextHealth,
            mode: snapshot.venue === "IBIT" ? "delayed" : snapshot.mode,
        };
    }
}
