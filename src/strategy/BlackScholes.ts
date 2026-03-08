/**
 * Black-Scholes pricing and Greeks.
 * r (risk-free rate) defaults to 0 for crypto.
 */

const SQRT2PI = Math.sqrt(2 * Math.PI);

/** Standard normal PDF */
export function pdf(x: number): number {
    return Math.exp(-0.5 * x * x) / SQRT2PI;
}

/**
 * Standard normal CDF (Abramowitz & Stegun approximation).
 * Max error ≈ 7.5e-8.
 */
export function cdf(x: number): number {
    if (x >= 8) return 1;
    if (x <= -8) return 0;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

    return 0.5 * (1.0 + sign * y);
}

function d1d2(S: number, K: number, T: number, sigma: number, r: number): [number, number] {
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    return [d1, d2];
}

/** Option price via Black-Scholes */
export function bsPrice(
    S: number, K: number, T: number, sigma: number, r: number, type: "CALL" | "PUT"
): number {
    if (T <= 0) {
        // At expiry → intrinsic
        return type === "CALL" ? Math.max(0, S - K) : Math.max(0, K - S);
    }
    const [d1, d2] = d1d2(S, K, T, sigma, r);
    if (type === "CALL") {
        return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
    }
    return K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
}

/** Delta */
export function bsDelta(
    S: number, K: number, T: number, sigma: number, r: number, type: "CALL" | "PUT"
): number {
    if (T <= 0) {
        if (type === "CALL") return S > K ? 1 : 0;
        return S < K ? -1 : 0;
    }
    const [d1] = d1d2(S, K, T, sigma, r);
    return type === "CALL" ? cdf(d1) : cdf(d1) - 1;
}

/** Gamma (same for calls and puts) */
export function bsGamma(
    S: number, K: number, T: number, sigma: number, r: number
): number {
    if (T <= 0) return 0;
    const [d1] = d1d2(S, K, T, sigma, r);
    return pdf(d1) / (S * sigma * Math.sqrt(T));
}

/** Theta (per day, negative convention) */
export function bsTheta(
    S: number, K: number, T: number, sigma: number, r: number, type: "CALL" | "PUT"
): number {
    if (T <= 0) return 0;
    const sqrtT = Math.sqrt(T);
    const [d1, d2] = d1d2(S, K, T, sigma, r);
    const term1 = -(S * pdf(d1) * sigma) / (2 * sqrtT);

    if (type === "CALL") {
        const term2 = -r * K * Math.exp(-r * T) * cdf(d2);
        return (term1 + term2) / 365;
    }
    const term2 = r * K * Math.exp(-r * T) * cdf(-d2);
    return (term1 + term2) / 365;
}

/** Vega (per 1% move in vol) */
export function bsVega(
    S: number, K: number, T: number, sigma: number, r: number
): number {
    if (T <= 0) return 0;
    const [d1] = d1d2(S, K, T, sigma, r);
    return (S * pdf(d1) * Math.sqrt(T)) / 100;
}
