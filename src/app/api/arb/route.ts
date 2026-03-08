import { NextRequest, NextResponse } from "next/server";
import { compare, listAllInstruments } from "@/src/services/optionsService";
import { Venue, ALL_VENUES } from "@/src/core/types/venues";
import { getRisklessArbs } from "@/src/services/arbitrage/arbRanker";
import { DEFAULT_ARB_CONFIG } from "@/src/services/arbitrage/arbConfig";
import { getSpots } from "@/src/services/spotService";
import { ArbPlaybook } from "@/src/services/arbitrage/arbTypes";

export const dynamic = "force-dynamic";

type CacheEntry<T> = {
    expiresAt: number;
    value: T;
};

const INSTRUMENTS_CACHE_TTL_MS = 30_000;
const COMPARE_CACHE_TTL_MS = 8_000;
const SPOT_CACHE_TTL_MS = 5_000;
const EXPIRY_SCAN_CONCURRENCY = 3;

const instrumentsCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof listAllInstruments>>>>();
const compareCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof compare>>>>();
const spotCache = new Map<string, CacheEntry<number>>();

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function venuesKey(venues: Venue[]): string {
    return [...venues].sort().join(",");
}

async function listAllInstrumentsCached(underlying: string, venues: Venue[]) {
    const key = `${underlying}|${venuesKey(venues)}`;
    const cached = getCachedValue(instrumentsCache, key);
    if (cached) return cached;
    const value = await listAllInstruments(underlying, venues);
    setCachedValue(instrumentsCache, key, value, INSTRUMENTS_CACHE_TTL_MS);
    return value;
}

async function compareCached(underlying: string, expiry: string, venues: Venue[], benchmark: Venue) {
    const key = `${underlying}|${expiry}|${venuesKey(venues)}|${benchmark}`;
    const cached = getCachedValue(compareCache, key);
    if (cached) return cached;
    const value = await compare(underlying, expiry, venues, benchmark);
    setCachedValue(compareCache, key, value, COMPARE_CACHE_TTL_MS);
    return value;
}

async function spotCached(underlying: string) {
    const cached = getCachedValue(spotCache, underlying);
    if (cached != null) return cached;
    const spotsResult = await getSpots([underlying]);
    const value = spotsResult.spots[underlying] ?? 0;
    setCachedValue(spotCache, underlying, value, SPOT_CACHE_TTL_MS);
    return value;
}

function parseVenues(param: string | null): Venue[] {
    if (!param) return ["DERIBIT"];
    const venues = param
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter((v): v is Venue => ALL_VENUES.includes(v as Venue));
    return venues.length > 0 ? venues : ["DERIBIT"];
}

function eligibleArbVenuesForUnderlying(underlying: string): Venue[] {
    if (underlying === "IBIT") {
        return ["IBIT"];
    }
    return ["DERIBIT", "AEVO", "LYRA_V2"];
}

function normalizeArbVenues(underlying: string, requestedVenues: Venue[]): Venue[] {
    const eligible = eligibleArbVenuesForUnderlying(underlying);
    const filtered = requestedVenues.filter((venue) => eligible.includes(venue));
    return filtered.length > 0 ? filtered : eligible;
}

function nearestExpiries(expiries: string[], targetExpiry: string, limit: number): string[] {
    const targetMs = Date.parse(`${targetExpiry}T00:00:00.000Z`);
    if (!Number.isFinite(targetMs)) {
        return expiries.filter((expiry) => expiry !== targetExpiry).slice(0, limit);
    }
    return expiries
        .filter((expiry) => expiry !== targetExpiry)
        .map((expiry) => ({
            expiry,
            deltaMs: Math.abs(Date.parse(`${expiry}T00:00:00.000Z`) - targetMs),
        }))
        .sort((a, b) => a.deltaMs - b.deltaMs)
        .slice(0, limit)
        .map((entry) => entry.expiry);
}

const PLAYBOOK_VALUES: ArbPlaybook[] = ["ALL", "CROSS_VENUE", "BOX", "CALLS_ONLY", "PUTS_ONLY"];

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const underlying = (searchParams.get("underlying") || "BTC").toUpperCase();
    const expiry = searchParams.get("expiry");
    const venues = normalizeArbVenues(underlying, parseVenues(searchParams.get("venues")));
    const requestedBenchmark = (searchParams.get("benchmark")?.toUpperCase() || "DERIBIT") as Venue;
    const benchmark = venues.includes(requestedBenchmark) ? requestedBenchmark : venues[0];
    const playbookParam = (searchParams.get("playbook") || "ALL").toUpperCase() as ArbPlaybook;
    const playbook: ArbPlaybook = PLAYBOOK_VALUES.includes(playbookParam) ? playbookParam : "ALL";
    const scanAllExpiries = searchParams.get("scanAllExpiries") === "1" || playbook === "ALL";
    const hasCursorQuery = searchParams.has("scanCursor") || searchParams.has("scanBatchSize");
    const scanCursorRaw = Number(searchParams.get("scanCursor") || "0");
    const scanCursor = Number.isFinite(scanCursorRaw)
        ? Math.max(0, Math.floor(scanCursorRaw))
        : 0;
    const scanBatchSizeRaw = Number(searchParams.get("scanBatchSize") || "5");
    const scanBatchSize = Number.isFinite(scanBatchSizeRaw)
        ? Math.max(1, Math.min(20, Math.floor(scanBatchSizeRaw)))
        : 5;
    const scanPhaseParam = (searchParams.get("scanPhase") || "all").toLowerCase();
    const scanPhase: "all" | "latest" | "remaining" =
        scanPhaseParam === "latest" || scanPhaseParam === "remaining"
            ? scanPhaseParam
            : "all";
    const latestFirstCountRaw = Number(searchParams.get("latestFirstCount") || "5");
    const latestFirstCount = Number.isFinite(latestFirstCountRaw)
        ? Math.max(1, Math.min(12, Math.floor(latestFirstCountRaw)))
        : 5;
    const fallbackEnabled = searchParams.get("fallback") === "1";
    const fallbackLimitRaw = Number(searchParams.get("fallbackLimit") || "4");
    const fallbackLimit = Number.isFinite(fallbackLimitRaw)
        ? Math.max(1, Math.min(8, Math.floor(fallbackLimitRaw)))
        : 4;

    if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        return NextResponse.json({ error: "Missing or invalid expiry (YYYY-MM-DD)", opportunities: [] }, { status: 400 });
    }

    try {
        const spotPrice = await spotCached(underlying);
        const scannedExpiries: string[] = [];
        let scannedRows = 0;
        let scannedCalls = 0;
        let scannedPuts = 0;
        const scanErrors: string[] = [];

        const scanOneExpiry = async (targetExpiry: string): Promise<{
            expiry: string;
            opportunities: ReturnType<typeof getRisklessArbs>;
            rowsScanned: number;
            callsScanned: number;
            putsScanned: number;
            error: string | null;
        }> => {
            try {
                const compareResult = await compareCached(underlying, targetExpiry, venues, benchmark);
                const callsScanned = compareResult.rows.filter((row) => row.right === "C").length;
                const putsScanned = compareResult.rows.filter((row) => row.right === "P").length;
                const opportunities = getRisklessArbs(
                    compareResult.rows,
                    venues,
                    spotPrice,
                    DEFAULT_ARB_CONFIG,
                    playbook
                );
                return {
                    expiry: targetExpiry,
                    opportunities,
                    rowsScanned: compareResult.rows.length,
                    callsScanned,
                    putsScanned,
                    error: null,
                };
            } catch (err) {
                return {
                    expiry: targetExpiry,
                    opportunities: [],
                    rowsScanned: 0,
                    callsScanned: 0,
                    putsScanned: 0,
                    error: err instanceof Error ? err.message : "scan failed",
                };
            }
        };

        let opportunities: ReturnType<typeof getRisklessArbs> = [];
        let effectiveExpiry = expiry;
        let fallbackUsed = false;

        if (scanAllExpiries) {
            const instruments = await listAllInstrumentsCached(underlying, venues);
            const uniqueExpiries = Array.from(
                new Set(instruments.expiries.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))
            ).sort();
            const totalExpiriesAvailable = uniqueExpiries.length;
            const remainingExpiriesList = uniqueExpiries.slice(latestFirstCount);

            let batchStart = scanCursor;
            let batchEndExclusive = scanCursor + scanBatchSize;

            if (!hasCursorQuery && scanPhase === "latest") {
                batchStart = 0;
                batchEndExclusive = latestFirstCount;
            } else if (!hasCursorQuery && scanPhase === "remaining") {
                batchStart = latestFirstCount;
                batchEndExclusive = totalExpiriesAvailable;
            } else if (!hasCursorQuery && scanPhase === "all") {
                batchStart = 0;
                batchEndExclusive = totalExpiriesAvailable;
            }

            const safeStart = Math.min(Math.max(0, batchStart), totalExpiriesAvailable);
            const safeEnd = Math.min(Math.max(safeStart, batchEndExclusive), totalExpiriesAvailable);
            const expiriesToScan =
                totalExpiriesAvailable > 0
                    ? uniqueExpiries.slice(safeStart, safeEnd)
                    : [expiry];
            const allScanned: typeof opportunities = [];

            for (let i = 0; i < expiriesToScan.length; i += EXPIRY_SCAN_CONCURRENCY) {
                const chunk = expiriesToScan.slice(i, i + EXPIRY_SCAN_CONCURRENCY);
                const chunkResults = await Promise.all(chunk.map((candidateExpiry) => scanOneExpiry(candidateExpiry)));
                for (const result of chunkResults) {
                    scannedExpiries.push(result.expiry);
                    scannedRows += result.rowsScanned;
                    scannedCalls += result.callsScanned;
                    scannedPuts += result.putsScanned;
                    if (result.error) {
                        scanErrors.push(`${result.expiry}: ${result.error}`);
                    }
                    if (result.opportunities.length > 0) {
                        allScanned.push(...result.opportunities);
                    }
                }
            }

            const uniqueById = new Map<string, (typeof allScanned)[number]>();
            for (const opportunity of allScanned) {
                const current = uniqueById.get(opportunity.id);
                if (!current || opportunity.profitUSD_max > current.profitUSD_max) {
                    uniqueById.set(opportunity.id, opportunity);
                }
            }

            opportunities = Array.from(uniqueById.values()).sort((a, b) => {
                if (b.profitUSD_max !== a.profitUSD_max) return b.profitUSD_max - a.profitUSD_max;
                if (b.profitPct !== a.profitPct) return b.profitPct - a.profitPct;
                return a.quoteAgeMsMax - b.quoteAgeMsMax;
            });

            // Keep payload manageable for UI/rendering.
            if (opportunities.length > 250) {
                opportunities = opportunities.slice(0, 250);
            }
            effectiveExpiry = "ALL";
            const nextCursor = safeEnd >= totalExpiriesAvailable ? null : safeEnd;
            const scanComplete = nextCursor == null;

            return NextResponse.json({
                underlying,
                expiry: effectiveExpiry,
                requestedExpiry: expiry,
                venues,
                playbook,
                spotPrice,
                opportunities,
                count: opportunities.length,
                fallbackUsed,
                scanAllExpiries,
                scanPhase,
                latestFirstCount,
                scanCursor: safeStart,
                scanBatchSize: Math.max(1, safeEnd - safeStart),
                nextCursor,
                scanComplete,
                totalExpiriesAvailable,
                remainingExpiries:
                    !hasCursorQuery && scanPhase === "latest"
                        ? remainingExpiriesList.length
                        : nextCursor == null
                            ? 0
                            : totalExpiriesAvailable - nextCursor,
                scannedExpiries,
                scannedRows,
                scannedCalls,
                scannedPuts,
                scanErrors: scanErrors.length > 0 ? scanErrors : undefined,
                timestamp: Date.now(),
            });
        } else {
            const single = await scanOneExpiry(expiry);
            scannedExpiries.push(single.expiry);
            scannedRows += single.rowsScanned;
            scannedCalls += single.callsScanned;
            scannedPuts += single.putsScanned;
            if (single.error) scanErrors.push(`${single.expiry}: ${single.error}`);
            opportunities = single.opportunities;
            if (fallbackEnabled && opportunities.length === 0) {
                const instruments = await listAllInstrumentsCached(underlying, venues);
                const fallbackExpiries = nearestExpiries(instruments.expiries, expiry, fallbackLimit);

                for (const candidateExpiry of fallbackExpiries) {
                    const candidate = await scanOneExpiry(candidateExpiry);
                    scannedExpiries.push(candidate.expiry);
                    scannedRows += candidate.rowsScanned;
                    scannedCalls += candidate.callsScanned;
                    scannedPuts += candidate.putsScanned;
                    if (candidate.error) scanErrors.push(`${candidate.expiry}: ${candidate.error}`);
                    if (candidate.opportunities.length > 0) {
                        opportunities = candidate.opportunities;
                        effectiveExpiry = candidateExpiry;
                        fallbackUsed = true;
                        break;
                    }
                }
            }
        }

        return NextResponse.json({
            underlying,
            expiry: effectiveExpiry,
            requestedExpiry: expiry,
            venues,
            playbook,
            spotPrice,
            opportunities,
            count: opportunities.length,
            fallbackUsed,
            scanAllExpiries,
            scanPhase: "single",
            latestFirstCount,
            scanCursor: 0,
            scanBatchSize: 1,
            nextCursor: null,
            scanComplete: true,
            totalExpiriesAvailable: 1,
            remainingExpiries: 0,
            scannedExpiries,
            scannedRows,
            scannedCalls,
            scannedPuts,
            scanErrors: scanErrors.length > 0 ? scanErrors : undefined,
            timestamp: Date.now(),
        });
    } catch (err) {
        return NextResponse.json({
            underlying,
            expiry,
            requestedExpiry: expiry,
            venues,
            playbook,
            opportunities: [],
            count: 0,
            fallbackUsed: false,
            scanAllExpiries,
            scanPhase,
            latestFirstCount,
            scanCursor,
            scanBatchSize,
            nextCursor: null,
            scanComplete: false,
            totalExpiriesAvailable: 0,
            remainingExpiries: 0,
            scannedExpiries: [expiry],
            scannedRows: 0,
            scannedCalls: 0,
            scannedPuts: 0,
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: Date.now(),
        });
    }
}
