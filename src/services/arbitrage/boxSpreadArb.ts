import { Venue } from "../../core/types/venues";
import { CompareRow } from "../optionsService";
import { ArbConfig } from "./arbConfig";
import { ArbLeg, ArbOpportunity } from "./arbTypes";

interface LegQuote {
    bid: number;
    ask: number;
    mid: number;
    spreadPct: number;
    sizeUSD: number;
    hasSize: boolean;
    quoteAgeMs: number;
    bidSize?: number | null;
    askSize?: number | null;
}

function extractLeg(
    row: CompareRow,
    venue: Venue,
    nowMs: number
): LegQuote | null {
    const vd = row.venues[venue];
    if (!vd) return null;

    const { bid, ask, mid, bidSize, askSize, updatedAt } = vd;
    if (bid == null || ask == null || mid == null || mid <= 0) return null;

    const spreadPct = (ask - bid) / mid;
    const quoteAgeMs = updatedAt != null ? nowMs - updatedAt : 0;

    const hasBidSize = bidSize != null && bidSize > 0;
    const hasAskSize = askSize != null && askSize > 0;
    const bidSizeUSD = hasBidSize ? bidSize * bid : 0;
    const askSizeUSD = hasAskSize ? askSize * ask : 0;
    const sizeUSD = Math.min(
        bidSizeUSD > 0 ? bidSizeUSD : Infinity,
        askSizeUSD > 0 ? askSizeUSD : Infinity
    );
    const hasSize = hasBidSize || hasAskSize;

    return {
        bid, ask, mid, spreadPct, quoteAgeMs,
        sizeUSD: Number.isFinite(sizeUSD) ? sizeUSD : 0,
        hasSize,
        bidSize, askSize,
    };
}

function passesLegFilter(leg: LegQuote, config: ArbConfig): boolean {
    if (leg.spreadPct >= config.maxSpreadPct) return false;
    if (leg.quoteAgeMs > config.maxQuoteAgeMs) return false;
    // Only enforce size filter if size data is available
    if (leg.hasSize && leg.sizeUSD < config.minLegSizeUsd) return false;
    return true;
}

/**
 * Scan for intra-venue box spread arbitrage.
 *
 * Long Box:
 *   BUY Call(K1) @ ASK
 *   SELL Call(K2) @ BID
 *   SELL Put(K1) @ BID
 *   BUY Put(K2) @ ASK
 *
 * Payoff at expiry = K2 - K1 (fixed, riskless)
 * Cost = ASK(C1) - BID(C2) - BID(P1) + ASK(P2)
 * Profit = payoff - cost
 *
 * Excludes IBIT (early exercise risk).
 */
export function scanBoxSpreadArbs(
    rows: CompareRow[],
    venues: Venue[],
    spotPrice: number,
    config: ArbConfig,
    nowMs: number
): ArbOpportunity[] {
    const opportunities: ArbOpportunity[] = [];

    // Exclude IBIT from box scans (early exercise risk)
    const eligibleVenues = venues.filter((v) => v !== "IBIT");
    if (eligibleVenues.length === 0) return opportunities;

    // Strike band
    const minStrike = spotPrice * config.boxStrikeBand[0];
    const maxStrike = spotPrice * config.boxStrikeBand[1];

    // Group rows by expiry
    const byExpiry = new Map<string, CompareRow[]>();
    for (const row of rows) {
        if (row.strike < minStrike || row.strike > maxStrike) continue;
        const arr = byExpiry.get(row.expiry) ?? [];
        arr.push(row);
        byExpiry.set(row.expiry, arr);
    }

    for (const [expiry, expiryRows] of byExpiry) {
        // Build lookup: strike -> { C: row, P: row } per venue
        for (const venue of eligibleVenues) {
            const callsByStrike = new Map<number, CompareRow>();
            const putsByStrike = new Map<number, CompareRow>();

            for (const row of expiryRows) {
                if (!row.venues[venue]) continue;
                if (row.right === "C") callsByStrike.set(row.strike, row);
                else putsByStrike.set(row.strike, row);
            }

            const strikes = Array.from(
                new Set([...callsByStrike.keys(), ...putsByStrike.keys()])
            ).sort((a, b) => a - b);

            // Iterate strike pairs (K1 < K2)
            for (let i = 0; i < strikes.length; i++) {
                for (let j = i + 1; j < strikes.length; j++) {
                    const k1 = strikes[i];
                    const k2 = strikes[j];

                    const c1Row = callsByStrike.get(k1);
                    const c2Row = callsByStrike.get(k2);
                    const p1Row = putsByStrike.get(k1);
                    const p2Row = putsByStrike.get(k2);

                    if (!c1Row || !c2Row || !p1Row || !p2Row) continue;

                    const c1 = extractLeg(c1Row, venue, nowMs);
                    const c2 = extractLeg(c2Row, venue, nowMs);
                    const p1 = extractLeg(p1Row, venue, nowMs);
                    const p2 = extractLeg(p2Row, venue, nowMs);

                    if (!c1 || !c2 || !p1 || !p2) continue;
                    if (!passesLegFilter(c1, config)) continue;
                    if (!passesLegFilter(c2, config)) continue;
                    if (!passesLegFilter(p1, config)) continue;
                    if (!passesLegFilter(p2, config)) continue;

                    // Long box cost
                    const cost = c1.ask - c2.bid - p1.bid + p2.ask;
                    if (cost <= 0) continue;

                    const payoff = k2 - k1;
                    const profitUSD_per1 = payoff - cost;
                    if (profitUSD_per1 <= 0) continue;

                    const profitPct = profitUSD_per1 / cost;
                    if (profitPct < config.minProfitPct) continue;

                    const allHaveSize = c1.hasSize && c2.hasSize && p1.hasSize && p2.hasSize;
                    const maxSizeUSD = allHaveSize
                        ? Math.min(c1.sizeUSD, c2.sizeUSD, p1.sizeUSD, p2.sizeUSD)
                        : 0;
                    if (allHaveSize && maxSizeUSD < config.minNotionalUsd) continue;

                    const worstAge = Math.max(
                        c1.quoteAgeMs, c2.quoteAgeMs,
                        p1.quoteAgeMs, p2.quoteAgeMs
                    );

                    const maxQty = maxSizeUSD > 0 ? maxSizeUSD / cost : 1;
                    const profitUSD_max = profitUSD_per1 * maxQty;

                    const legs: ArbLeg[] = [
                        {
                            venue, contractKey: c1Row.contractKey, side: "BUY",
                            pxUSD: c1.ask, midUSD: c1.mid, bidUSD: c1.bid, askUSD: c1.ask,
                            spreadPct: c1.spreadPct, sizeUSD: c1.sizeUSD,
                            strike: k1, right: "C", expiry,
                        },
                        {
                            venue, contractKey: c2Row.contractKey, side: "SELL",
                            pxUSD: c2.bid, midUSD: c2.mid, bidUSD: c2.bid, askUSD: c2.ask,
                            spreadPct: c2.spreadPct, sizeUSD: c2.sizeUSD,
                            strike: k2, right: "C", expiry,
                        },
                        {
                            venue, contractKey: p1Row.contractKey, side: "SELL",
                            pxUSD: p1.bid, midUSD: p1.mid, bidUSD: p1.bid, askUSD: p1.ask,
                            spreadPct: p1.spreadPct, sizeUSD: p1.sizeUSD,
                            strike: k1, right: "P", expiry,
                        },
                        {
                            venue, contractKey: p2Row.contractKey, side: "BUY",
                            pxUSD: p2.ask, midUSD: p2.mid, bidUSD: p2.bid, askUSD: p2.ask,
                            spreadPct: p2.spreadPct, sizeUSD: p2.sizeUSD,
                            strike: k2, right: "P", expiry,
                        },
                    ];

                    opportunities.push({
                        id: `BOX|${venue}|${expiry}|${k1}|${k2}`,
                        kind: "INTRA_VENUE_BOX",
                        underlying: expiryRows[0]?.underlying ?? "BTC",
                        expiry,
                        strikes: [k1, k2],
                        venue,
                        legs,
                        profitUSD_per1,
                        capitalUSD_per1: cost,
                        profitPct,
                        maxSizeUSD,
                        profitUSD_max,
                        quoteAgeMsMax: worstAge,
                        label: `Box ${k1}/${k2} on ${venue} — payoff $${payoff.toFixed(0)}, cost $${cost.toFixed(2)}`,
                    });
                }
            }
        }
    }

    return opportunities;
}
