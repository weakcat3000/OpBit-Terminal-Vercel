import { Venue } from "../core/types/venues";
import {
    ComparisonMetrics,
    MatchedContract,
    NormalizedOption,
    VenueStatus,
    getUnderlyingFamily,
} from "../core/types/options";
import { getAdapter, registerAdapter } from "../data/index";
import { normalizeInstrumentsAndQuotes } from "../normalize/normalize";
import { matchAcrossVenues } from "../match/match";
import { computeMetrics } from "../metrics/metrics";
import { deribitAdapter } from "../data/adapters/deribit";
import { aevoAdapter } from "../data/adapters/aevo";
import { lyraV2Adapter } from "../data/adapters/lyraV2";
import { panopticAdapter } from "../data/adapters/panoptic";
import { ibitAdapter } from "../data/adapters/ibit";
import { standardizeOption, toIbitBtcEquivalent } from "../fairness/standardize";
import { getSpots } from "./spotService";

registerAdapter(deribitAdapter);
registerAdapter(aevoAdapter);
registerAdapter(lyraV2Adapter);
registerAdapter(panopticAdapter);
registerAdapter(ibitAdapter);

export interface InstrumentsResult {
    normalizedByVenue: Partial<Record<Venue, NormalizedOption[]>>;
    venueStatus: VenueStatus[];
    expiries: string[];
    strikeRange: { min: number; max: number } | null;
}

export interface ChainResult {
    normalized: NormalizedOption[];
    matched: MatchedContract[];
    venueStatus: VenueStatus[];
    panopticLiquidity: NormalizedOption[];
}

export interface CompareResult {
    matched: MatchedContract[];
    venueStatus: VenueStatus[];
    rows: CompareRow[];
    panopticLiquidity: NormalizedOption[];
    bestScopeLabel: string;
}

export interface CompareRow {
    contractKey: string;
    underlying: string;
    expiry: string;
    strike: number;
    right: "C" | "P";
    venues: Partial<
        Record<
            Venue,
            {
                bid: number | null;
                ask: number | null;
                mid: number | null;
                bidSize?: number | null;
                askSize?: number | null;
                markIv: number | null;
                delta?: number | null;
                gamma?: number | null;
                theta?: number | null;
                vega?: number | null;
                rho?: number | null;
                updatedAt?: number | null;
                quoteType?: NormalizedOption["quoteType"];
                vsBenchmarkPct: number | null;
            }
        >
    >;
    bestVenue: Venue | null;
    bestMidUsed?: number | null;
    bestSource?: "mid" | "avgBidAsk" | null;
    bestWarnings?: string[];
}

export interface BestResult {
    underlying: string;
    expiry: string;
    rows: CompareRow[];
    venueStatus: VenueStatus[];
    bestScopeLabel: string;
}

export interface FairBestRow {
    market: string;
    iv: number | null;
    m: number | null;
    expiry: string;
    warnings?: string[];
    midUsdPerUnderlying?: number | null;
}

export interface FairBestResult {
    base: string;
    compare: string;
    tenor: "7D" | "14D" | "30D" | "60D";
    bucket: "ATM";
    rows: FairBestRow[];
    winner: string | null;
    explain: string;
    venueStatus: VenueStatus[];
}

const BEST_EPSILON = 1e-6;
const VENUE_PRIORITY: Venue[] = ["DERIBIT", "AEVO", "LYRA_V2", "IBIT"];

function pushUniqueStatus(statuses: VenueStatus[]): VenueStatus[] {
    const map = new Map<Venue, VenueStatus>();
    for (const status of statuses) {
        map.set(status.venue, status);
    }
    return Array.from(map.values());
}

function dayDiffFromNow(expiry: string, nowMs: number): number {
    const ms = Date.parse(`${expiry}T00:00:00.000Z`);
    if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
    return Math.abs((ms - nowMs) / (24 * 60 * 60 * 1000));
}

function nearestExpiry(expiries: string[], tenor: "7D" | "14D" | "30D" | "60D"): string | null {
    if (expiries.length === 0) return null;

    const targetDays = tenor === "7D" ? 7 : tenor === "14D" ? 14 : tenor === "30D" ? 30 : 60;
    const nowMs = Date.now();

    let best: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const expiry of expiries) {
        const score = Math.abs(dayDiffFromNow(expiry, nowMs) - targetDays);
        if (score < bestScore) {
            bestScore = score;
            best = expiry;
        }
    }

    return best;
}

function nearestExpiryToDate(expiries: string[], targetExpiry: string): string | null {
    if (expiries.length === 0) return null;
    const targetMs = Date.parse(`${targetExpiry}T00:00:00.000Z`);
    if (!Number.isFinite(targetMs)) return null;

    let best: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const expiry of expiries) {
        const expiryMs = Date.parse(`${expiry}T00:00:00.000Z`);
        if (!Number.isFinite(expiryMs)) continue;
        const score = Math.abs(expiryMs - targetMs);
        if (score < bestScore) {
            bestScore = score;
            best = expiry;
        }
    }

    return best;
}

function bestVenuesForUnderlying(underlying: string): Venue[] {
    const family = getUnderlyingFamily(underlying);
    if (family === "BTC" || family === "ETH") {
        return ["DERIBIT", "AEVO", "LYRA_V2"];
    }
    if (family === "IBIT") {
        return ["IBIT"];
    }
    return [];
}

function bestScopeLabel(underlying: string): string {
    const family = getUnderlyingFamily(underlying);
    if (family === "BTC") return "BEST (BTC options)";
    if (family === "ETH") return "BEST (ETH options)";
    if (family === "IBIT") return "BEST (IBIT options)";
    return `BEST (${underlying.toUpperCase()} options)`;
}

function pickPriceCandidate(
    option: NormalizedOption
): { value: number | null; source: "mid" | "avgBidAsk" | null } {
    if (option.mid != null && Number.isFinite(option.mid) && option.mid > 0) {
        return { value: option.mid, source: "mid" };
    }

    if (
        option.bid != null &&
        option.ask != null &&
        Number.isFinite(option.bid) &&
        Number.isFinite(option.ask) &&
        option.bid > 0 &&
        option.ask > 0
    ) {
        const avg = (option.bid + option.ask) / 2;
        if (avg > 0) {
            return { value: avg, source: "avgBidAsk" };
        }
    }

    return { value: null, source: null };
}

function compareByPriority(a: Venue, b: Venue): number {
    return VENUE_PRIORITY.indexOf(a) - VENUE_PRIORITY.indexOf(b);
}

function selectBestForContract(
    contract: MatchedContract,
    underlying: string,
    benchmark: Venue
): { venue: Venue | null; mid: number | null; source: "mid" | "avgBidAsk" | null; warnings: string[] } {
    const allowed = new Set(bestVenuesForUnderlying(underlying));
    const candidates: Array<{
        venue: Venue;
        value: number;
        source: "mid" | "avgBidAsk";
        warnings: string[];
    }> = [];

    for (const [venueKey, option] of Object.entries(contract.legsByVenue)) {
        const venue = venueKey as Venue;
        if (!allowed.has(venue)) continue;
        if (option.quoteType === "LIQUIDITY_ONLY") continue;

        const candidate = pickPriceCandidate(option);
        if (candidate.value == null || candidate.source == null) continue;

        candidates.push({
            venue,
            value: candidate.value,
            source: candidate.source,
            warnings: option.warnings ?? [],
        });
    }

    if (candidates.length === 0) {
        return { venue: null, mid: null, source: null, warnings: [] };
    }

    candidates.sort((a, b) => a.value - b.value);
    const bestPrice = candidates[0].value;
    const tied = candidates.filter((c) => Math.abs(c.value - bestPrice) <= BEST_EPSILON);

    let winner = tied[0];
    const benchmarkTie = tied.find((c) => c.venue === benchmark);
    if (benchmarkTie) {
        winner = benchmarkTie;
    } else if (tied.length > 1) {
        winner = tied.sort((a, b) => compareByPriority(a.venue, b.venue))[0];
    }

    return {
        venue: winner.venue,
        mid: winner.value,
        source: winner.source,
        warnings: winner.warnings,
    };
}

async function fetchNormalizedByVenue(
    underlying: string,
    venues: Venue[],
    options: { expiry?: string; includeQuotes: boolean }
): Promise<{ normalizedByVenue: Partial<Record<Venue, NormalizedOption[]>>; venueStatus: VenueStatus[] }> {
    const normalizedByVenue: Partial<Record<Venue, NormalizedOption[]>> = {};
    const venueStatus: VenueStatus[] = [];

    await Promise.all(
        venues.map(async (venue) => {
            const adapter = getAdapter(venue);
            if (!adapter) {
                venueStatus.push({
                    venue,
                    status: "down",
                    reason: "Adapter not registered",
                    lastUpdated: Date.now(),
                });
                return;
            }

            try {
                const instruments = await adapter.listInstruments({ underlying });
                const quotes = options.includeQuotes
                    ? await adapter.getQuotes({ underlying, expiry: options.expiry })
                    : [];

                normalizedByVenue[venue] = normalizeInstrumentsAndQuotes(
                    venue,
                    instruments,
                    quotes
                );

                venueStatus.push(adapter.getStatus());
            } catch (err) {
                venueStatus.push({
                    venue,
                    status: "down",
                    reason: err instanceof Error ? err.message : "Unknown error",
                    lastUpdated: Date.now(),
                });
            }
        })
    );

    return { normalizedByVenue, venueStatus: pushUniqueStatus(venueStatus) };
}

async function applyStandardization(options: NormalizedOption[]): Promise<NormalizedOption[]> {
    if (options.length === 0) return options;

    const symbols = new Set<string>();
    for (const option of options) {
        const family = getUnderlyingFamily(option.underlying);
        if (family) {
            symbols.add(family);
        }
    }

    const spotData = await getSpots(Array.from(symbols));
    const spotMap: Record<string, number | null> = {
        BTC: spotData.spots.BTC ?? null,
        ETH: spotData.spots.ETH ?? null,
        IBIT: spotData.spots.IBIT ?? null,
    };

    return options.map((option) => standardizeOption(option, spotMap, Date.now()));
}

export async function listAllInstruments(
    underlying: string,
    venues: Venue[]
): Promise<InstrumentsResult> {
    const { normalizedByVenue, venueStatus } = await fetchNormalizedByVenue(underlying, venues, {
        includeQuotes: false,
    });

    const allExpiries = new Set<string>();
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;

    for (const options of Object.values(normalizedByVenue)) {
        if (!options) continue;
        for (const opt of options) {
            if (opt.quoteType === "LIQUIDITY_ONLY") continue;
            if (/^\d{4}-\d{2}-\d{2}$/.test(opt.expiry)) {
                allExpiries.add(opt.expiry);
            }
            if (Number.isFinite(opt.strike)) {
                globalMin = Math.min(globalMin, opt.strike);
                globalMax = Math.max(globalMax, opt.strike);
            }
        }
    }

    return {
        normalizedByVenue,
        venueStatus,
        expiries: Array.from(allExpiries).sort(),
        strikeRange:
            globalMin <= globalMax ? { min: globalMin, max: globalMax } : null,
    };
}

export async function getChain(
    underlying: string,
    expiry: string,
    venues: Venue[]
): Promise<ChainResult> {
    const { normalizedByVenue, venueStatus } = await fetchNormalizedByVenue(underlying, venues, {
        includeQuotes: true,
        expiry,
    });

    const panopticLiquidity = (normalizedByVenue.PANOPTIC ?? []).map((option) => ({
        ...option,
        quoteType: "LIQUIDITY_ONLY" as const,
    }));

    const filteredByVenue: Partial<Record<Venue, NormalizedOption[]>> = {};
    for (const [venue, options] of Object.entries(normalizedByVenue)) {
        const typedVenue = venue as Venue;
        if (typedVenue === "PANOPTIC") continue;

        const filtered = (options ?? []).filter(
            (o) => o.expiry === expiry && o.quoteType !== "LIQUIDITY_ONLY"
        );

        filteredByVenue[typedVenue] = filtered;
    }

    const standardizedByVenue: Partial<Record<Venue, NormalizedOption[]>> = {};
    for (const [venue, options] of Object.entries(filteredByVenue)) {
        standardizedByVenue[venue as Venue] = await applyStandardization(options ?? []);
    }

    const allFiltered = Object.values(standardizedByVenue).flat();
    const { matched } = matchAcrossVenues(standardizedByVenue);

    return {
        normalized: allFiltered,
        matched,
        venueStatus,
        panopticLiquidity,
    };
}

export async function compare(
    underlying: string,
    expiry: string,
    venues: Venue[],
    benchmark: Venue
): Promise<CompareResult> {
    const { matched, venueStatus, panopticLiquidity } = await getChain(
        underlying,
        expiry,
        venues
    );

    const withMetrics = computeMetrics(matched, benchmark).map((contract) => {
        const best = selectBestForContract(contract, underlying, benchmark);
        const metrics: ComparisonMetrics = {
            ...(contract.metrics ?? { benchmarkVenue: benchmark }),
            bestVenueByMid: best.venue,
            bestMidUsed: best.mid,
            bestSource: best.source,
            bestWarnings: best.warnings,
        };

        return {
            ...contract,
            metrics,
        };
    });

    const rows: CompareRow[] = withMetrics.map((mc) => {
        const firstLeg = Object.values(mc.legsByVenue)[0]!;
        const benchmarkVenue = mc.metrics?.benchmarkVenue ?? benchmark;
        const benchmarkLeg = mc.legsByVenue[benchmarkVenue];

        const venueData: CompareRow["venues"] = {};
        for (const [v, leg] of Object.entries(mc.legsByVenue)) {
            const venue = v as Venue;
            let vsBenchmarkPct: number | null = null;

            if (
                venue !== benchmarkVenue &&
                benchmarkLeg?.mid != null &&
                benchmarkLeg.mid > 0 &&
                leg.mid != null &&
                leg.mid > 0
            ) {
                vsBenchmarkPct = (leg.mid - benchmarkLeg.mid) / benchmarkLeg.mid;
            }

            venueData[venue] = {
                bid: leg.bid,
                ask: leg.ask,
                mid: leg.mid,
                bidSize: leg.bidSize ?? null,
                askSize: leg.askSize ?? null,
                markIv: leg.markIv,
                delta: leg.delta ?? leg.standard?.delta ?? null,
                gamma: leg.gamma ?? leg.standard?.gamma ?? null,
                theta: leg.theta ?? leg.standard?.theta ?? null,
                vega: leg.vega ?? leg.standard?.vega ?? null,
                rho: leg.rho ?? leg.standard?.rho ?? null,
                updatedAt: leg.updatedAt ?? null,
                quoteType: leg.quoteType,
                vsBenchmarkPct,
            };
        }

        return {
            contractKey: mc.contractKey,
            underlying: firstLeg.underlying,
            expiry: firstLeg.expiry,
            strike: firstLeg.strike,
            right: firstLeg.right,
            venues: venueData,
            bestVenue: mc.metrics?.bestVenueByMid ?? null,
            bestMidUsed: mc.metrics?.bestMidUsed ?? null,
            bestSource: mc.metrics?.bestSource ?? null,
            bestWarnings: mc.metrics?.bestWarnings,
        };
    });

    rows.sort((a, b) => a.strike - b.strike || a.right.localeCompare(b.right));

    return {
        matched: withMetrics,
        venueStatus,
        rows,
        panopticLiquidity,
        bestScopeLabel: bestScopeLabel(underlying),
    };
}

export async function best(
    underlying: string,
    expiry: string,
    venues: Venue[],
    benchmark: Venue
): Promise<BestResult> {
    const comparison = await compare(underlying, expiry, venues, benchmark);
    return {
        underlying,
        expiry,
        rows: comparison.rows,
        venueStatus: comparison.venueStatus,
        bestScopeLabel: comparison.bestScopeLabel,
    };
}

function nearestByMoneyness(
    options: NormalizedOption[],
    targetM: number,
    mapper: (opt: NormalizedOption) => number | null
): NormalizedOption | null {
    let bestOption: NormalizedOption | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const option of options) {
        const m = mapper(option);
        if (m == null || !Number.isFinite(m)) continue;

        const score = Math.abs(m - targetM);
        if (score < bestScore) {
            bestScore = score;
            bestOption = option;
        }
    }

    return bestOption;
}

export async function fairBest(params: {
    base: string;
    compare: string;
    tenor: "7D" | "14D" | "30D" | "60D";
    bucket: "ATM";
    selectedExpiry?: string;
    selectedStrike?: number;
}): Promise<FairBestResult> {
    const base = params.base.toUpperCase();
    const compareUnderlying = params.compare.toUpperCase();

    const baseVenues = bestVenuesForUnderlying(base);
    const compareVenues = bestVenuesForUnderlying(compareUnderlying);

    const baseInstruments = await listAllInstruments(base, baseVenues);
    const compareInstruments = await listAllInstruments(compareUnderlying, compareVenues);

    const spotData = await getSpots(["BTC", "ETH", "IBIT"]);
    const spotMap: Record<string, number | null> = {
        BTC: spotData.spots.BTC ?? null,
        ETH: spotData.spots.ETH ?? null,
        IBIT: spotData.spots.IBIT ?? null,
    };

    const baseExpiry = params.selectedExpiry
        ? nearestExpiryToDate(baseInstruments.expiries, params.selectedExpiry) ??
          nearestExpiry(baseInstruments.expiries, params.tenor)
        : nearestExpiry(baseInstruments.expiries, params.tenor);

    const compareExpiry = params.selectedExpiry
        ? nearestExpiryToDate(compareInstruments.expiries, params.selectedExpiry) ??
          nearestExpiry(compareInstruments.expiries, params.tenor)
        : nearestExpiry(compareInstruments.expiries, params.tenor);

    const rows: FairBestRow[] = [];
    const baseSpot = spotMap[base] ?? null;
    const targetM =
        params.selectedStrike != null && baseSpot != null && baseSpot > 0
            ? params.selectedStrike / baseSpot
            : 1.0;

    if (baseExpiry) {
        const baseChain = await getChain(base, baseExpiry, baseVenues);
        const byVenue = new Map<Venue, NormalizedOption[]>();

        for (const option of baseChain.normalized.map((o) => standardizeOption(o, spotMap, Date.now()))) {
            const list = byVenue.get(option.venue) ?? [];
            list.push(option);
            byVenue.set(option.venue, list);
        }

        for (const [venue, options] of byVenue.entries()) {
            const bestOption = nearestByMoneyness(options, targetM, (o) => o.standard?.moneyness ?? null);
            if (!bestOption) continue;

            rows.push({
                market: `${venue}_${base}`,
                iv: bestOption.standard?.iv ?? null,
                m: bestOption.standard?.moneyness ?? null,
                expiry: bestOption.expiry,
                warnings: bestOption.standard?.warnings,
                midUsdPerUnderlying: bestOption.standard?.midUsdPerUnderlying ?? null,
            });
        }
    }

    if (compareExpiry) {
        const compareChain = await getChain(compareUnderlying, compareExpiry, compareVenues);
        const standardized = compareChain.normalized.map((o) => standardizeOption(o, spotMap, Date.now()));

        for (const venue of compareVenues) {
            const venueOptions = standardized.filter((o) => o.venue === venue);
            if (venueOptions.length === 0) continue;

            const bestOption = nearestByMoneyness(venueOptions, targetM, (opt) => {
                if (compareUnderlying === "IBIT") {
                    return toIbitBtcEquivalent(opt, spotMap).moneynessBtcEq;
                }
                return opt.standard?.moneyness ?? null;
            });

            if (!bestOption) continue;

            const ibitEq = compareUnderlying === "IBIT"
                ? toIbitBtcEquivalent(bestOption, spotMap)
                : null;

            rows.push({
                market: compareUnderlying === "IBIT" ? "IBIT_BTC_EQ" : `${venue}_${compareUnderlying}`,
                iv: bestOption.standard?.iv ?? null,
                m: compareUnderlying === "IBIT"
                    ? ibitEq?.moneynessBtcEq ?? null
                    : bestOption.standard?.moneyness ?? null,
                expiry: bestOption.expiry,
                warnings: [
                    ...(bestOption.standard?.warnings ?? []),
                    ...(ibitEq?.warnings ?? []),
                ],
                midUsdPerUnderlying: compareUnderlying === "IBIT"
                    ? ibitEq?.midUsdPerUnderlyingBtcEq ?? null
                    : bestOption.standard?.midUsdPerUnderlying ?? null,
            });
        }
    }

    const rowsWithIv = rows.filter((r) => r.iv != null);
    let winner: string | null = null;
    let explain = "No comparable rows available for FAIR selection.";

    if (rows.length > 0) {
        if (rowsWithIv.length === rows.length) {
            winner = rowsWithIv.sort((a, b) => (a.iv ?? Infinity) - (b.iv ?? Infinity))[0]?.market ?? null;
            explain = "Winner chosen by lowest implied volatility at nearest tenor and moneyness.";
        } else {
            const rowsWithPremium = rows.filter((r) => r.midUsdPerUnderlying != null);
            if (rowsWithPremium.length > 0) {
                winner = rowsWithPremium.sort(
                    (a, b) => (a.midUsdPerUnderlying ?? Infinity) - (b.midUsdPerUnderlying ?? Infinity)
                )[0].market;
                explain = "Winner chosen by standardized premium per underlying exposure (FAIR_FALLBACK_PREMIUM).";
                for (const row of rows) {
                    row.warnings = Array.from(new Set([...(row.warnings ?? []), "FAIR_FALLBACK_PREMIUM"]));
                }
            }
        }
    }

    return {
        base,
        compare: compareUnderlying,
        tenor: params.tenor,
        bucket: params.bucket,
        rows,
        winner,
        explain,
        venueStatus: pushUniqueStatus([
            ...baseInstruments.venueStatus,
            ...compareInstruments.venueStatus,
        ]),
    };
}

export async function getPanopticLiquidity(
    underlying: string
): Promise<{ rows: NormalizedOption[]; venueStatus: VenueStatus[] }> {
    const { normalizedByVenue, venueStatus } = await fetchNormalizedByVenue(underlying, ["PANOPTIC"], {
        includeQuotes: false,
    });

    return {
        rows: normalizedByVenue.PANOPTIC ?? [],
        venueStatus,
    };
}

