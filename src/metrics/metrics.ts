import { Venue } from "../core/types/venues";
import {
    MatchedContract,
    ComparisonMetrics,
} from "../core/types/options";

/**
 * Compute comparison metrics for matched contracts.
 *
 * Rules:
 * - Default benchmark = DERIBIT if present, else pick venue with smallest spreadPct
 * - spreadAbs/Pct per venue leg
 * - vsBenchmarkAbs/Pct for non-benchmark venues
 * - ivGap between venues
 * - bestVenueByMid = venue with lowest mid price (for calls) or best value
 */
export function computeMetrics(
    matched: MatchedContract[],
    benchmark: Venue
): MatchedContract[] {
    return matched.map((mc) => {
        const venues = Object.keys(mc.legsByVenue) as Venue[];
        const metricWarnings: string[] = [];

        // Determine effective benchmark
        let effectiveBenchmark = benchmark;
        if (!mc.legsByVenue[benchmark]) {
            // Pick venue with smallest spread percentage
            let bestSpreadPct = Infinity;
            for (const v of venues) {
                const leg = mc.legsByVenue[v]!;
                if (leg.bid != null && leg.ask != null && leg.mid != null && leg.mid > 0) {
                    const sp = (leg.ask - leg.bid) / leg.mid;
                    if (sp < bestSpreadPct) {
                        bestSpreadPct = sp;
                        effectiveBenchmark = v;
                    }
                }
            }
            metricWarnings.push(
                `Benchmark ${benchmark} not present; using ${effectiveBenchmark}`
            );
        }

        const benchLeg = mc.legsByVenue[effectiveBenchmark];

        // Compute benchmark spread
        let spreadAbs: number | null = null;
        let spreadPct: number | null = null;

        if (benchLeg) {
            if (benchLeg.bid != null && benchLeg.ask != null) {
                spreadAbs = benchLeg.ask - benchLeg.bid;
                if (benchLeg.mid != null && benchLeg.mid > 0) {
                    spreadPct = spreadAbs / benchLeg.mid;
                }
            }
        }

        // For multi-venue, compute vs benchmark
        let vsBenchmarkAbs: number | null = null;
        let vsBenchmarkPct: number | null = null;
        let ivGap: number | null = null;
        let bestVenueByMid: Venue | null = null;
        let bestMid = Infinity;

        for (const v of venues) {
            const leg = mc.legsByVenue[v]!;

            // Track best mid
            if (leg.mid != null && leg.mid > 0 && leg.mid < bestMid) {
                bestMid = leg.mid;
                bestVenueByMid = v;
            }

            if (v === effectiveBenchmark) continue;

            // vs benchmark
            if (leg.mid != null && leg.mid > 0 && benchLeg?.mid != null && benchLeg.mid > 0) {
                vsBenchmarkAbs = leg.mid - benchLeg.mid;
                vsBenchmarkPct = vsBenchmarkAbs / benchLeg.mid;
            }

            // IV gap
            if (leg.markIv != null && benchLeg?.markIv != null) {
                ivGap = leg.markIv - benchLeg.markIv;
            }
        }

        const metrics: ComparisonMetrics = {
            spreadAbs,
            spreadPct,
            vsBenchmarkAbs,
            vsBenchmarkPct,
            ivGap,
            benchmarkVenue: effectiveBenchmark,
            bestVenueByMid: bestMid < Infinity ? bestVenueByMid : null,
            metricWarnings: metricWarnings.length > 0 ? metricWarnings : undefined,
        };

        return {
            ...mc,
            metrics,
        };
    });
}

