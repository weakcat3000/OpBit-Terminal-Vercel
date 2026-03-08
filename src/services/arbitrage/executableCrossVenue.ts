import { Venue } from "../../core/types/venues";
import { CompareRow } from "../optionsService";
import { ArbConfig } from "./arbConfig";
import { ArbLeg, ArbOpportunity } from "./arbTypes";

/**
 * Scan CompareRows for cross-venue same-contract arbitrage.
 *
 * Rule: BUY at ASK (lowest), SELL at BID (highest).
 * Profit = bestSellBid - bestBuyAsk.
 */
export function scanCrossVenueArbs(
    rows: CompareRow[],
    venues: Venue[],
    config: ArbConfig,
    nowMs: number
): ArbOpportunity[] {
    const opportunities: ArbOpportunity[] = [];

    for (const row of rows) {
        let bestBuyVenue: Venue | null = null;
        let bestBuyAsk = Infinity;
        let bestBuyMid = 0;
        let bestBuyBid = 0;
        let bestBuySpread = 0;
        let bestBuySizeUSD = 0;
        let bestBuyHasSize = false;

        let bestSellVenue: Venue | null = null;
        let bestSellBid = -Infinity;
        let bestSellMid = 0;
        let bestSellAsk = 0;
        let bestSellSpread = 0;
        let bestSellSizeUSD = 0;
        let bestSellHasSize = false;

        let worstQuoteAge = 0;

        for (const venue of venues) {
            const vd = row.venues[venue];
            if (!vd) continue;

            const { bid, ask, mid, bidSize, askSize, updatedAt } = vd;
            if (bid == null || ask == null || mid == null || mid <= 0) continue;
            if (bid <= 0 || ask <= 0) continue;

            // Spread filter
            const spreadPct = (ask - bid) / mid;
            if (spreadPct >= config.maxSpreadPct) continue;

            // Quote freshness
            const age = updatedAt != null ? nowMs - updatedAt : 0;
            if (age > config.maxQuoteAgeMs) continue;
            worstQuoteAge = Math.max(worstQuoteAge, age);

            // Size in USD — treat missing size as "unknown" (allow through)
            const hasAskSize = askSize != null && askSize > 0;
            const hasBidSize = bidSize != null && bidSize > 0;
            const askSizeUSD = hasAskSize ? askSize * ask : 0;
            const bidSizeUSD = hasBidSize ? bidSize * bid : 0;

            // Best buy = lowest ask (size check relaxed if size unavailable)
            const buyPassesSize = hasAskSize ? askSizeUSD >= config.minLegSizeUsd : true;
            if (ask < bestBuyAsk && buyPassesSize) {
                bestBuyVenue = venue;
                bestBuyAsk = ask;
                bestBuyMid = mid;
                bestBuyBid = bid;
                bestBuySpread = spreadPct;
                bestBuySizeUSD = askSizeUSD;
                bestBuyHasSize = hasAskSize;
            }

            // Best sell = highest bid (size check relaxed if size unavailable)
            const sellPassesSize = hasBidSize ? bidSizeUSD >= config.minLegSizeUsd : true;
            if (bid > bestSellBid && sellPassesSize) {
                bestSellVenue = venue;
                bestSellBid = bid;
                bestSellMid = mid;
                bestSellAsk = ask;
                bestSellSpread = spreadPct;
                bestSellSizeUSD = bidSizeUSD;
                bestSellHasSize = hasBidSize;
            }
        }

        // Must be different venues
        if (!bestBuyVenue || !bestSellVenue) continue;
        if (bestBuyVenue === bestSellVenue) continue;

        const profitUSD_per1 = bestSellBid - bestBuyAsk;
        if (profitUSD_per1 <= 0) continue;

        const capitalUSD_per1 = bestBuyAsk;
        if (capitalUSD_per1 <= 0) continue;

        const profitPct = profitUSD_per1 / capitalUSD_per1;
        if (profitPct < config.minProfitPct) continue;

        // Liquidity: if both legs have size data, enforce notional minimum
        // If either leg is missing size, show as "unknown capacity"
        const bothHaveSize = bestBuyHasSize && bestSellHasSize;
        const maxSizeUSD = bothHaveSize
            ? Math.min(bestBuySizeUSD, bestSellSizeUSD)
            : bestBuyHasSize ? bestBuySizeUSD
                : bestSellHasSize ? bestSellSizeUSD
                    : 0;

        if (bothHaveSize && maxSizeUSD < config.minNotionalUsd) continue;

        const maxQty = maxSizeUSD > 0 ? maxSizeUSD / capitalUSD_per1 : 1;
        const profitUSD_max = profitUSD_per1 * maxQty;

        const optionType = row.right === "C" ? "CALL" : "PUT";

        const legs: ArbLeg[] = [
            {
                venue: bestBuyVenue,
                contractKey: row.contractKey,
                side: "BUY",
                pxUSD: bestBuyAsk,
                midUSD: bestBuyMid,
                bidUSD: bestBuyBid,
                askUSD: bestBuyAsk,
                spreadPct: bestBuySpread,
                sizeUSD: bestBuySizeUSD > 0 ? bestBuySizeUSD : undefined,
                strike: row.strike,
                right: row.right,
                expiry: row.expiry,
            },
            {
                venue: bestSellVenue,
                contractKey: row.contractKey,
                side: "SELL",
                pxUSD: bestSellBid,
                midUSD: bestSellMid,
                bidUSD: bestSellBid,
                askUSD: bestSellAsk,
                spreadPct: bestSellSpread,
                sizeUSD: bestSellSizeUSD > 0 ? bestSellSizeUSD : undefined,
                strike: row.strike,
                right: row.right,
                expiry: row.expiry,
            },
        ];

        opportunities.push({
            id: `CV|${row.contractKey}|${bestBuyVenue}|${bestSellVenue}`,
            kind: "CROSS_VENUE_SAME_CONTRACT",
            underlying: row.underlying,
            expiry: row.expiry,
            strike: row.strike,
            optionType,
            buyVenue: bestBuyVenue,
            sellVenue: bestSellVenue,
            legs,
            profitUSD_per1,
            capitalUSD_per1,
            profitPct,
            maxSizeUSD,
            profitUSD_max,
            quoteAgeMsMax: worstQuoteAge,
            label: `Buy ${optionType} ${row.strike} on ${bestBuyVenue} @ ${bestBuyAsk.toFixed(2)}, Sell on ${bestSellVenue} @ ${bestSellBid.toFixed(2)}`,
        });
    }

    return opportunities;
}
