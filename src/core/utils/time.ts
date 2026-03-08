const MONTH_MAP: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/**
 * Parse Deribit-style date string to YYYY-MM-DD.
 * Examples: "29MAR26" â†’ "2026-03-29", "15JAN27" â†’ "2027-01-15"
 */
export function parseDeribitDate(dateStr: string): string {
    // Format: DDMMMYY e.g. 29MAR26
    const match = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
    if (!match) {
        throw new Error(`Cannot parse Deribit date: ${dateStr}`);
    }
    const [, day, month, year] = match;
    const mm = MONTH_MAP[month];
    if (!mm) throw new Error(`Unknown month: ${month}`);
    const dd = day.padStart(2, "0");
    const yyyy = `20${year}`;
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a Deribit instrument name.
 * Format: ETH-29MAR26-3500-P
 * Returns { underlying, expiry (YYYY-MM-DD), strike, right }
 */
export function parseDeribitInstrumentName(name: string): {
    underlying: string;
    expiry: string;
    strike: number;
    right: "C" | "P";
} {
    const parts = name.split("-");
    if (parts.length !== 4) {
        throw new Error(`Invalid Deribit instrument name: ${name}`);
    }
    return {
        underlying: parts[0],
        expiry: parseDeribitDate(parts[1]),
        strike: Number(parts[2]),
        right: parts[3] as "C" | "P",
    };
}

/**
 * Format a unix timestamp (seconds or ms) to YYYY-MM-DD.
 */
export function toDateString(ts: number): string {
    // If timestamp is in seconds (< year 2100 in seconds)
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

