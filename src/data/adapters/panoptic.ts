import { VenueAdapter, RawInstrument, RawQuote, makeVenueStatus } from "../index";
import { VenueStatus } from "../../core/types/options";
import { cache, PANOPTIC_LIQUIDITY_TTL } from "../../core/utils/cache";
import { postJSON } from "../../core/utils/http";
import { env, missingRequiredEnvForVenue, venueEnabled } from "../../core/config/env";
import { getUnderlyingFamily } from "../../core/types/options";

interface GraphQLError {
    message: string;
}

interface GraphQLResponse<T> {
    data?: T;
    errors?: GraphQLError[];
}

interface PanopticPool {
    id: string;
    tick?: string;
    liquidity?: string;
    totalLiquidity?: string;
    netLiquidity?: string;
    longLiquidity?: string;
    shortLiquidity?: string;
    token0?: {
        symbol?: string;
        name?: string;
    };
    token1?: {
        symbol?: string;
        name?: string;
    };
}

interface PanopticChunk {
    id: string;
    strike?: string;
    tickLower?: string;
    tickUpper?: string;
    tokenType?: string;
    netLiquidity?: string;
    longLiquidity?: string;
    shortLiquidity?: string;
    totalLiquidity?: string;
    pool?: { id: string };
}

interface PanopticPosition {
    id: string;
    strike?: string;
    tickLower?: string;
    tickUpper?: string;
    optionType?: string;
    isPut?: boolean;
    netLiquidity?: string;
    longLiquidity?: string;
    shortLiquidity?: string;
    pool?: { id: string };
}

interface PanopticQueryResult {
    pools?: PanopticPool[];
    chunks?: PanopticChunk[];
    positions?: PanopticPosition[];
}

type PanopticLiquidityRow = PanopticChunk | PanopticPosition;

let currentStatus: VenueStatus = makeVenueStatus("PANOPTIC", "degraded", "Not initialized");

function disabledOrMissingStatus(): VenueStatus | null {
    if (!venueEnabled("PANOPTIC")) {
        return makeVenueStatus("PANOPTIC", "degraded", "PANOPTIC_ENABLED=false");
    }

    const missing = missingRequiredEnvForVenue("PANOPTIC");
    if (missing.length > 0) {
        return makeVenueStatus("PANOPTIC", "degraded", `Missing env: ${missing.join(", ")}`);
    }

    return null;
}

function numberOrNull(value: unknown): number | null {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function inferRight(row: PanopticLiquidityRow): "C" | "P" {
    if ("isPut" in row && row.isPut === true) return "P";

    if ("optionType" in row && typeof row.optionType === "string") {
        const optionType = row.optionType.toLowerCase();
        if (optionType.includes("put") || optionType === "p") return "P";
        if (optionType.includes("call") || optionType === "c") return "C";
    }

    if ("tokenType" in row && row.tokenType != null) {
        const tokenType = String(row.tokenType).toLowerCase();
        // Panoptic bit encoding commonly uses 0=call and 1=put.
        if (tokenType === "1" || tokenType === "put" || tokenType === "p") return "P";
        if (tokenType === "0" || tokenType === "call" || tokenType === "c") return "C";
    }

    return "C";
}

function inferStrike(row: PanopticLiquidityRow): number {
    const explicit = numberOrNull(("strike" in row ? row.strike : null));
    if (explicit != null && explicit !== 0) return Math.abs(explicit);

    const low = numberOrNull(("tickLower" in row ? row.tickLower : null));
    const high = numberOrNull(("tickUpper" in row ? row.tickUpper : null));
    if (low != null && high != null) {
        return Math.abs((low + high) / 2);
    }

    return 0;
}

async function runSubgraphQuery(query: string): Promise<GraphQLResponse<PanopticQueryResult>> {
    return postJSON<GraphQLResponse<PanopticQueryResult>, { query: string }>(
        env.panopticSubgraphUrl,
        { query },
        {
            throttleKey: "panoptic:subgraph",
            minIntervalMs: 200,
            headers: {
                Accept: "application/json",
            },
        }
    );
}

function inferFamilyFromToken(token?: { symbol?: string; name?: string }): "BTC" | "ETH" | null {
    if (!token) return null;
    const bySymbol = token.symbol ? getUnderlyingFamily(token.symbol) : null;
    if (bySymbol === "BTC" || bySymbol === "ETH") return bySymbol;
    const byName = token.name ? getUnderlyingFamily(token.name) : null;
    if (byName === "BTC" || byName === "ETH") return byName;
    return null;
}

function poolSupportsFamily(pool: PanopticPool | undefined, requestedFamily: "BTC" | "ETH"): boolean {
    if (!pool) return true;
    const families = [inferFamilyFromToken(pool.token0), inferFamilyFromToken(pool.token1)].filter(
        (family): family is "BTC" | "ETH" => family != null
    );
    if (families.length === 0) return true;
    return families.includes(requestedFamily);
}

async function fetchLiquidityRows(requestedFamily: "BTC" | "ETH"): Promise<RawInstrument[]> {
    const v2Query = `
      query PanopticLiquidityV2 {
        pools(first: 30, orderBy: liquidity, orderDirection: desc) {
          id
          tick
          liquidity
          token0 { symbol name }
          token1 { symbol name }
        }
        chunks(first: 180, orderBy: totalLiquidity, orderDirection: desc) {
          id
          strike
          tickLower
          tickUpper
          tokenType
          netLiquidity
          longLiquidity
          shortLiquidity
          totalLiquidity
          pool { id }
        }
      }
    `;

    const legacyQuery = `
      query PanopticLiquidityLegacy {
        pools(first: 30, orderBy: totalLiquidity, orderDirection: desc) {
          id
          tick
          totalLiquidity
          netLiquidity
          longLiquidity
          shortLiquidity
          token0 { symbol name }
          token1 { symbol name }
        }
        positions(first: 120, orderBy: id, orderDirection: desc) {
          id
          strike
          tickLower
          tickUpper
          optionType
          isPut
          netLiquidity
          longLiquidity
          shortLiquidity
          pool { id }
        }
      }
    `;

    let response = await runSubgraphQuery(v2Query);

    if (response.errors?.length) {
        const message = response.errors.map((e) => e.message).join("; ");
        const schemaMismatch = /cannot query field|type `query` has no field|validation/i.test(message);
        if (!schemaMismatch) {
            throw new Error(message);
        }
        response = await runSubgraphQuery(legacyQuery);
    }

    if (response.errors?.length) {
        throw new Error(response.errors.map((e) => e.message).join("; "));
    }

    const pools = response.data?.pools ?? [];
    const chunks = response.data?.chunks ?? [];
    const positions = response.data?.positions ?? [];
    const liquidityRows: PanopticLiquidityRow[] = chunks.length > 0 ? chunks : positions;

    const byPool = new Map<string, PanopticPool>();
    for (const pool of pools) {
        byPool.set(pool.id, pool);
    }

    return liquidityRows
        .map((row): RawInstrument | null => {
            const poolId = row.pool?.id ?? null;
            const pool = poolId ? byPool.get(poolId) : undefined;
            if (!poolSupportsFamily(pool, requestedFamily)) {
                return null;
            }

            const netLiquidity =
                numberOrNull("netLiquidity" in row ? row.netLiquidity : null) ?? numberOrNull(pool?.netLiquidity);
            const longLiquidity =
                numberOrNull("longLiquidity" in row ? row.longLiquidity : null) ?? numberOrNull(pool?.longLiquidity);
            const shortLiquidity =
                numberOrNull("shortLiquidity" in row ? row.shortLiquidity : null) ?? numberOrNull(pool?.shortLiquidity);
            const totalLiquidity =
                numberOrNull("totalLiquidity" in row ? row.totalLiquidity : null) ??
                numberOrNull(pool?.totalLiquidity) ??
                numberOrNull(pool?.liquidity);

            return {
                id: row.id,
                underlying: requestedFamily,
                expiry: "-",
                strike: inferStrike(row),
                right: inferRight(row),
                quoteType: "LIQUIDITY_ONLY",
                warnings: ["PANOPTIC_LIQUIDITY_ONLY_NO_QUOTES"],
                poolId,
                poolTick: numberOrNull(pool?.tick),
                netLiquidity,
                longLiquidity,
                shortLiquidity,
                totalLiquidity,
                tickLower: numberOrNull("tickLower" in row ? row.tickLower : null),
                tickUpper: numberOrNull("tickUpper" in row ? row.tickUpper : null),
                tokenType: "tokenType" in row ? row.tokenType ?? null : null,
            };
        })
        .filter((row): row is RawInstrument => row != null);
}

export const panopticAdapter: VenueAdapter = {
    venue: "PANOPTIC",

    async listInstruments({ underlying }): Promise<RawInstrument[]> {
        const disabledStatus = disabledOrMissingStatus();
        if (disabledStatus) {
            currentStatus = disabledStatus;
            return [];
        }

        const requestedFamily = getUnderlyingFamily(underlying);
        if (requestedFamily !== "ETH" && requestedFamily !== "BTC") {
            currentStatus = makeVenueStatus("PANOPTIC", "degraded", "Panoptic liquidity currently supports BTC and ETH");
            return [];
        }

        const cacheKey = `panoptic:liquidity:${underlying.toUpperCase()}`;
        return cache.wrap(cacheKey, PANOPTIC_LIQUIDITY_TTL, async () => {
            try {
                const rows = await fetchLiquidityRows(requestedFamily);
                if (rows.length === 0) {
                    currentStatus = makeVenueStatus(
                        "PANOPTIC",
                        "degraded",
                        `No subgraph liquidity rows returned for ${requestedFamily}`
                    );
                    return [];
                }

                currentStatus = makeVenueStatus("PANOPTIC", "ok");
                return rows;
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown Panoptic error";
                if (message.toLowerCase().includes("cannot query field") || message.toLowerCase().includes("validation")) {
                    currentStatus = makeVenueStatus("PANOPTIC", "degraded", `Subgraph schema mismatch: ${message}`);
                    return [];
                }

                currentStatus = makeVenueStatus("PANOPTIC", "down", message);
                return [];
            }
        });
    },

    async getQuotes(): Promise<RawQuote[]> {
        const disabledStatus = disabledOrMissingStatus();
        if (disabledStatus) {
            currentStatus = disabledStatus;
            return [];
        }

        currentStatus = makeVenueStatus("PANOPTIC", "ok", "Liquidity-only venue, no quote stream");
        return [];
    },

    getStatus(): VenueStatus {
        return currentStatus;
    },
};

