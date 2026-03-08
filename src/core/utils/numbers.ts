/**
 * Format a price value with appropriate decimal places.
 * BTC: 1 decimal, ETH/IBIT: 2 decimals, others: 4 decimals.
 * Returns "-" for null/undefined.
 */
export function getPriceDisplayDecimals(
    underlying: string | undefined,
    value: number | null | undefined
): number {
    if (value == null || isNaN(value)) return 2;
    if (!underlying) return 4;

    const u = underlying.toUpperCase();
    const abs = Math.abs(value);

    if (u === "BTC") return 1;
    if (u === "ETH") return abs < 1 ? 3 : 2;
    if (u === "IBIT") {
        if (abs < 0.1) return 4;
        if (abs < 1) return 3;
        return 2;
    }
    return 4;
}

export function formatPrice(
    value: number | null | undefined,
    underlying?: string
): string {
    if (value == null || isNaN(value)) return "-";
    const decimals = getPriceDisplayDecimals(underlying, value);
    return value.toFixed(decimals);
}

/**
 * Format a percentage with sign and 2 decimals.
 * Returns "-" for null/undefined.
 */
export function formatPct(value: number | null | undefined): string {
    if (value == null || isNaN(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(2)}%`;
}

/**
 * Format IV as percentage (input is decimal, e.g. 0.65 = 65%).
 * Returns "-" for null/undefined.
 */
export function formatIv(value: number | null | undefined, decimals = 2): string {
    if (value == null || isNaN(value)) return "-";
    if (value < 0) return "-";
    const decimalIv = value > 3 ? value / 100 : value;
    return `${(decimalIv * 100).toFixed(decimals)}%`;
}

/**
 * Format open interest with commas.
 * Returns "-" for null/undefined.
 */
export function formatOI(value: number | null | undefined): string {
    if (value == null || isNaN(value)) return "-";
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Display dash for null values.
 */
export function dashNull(value: unknown): string {
    if (value == null) return "-";
    return String(value);
}
