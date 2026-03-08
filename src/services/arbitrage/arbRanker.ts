import { Venue } from "../../core/types/venues";
import { CompareRow } from "../optionsService";
import { ArbConfig, DEFAULT_ARB_CONFIG } from "./arbConfig";
import { ArbOpportunity, ArbPlaybook } from "./arbTypes";
import { scanCrossVenueArbs } from "./executableCrossVenue";
import { scanBoxSpreadArbs } from "./boxSpreadArb";

/**
 * Main entry point: scan for all riskless arbitrage opportunities.
 */
export function getRisklessArbs(
    rows: CompareRow[],
    venues: Venue[],
    spotPrice: number,
    config: ArbConfig = DEFAULT_ARB_CONFIG,
    playbook: ArbPlaybook = "ALL"
): ArbOpportunity[] {
    const nowMs = Date.now();
    let all: ArbOpportunity[] = [];

    // Cross-venue arbs
    if (playbook === "ALL" || playbook === "CROSS_VENUE" || playbook === "CALLS_ONLY" || playbook === "PUTS_ONLY") {
        const cvArbs = scanCrossVenueArbs(rows, venues, config, nowMs);
        all.push(...cvArbs);
    }

    // Box spread arbs
    if (playbook === "ALL" || playbook === "BOX") {
        const boxArbs = scanBoxSpreadArbs(rows, venues, spotPrice, config, nowMs);
        all.push(...boxArbs);
    }

    // Playbook filters
    if (playbook === "CALLS_ONLY") {
        all = all.filter((o) => o.optionType === "CALL" || o.kind === "INTRA_VENUE_BOX");
    } else if (playbook === "PUTS_ONLY") {
        all = all.filter((o) => o.optionType === "PUT" || o.kind === "INTRA_VENUE_BOX");
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const unique: ArbOpportunity[] = [];
    for (const opp of all) {
        if (!seen.has(opp.id)) {
            seen.add(opp.id);
            unique.push(opp);
        }
    }

    // Sort: profitUSD_max desc → profitPct desc → quoteAgeMsMax asc
    unique.sort((a, b) => {
        if (b.profitUSD_max !== a.profitUSD_max) return b.profitUSD_max - a.profitUSD_max;
        if (b.profitPct !== a.profitPct) return b.profitPct - a.profitPct;
        return a.quoteAgeMsMax - b.quoteAgeMsMax;
    });

    return unique;
}
