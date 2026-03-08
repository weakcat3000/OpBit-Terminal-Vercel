import { useShallow } from "zustand/react/shallow";
import { Venue } from "@/src/core/types/venues";
import { QuoteKey, StreamQuote, VenueHealthSnapshot } from "./types";
import { useMarketStreamStore } from "./useMarketStreamStore";

export function makeQuoteKey(venue: Venue, contractKey: string): QuoteKey {
    return `${venue}|${contractKey}`;
}

export function getQuoteFromMap(
    quotes: Record<QuoteKey, StreamQuote>,
    venue: Venue,
    contractKey: string
): StreamQuote | undefined {
    return quotes[makeQuoteKey(venue, contractKey)];
}

export function useQuoteForVenueContract(
    venue: Venue,
    contractKey: string
): StreamQuote | undefined {
    return useMarketStreamStore((state) => state.quotes[makeQuoteKey(venue, contractKey)]);
}

export function useQuotesForContract(
    venues: Venue[],
    contractKey: string
): Partial<Record<Venue, StreamQuote | undefined>> {
    return useMarketStreamStore(
        useShallow((state) => {
            const out: Partial<Record<Venue, StreamQuote | undefined>> = {};
            for (const venue of venues) {
                out[venue] = state.quotes[makeQuoteKey(venue, contractKey)];
            }
            return out;
        })
    );
}

export function useVenueHealth(venue: Venue): VenueHealthSnapshot {
    return useMarketStreamStore((state) => state.venueHealth[venue]);
}

export function useVenueHealthMap(): Record<Venue, VenueHealthSnapshot> {
    return useMarketStreamStore((state) => state.venueHealth);
}

