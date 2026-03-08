import { Venue } from "../core/types/venues";
import { NormalizedOption, MatchedContract } from "../core/types/options";

interface MatchResult {
    matched: MatchedContract[];
    unmatched: NormalizedOption[];
}

/**
 * Match contracts across venues using contractKey.
 *
 * Rules:
 * - Primary join = contractKey exact match
 * - If expiry mismatch: allow Â±1 day search ONLY if strike and right identical
 *   â†’ label "approxExpiryMatch"
 * - Never match different strikes
 */
export function matchAcrossVenues(
    optionsByVenue: Partial<Record<Venue, NormalizedOption[]>>
): MatchResult {
    // Exact match map: contractKey â†’ { venue â†’ option }
    const exactMap = new Map<string, Map<Venue, NormalizedOption>>();
    // All options flat for fuzzy matching
    const allOptions: NormalizedOption[] = [];

    for (const [venue, options] of Object.entries(optionsByVenue)) {
        if (!options) continue;
        for (const opt of options) {
            allOptions.push(opt);

            if (!exactMap.has(opt.contractKey)) {
                exactMap.set(opt.contractKey, new Map());
            }
            // First option per venue per contractKey wins
            const venueMap = exactMap.get(opt.contractKey)!;
            if (!venueMap.has(venue as Venue)) {
                venueMap.set(venue as Venue, opt);
            }
        }
    }

    const matched: MatchedContract[] = [];
    const matchedKeys = new Set<string>();

    // Phase 1: Exact matches
    for (const [contractKey, venueMap] of exactMap.entries()) {
        const legsByVenue: Partial<Record<Venue, NormalizedOption>> = {};
        for (const [venue, opt] of venueMap.entries()) {
            legsByVenue[venue] = opt;
        }

        matched.push({
            contractKey,
            legsByVenue,
            flags: [],
        });
        matchedKeys.add(contractKey);
    }

    // Phase 2: Fuzzy expiry match (Â±1 day) for single-venue contracts
    // Group single-venue contracts by underlying|strike|right
    const singleVenueContracts: MatchedContract[] = matched.filter(
        (m) => Object.keys(m.legsByVenue).length === 1
    );

    const fuzzyKey = (opt: NormalizedOption) =>
        `${opt.underlying}|${opt.strike}|${opt.right}`;

    // Build map from fuzzyKey â†’ options with different expiries
    const fuzzyGroups = new Map<string, NormalizedOption[]>();
    for (const mc of singleVenueContracts) {
        const opt = Object.values(mc.legsByVenue)[0]!;
        const fk = fuzzyKey(opt);
        if (!fuzzyGroups.has(fk)) {
            fuzzyGroups.set(fk, []);
        }
        fuzzyGroups.get(fk)!.push(opt);
    }

    // Find Â±1 day matches within fuzzy groups
    for (const [, group] of fuzzyGroups.entries()) {
        if (group.length < 2) continue;

        // Sort by expiry
        group.sort((a, b) => a.expiry.localeCompare(b.expiry));

        for (let i = 0; i < group.length - 1; i++) {
            const a = group[i];
            const b = group[i + 1];

            // Already same venue? Skip.
            if (a.venue === b.venue) continue;

            const dayDiff = Math.abs(
                new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
            );
            const oneDayMs = 24 * 60 * 60 * 1000;

            if (dayDiff <= oneDayMs) {
                // Merge into existing matched contract (use a's contractKey)
                const existingIdx = matched.findIndex(
                    (m) => m.contractKey === a.contractKey
                );
                if (existingIdx >= 0) {
                    matched[existingIdx].legsByVenue[b.venue] = b;
                    matched[existingIdx].flags.push("approxExpiryMatch");

                    // Remove b's standalone match
                    const bIdx = matched.findIndex(
                        (m) => m.contractKey === b.contractKey
                    );
                    if (bIdx >= 0 && Object.keys(matched[bIdx].legsByVenue).length === 1) {
                        matched.splice(bIdx, 1);
                    }
                }
            }
        }
    }

    // Unmatched: options that ended up in single-venue contracts
    const unmatched: NormalizedOption[] = [];
    // (all are in matched at this point, unmatched is for future use)

    return { matched, unmatched };
}

