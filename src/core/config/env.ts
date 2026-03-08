export type NetworkEnv = "sepolia" | "mainnet";

function parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value == null) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function parseIntOr(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
    lyraEnabled: parseBool(process.env.LYRA_ENABLED, true),
    lyraApiBase: process.env.LYRA_API_BASE || "https://api.lyra.finance",

    panopticEnabled: parseBool(process.env.PANOPTIC_ENABLED, true),
    panopticSubgraphUrl: process.env.PANOPTIC_SUBGRAPH_URL || "",
    panopticNetwork: (process.env.PANOPTIC_NETWORK === "mainnet" ? "mainnet" : "sepolia") as NetworkEnv,

    ibitEnabled: parseBool(process.env.IBIT_ENABLED, true),

    newsApiKey: process.env.NEWSAPI_KEY || "",
    finnhubToken: process.env.FINNHUB_TOKEN || "",
    newsCacheTtlMs: parseIntOr(process.env.NEWS_CACHE_TTL_MS, 60000),

    spotCacheTtlMs: parseIntOr(process.env.SPOT_CACHE_TTL_MS, 2000),
    tickerCacheTtlMs: parseIntOr(process.env.TICKER_CACHE_TTL_MS, 5000),
};

export function missingRequiredEnvForVenue(venue: "LYRA_V2" | "PANOPTIC" | "IBIT"): string[] {
    if (venue === "LYRA_V2") {
        return env.lyraApiBase ? [] : ["LYRA_API_BASE"];
    }
    if (venue === "PANOPTIC") {
        return env.panopticSubgraphUrl ? [] : ["PANOPTIC_SUBGRAPH_URL"];
    }
    if (venue === "IBIT") {
        return [];
    }
    return [];
}

export function venueEnabled(venue: "DERIBIT" | "AEVO" | "LYRA_V2" | "PANOPTIC" | "IBIT"): boolean {
    if (venue === "LYRA_V2") return env.lyraEnabled;
    if (venue === "PANOPTIC") return env.panopticEnabled;
    if (venue === "IBIT") return env.ibitEnabled;
    return true;
}

