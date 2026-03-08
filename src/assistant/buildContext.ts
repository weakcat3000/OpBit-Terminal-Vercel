import { Venue } from "@/src/core/types/venues";
import { CompareRow } from "@/src/services/optionsService";
import { ExecutionSide } from "@/src/streaming/types";
import { StrategyLeg, StrategyScenario } from "@/src/strategy/StrategyTypes";

export interface AssistantContextInput {
    underlying: string;
    spot: number | null;
    availableExpiries: string[];
    selectedExpiry: string | null;
    selectedContractKey: string | null;
    selectedSide: "C" | "P" | null;
    selectedStrike: number | null;
    selectedContract?: CompareRow | null;
    currentPanel: "CHAIN" | "SMILE" | "TERM" | "VOL" | "FAIR" | "ARBITRAGE" | "STRATEGY";
    viewMode: "COMPARE" | "BEST";
    executionSide: ExecutionSide;
    venues: Venue[];
    rows: CompareRow[];
    ibitMarketState?: string | null;
    fairSummary?: {
        winner: string | null;
        explain: string;
        rowCount: number;
    } | null;
    strategy?: {
        drawerOpen: boolean;
        legs: StrategyLeg[];
        scenario: StrategyScenario;
        spot: number;
    } | null;
    arbitrage?: {
        playbook: "ALL" | "CROSS_VENUE" | "BOX" | "CALLS_ONLY" | "PUTS_ONLY";
        loading: boolean;
        needsRescan: boolean;
        scanStatusLabel: string;
        scanProgressPct: number;
        scannedContracts: number;
        scannedExpiriesCount: number;
        opportunityCount: number;
        trackedContractCount: number;
        topOpportunities: Array<{
            id: string;
            kind: "CROSS_VENUE_SAME_CONTRACT" | "INTRA_VENUE_BOX" | "INTRA_VENUE_PUT_CALL_PARITY";
            expiry: string;
            strike: number | null;
            optionType: "CALL" | "PUT" | null;
            profitPct: number;
            profitUSD_per1: number;
            maxSizeUSD: number;
        }>;
    } | null;
}

interface AssistantContextRow {
    contractKey: string;
    strike: number;
    right: "C" | "P";
    bestVenue: Venue | null;
    bestMidUsed: number | null | undefined;
    bestSource: "mid" | "avgBidAsk" | null | undefined;
    bestBid: number | null;
    bestAsk: number | null;
    bestWarnings?: string[];
    venues: Partial<Record<Venue, {
        bid: number | null;
        ask: number | null;
        mid: number | null;
        bidSize: number | null | undefined;
        askSize: number | null | undefined;
        markIv: number | null;
        vsBenchmarkPct: number | null;
    }>>;
}

export interface AssistantUiContext {
    platform: {
        product: "OpBit";
        mode: "terminal_analytics";
        executesOrdersDirectly: false;
        orderExecutionPath: "external_exchange_links";
        executionNote: string;
    };
    market: {
        underlying: string;
        spot: number | null;
        ibitMarketState: string | null;
        availableExpiries: string[];
        viewMode: "COMPARE" | "BEST";
        executionSide: ExecutionSide;
        venues: Venue[];
    };
    selection: {
        selectedExpiry: string | null;
        selectedContractKey: string | null;
        selectedSide: "C" | "P" | null;
        selectedStrike: number | null;
        selectedContractDetails: {
            underlying: string;
            expiry: string;
            strike: number;
            right: "C" | "P";
            bestVenue: Venue | null;
            bestBid: number | null;
            bestAsk: number | null;
            bestMidUsed: number | null | undefined;
            bestSource: "mid" | "avgBidAsk" | null | undefined;
        } | null;
    };
    panels: {
        currentPanel: "CHAIN" | "SMILE" | "TERM" | "VOL" | "FAIR" | "ARBITRAGE" | "STRATEGY";
        fairSummary: {
            winner: string | null;
            explain: string;
            rowCount: number;
        } | null;
    };
    chain: {
        totalRows: number;
        atmStrike: number | null;
        visibleStrikes: number[];
        visibleRows: AssistantContextRow[];
    };
    best: {
        preferredRows: Array<{
            contractKey: string;
            strike: number;
            right: "C" | "P";
            bestVenue: Venue | null;
            bestMidUsed: number | null | undefined;
            bestSource: "mid" | "avgBidAsk" | null | undefined;
        }>;
    };
    arbitrageSignals: Array<{
        label: string;
        contractKey: string;
        value: number;
    }>;
    arbitrage: {
        playbook: "ALL" | "CROSS_VENUE" | "BOX" | "CALLS_ONLY" | "PUTS_ONLY";
        loading: boolean;
        needsRescan: boolean;
        scanStatusLabel: string;
        scanProgressPct: number;
        scannedContracts: number;
        scannedExpiriesCount: number;
        opportunityCount: number;
        trackedContractCount: number;
        topOpportunities: Array<{
            id: string;
            kind: "CROSS_VENUE_SAME_CONTRACT" | "INTRA_VENUE_BOX" | "INTRA_VENUE_PUT_CALL_PARITY";
            expiry: string;
            strike: number | null;
            optionType: "CALL" | "PUT" | null;
            profitPct: number;
            profitPctDisplay: string;
            profitUSD_per1: number;
            maxSizeUSD: number;
        }>;
    } | null;
    strategyBuilder: {
        drawerOpen: boolean;
        legCount: number;
        scenario: StrategyScenario | null;
        legs: Array<{
            contractKey: string;
            side: "BUY" | "SELL";
            quantity: number;
            strike: number;
            type: "CALL" | "PUT";
            expiry: string;
            venue: Venue;
            currentMark: number | null;
        }>;
    };
}

function nearestStrike(rows: CompareRow[], spot: number | null): number | null {
    if (rows.length === 0) return null;
    if (spot == null || !Number.isFinite(spot)) {
        const sorted = [...rows].sort((a, b) => a.strike - b.strike);
        const middle = sorted[Math.floor(sorted.length / 2)];
        return middle?.strike ?? null;
    }

    let bestStrike = rows[0].strike;
    let bestDistance = Math.abs(bestStrike - spot);

    for (const row of rows) {
        const distance = Math.abs(row.strike - spot);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestStrike = row.strike;
        }
    }

    return bestStrike;
}

function compactRows(rows: CompareRow[], spot: number | null, maxRows = 100): CompareRow[] {
    if (rows.length <= maxRows) {
        return [...rows].sort((a, b) => a.strike - b.strike || a.right.localeCompare(b.right));
    }

    const atm = nearestStrike(rows, spot);
    if (atm == null) {
        return [...rows]
            .sort((a, b) => a.strike - b.strike || a.right.localeCompare(b.right))
            .slice(0, maxRows);
    }

    return [...rows]
        .sort((a, b) => {
            const da = Math.abs(a.strike - atm);
            const db = Math.abs(b.strike - atm);
            if (da !== db) return da - db;
            return a.strike - b.strike || a.right.localeCompare(b.right);
        })
        .slice(0, maxRows)
        .sort((a, b) => a.strike - b.strike || a.right.localeCompare(b.right));
}

function normalizeIvToPct(iv: number | null | undefined): number | null {
    if (iv == null || !Number.isFinite(iv)) return null;
    return iv > 3 ? iv : iv * 100;
}

export function buildAssistantContext(input: AssistantContextInput): AssistantUiContext {
    const visible = compactRows(input.rows, input.spot, 110);

    const visibleRows: AssistantContextRow[] = visible.map((row) => {
        const compactVenueData: AssistantContextRow["venues"] = {};
        for (const venue of input.venues) {
            const venueRow = row.venues[venue];
            if (!venueRow) continue;
            compactVenueData[venue] = {
                bid: venueRow.bid,
                ask: venueRow.ask,
                mid: venueRow.mid,
                bidSize: venueRow.bidSize,
                askSize: venueRow.askSize,
                markIv: normalizeIvToPct(venueRow.markIv),
                vsBenchmarkPct: venueRow.vsBenchmarkPct,
            };
        }

        return {
            ...(() => {
                const bestVenueData = row.bestVenue ? row.venues[row.bestVenue] : undefined;
                return {
                    bestBid: bestVenueData?.bid ?? null,
                    bestAsk: bestVenueData?.ask ?? null,
                };
            })(),
            contractKey: row.contractKey,
            strike: row.strike,
            right: row.right,
            bestVenue: row.bestVenue,
            bestMidUsed: row.bestMidUsed,
            bestSource: row.bestSource,
            bestWarnings: row.bestWarnings,
            venues: compactVenueData,
        };
    });

    const preferredRows = visibleRows
        .filter((row) => row.bestVenue != null)
        .slice(0, 30)
        .map((row) => ({
            contractKey: row.contractKey,
            strike: row.strike,
            right: row.right,
            bestVenue: row.bestVenue,
            bestMidUsed: row.bestMidUsed,
            bestSource: row.bestSource,
        }));

    return {
        platform: {
            product: "OpBit",
            mode: "terminal_analytics",
            executesOrdersDirectly: false,
            orderExecutionPath: "external_exchange_links",
            executionNote: "OpBit shows cross-exchange prices and links users to venues for actual order placement.",
        },
        market: {
            underlying: input.underlying,
            spot: input.spot,
            ibitMarketState: input.ibitMarketState ?? null,
            availableExpiries: input.availableExpiries.slice(0, 60),
            viewMode: input.viewMode,
            executionSide: input.executionSide,
            venues: input.venues,
        },
        selection: {
            selectedExpiry: input.selectedExpiry,
            selectedContractKey: input.selectedContractKey,
            selectedSide: input.selectedSide,
            selectedStrike: input.selectedStrike,
            selectedContractDetails: input.selectedContract
                ? {
                    underlying: input.selectedContract.underlying,
                    expiry: input.selectedContract.expiry,
                    strike: input.selectedContract.strike,
                    right: input.selectedContract.right,
                    bestVenue: input.selectedContract.bestVenue,
                    bestBid: input.selectedContract.bestVenue
                        ? (input.selectedContract.venues[input.selectedContract.bestVenue]?.bid ?? null)
                        : null,
                    bestAsk: input.selectedContract.bestVenue
                        ? (input.selectedContract.venues[input.selectedContract.bestVenue]?.ask ?? null)
                        : null,
                    bestMidUsed: input.selectedContract.bestMidUsed,
                    bestSource: input.selectedContract.bestSource,
                }
                : null,
        },
        panels: {
            currentPanel: input.currentPanel,
            fairSummary: input.fairSummary ?? null,
        },
        chain: {
            totalRows: input.rows.length,
            atmStrike: nearestStrike(input.rows, input.spot),
            visibleStrikes: Array.from(new Set(visibleRows.map((row) => row.strike))).sort((a, b) => a - b),
            visibleRows,
        },
        best: {
            preferredRows,
        },
        arbitrageSignals: [],
        arbitrage: input.arbitrage
            ? {
                ...input.arbitrage,
                topOpportunities: input.arbitrage.topOpportunities.slice(0, 10).map((opp) => ({
                    ...opp,
                    profitPctDisplay: `${(opp.profitPct * 100).toFixed(2)}%`,
                })),
            }
            : null,
        strategyBuilder: {
            drawerOpen: input.strategy?.drawerOpen ?? false,
            legCount: input.strategy?.legs.length ?? 0,
            scenario: input.strategy?.scenario ?? null,
            legs: (input.strategy?.legs ?? []).slice(0, 20).map((leg) => ({
                contractKey: leg.contractKey,
                side: leg.side,
                quantity: leg.quantity,
                strike: leg.strike,
                type: leg.type,
                expiry: leg.expiry,
                venue: leg.venue,
                currentMark: leg.currentMark,
            })),
        },
    };
}
