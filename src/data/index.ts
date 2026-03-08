import { Venue } from "../core/types/venues";
import {
    VenueStatus,
    VenueLiveStatusCode,
    QuoteType,
} from "../core/types/options";

// â”€â”€â”€ Raw types from venue APIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface RawInstrument {
    id: string;
    underlying: string;
    expiry: string; // raw venue format
    strike: number;
    right: "C" | "P";
    contractMultiplier?: number;
    quoteType?: QuoteType;
    warnings?: string[];
    [key: string]: unknown;
}

export interface RawQuote {
    instrumentId: string;
    bid: number | null;
    ask: number | null;
    bidSize?: number | null;
    askSize?: number | null;
    last: number | null;
    markIv: number | null;
    delta?: number | null;
    gamma?: number | null;
    theta?: number | null;
    vega?: number | null;
    rho?: number | null;
    openInterest: number | null;
    quoteType?: QuoteType;
    warnings?: string[];
    [key: string]: unknown;
}

// â”€â”€â”€ Adapter interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface VenueAdapter {
    venue: Venue;

    /** List available option instruments for the given underlying. */
    listInstruments(params: {
        underlying: string;
    }): Promise<RawInstrument[]>;

    /** Get quotes for instruments. Optionally filter by expiry. */
    getQuotes(params: {
        underlying: string;
        expiry?: string;
    }): Promise<RawQuote[]>;

    /** Optional: subscribe to live quote updates. Returns unsubscribe fn. */
    subscribeQuotes?(
        params: { underlying: string },
        onTick: (quote: RawQuote) => void
    ): () => void;

    /** Get current venue status. */
    getStatus(): VenueStatus;
}

// â”€â”€â”€ Adapter registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const adapterRegistry = new Map<Venue, VenueAdapter>();

export function registerAdapter(adapter: VenueAdapter): void {
    adapterRegistry.set(adapter.venue, adapter);
}

export function getAdapter(venue: Venue): VenueAdapter | undefined {
    return adapterRegistry.get(venue);
}

export function getAllAdapters(): VenueAdapter[] {
    return Array.from(adapterRegistry.values());
}

export function makeVenueStatus(
    venue: Venue,
    status: VenueLiveStatusCode,
    reason?: string
): VenueStatus {
    return {
        venue,
        status,
        reason,
        lastUpdated: Date.now(),
    };
}

