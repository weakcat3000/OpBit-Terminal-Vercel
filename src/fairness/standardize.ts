import {
    NormalizedOption,
    StandardizedOption,
    getUnderlyingFamily,
} from "../core/types/options";

function parseExpiryToT(expiry: string, nowMs: number): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
    const expiryMs = Date.parse(`${expiry}T00:00:00.000Z`);
    if (!Number.isFinite(expiryMs)) return null;

    const yearMs = 365.25 * 24 * 60 * 60 * 1000;
    const t = (expiryMs - nowMs) / yearMs;
    return t > 0 ? t : null;
}

function optionMid(opt: NormalizedOption): { value: number | null; source: "mid" | "avgBidAsk" | null } {
    if (opt.mid != null && Number.isFinite(opt.mid)) {
        return { value: opt.mid, source: "mid" };
    }

    if (opt.bid != null && opt.ask != null && Number.isFinite(opt.bid) && Number.isFinite(opt.ask)) {
        return { value: (opt.bid + opt.ask) / 2, source: "avgBidAsk" };
    }

    return { value: null, source: null };
}

function normalizeIv(markIv: number | null | undefined): number | null {
    if (markIv == null || !Number.isFinite(markIv)) return null;
    if (markIv > 3) return markIv / 100;
    if (markIv < 0) return null;
    return markIv;
}

function finiteOrNull(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
}

function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const abs = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1 / (1 + p * abs);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-abs * abs);
    return sign * y;
}

function normCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function blackScholesPrice(
    isCall: boolean,
    S: number,
    K: number,
    T: number,
    sigma: number
): number {
    if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return NaN;

    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    if (isCall) {
        return S * normCdf(d1) - K * normCdf(d2);
    }
    return K * normCdf(-d2) - S * normCdf(-d1);
}

function solveIvBisection(
    isCall: boolean,
    price: number,
    S: number,
    K: number,
    T: number
): number | null {
    if (!(price > 0) || !(S > 0) || !(K > 0) || !(T > 0)) return null;

    let lo = 1e-6;
    let hi = 5.0;
    let mid = 0;

    for (let i = 0; i < 60; i++) {
        mid = (lo + hi) / 2;
        const model = blackScholesPrice(isCall, S, K, T, mid);
        if (!Number.isFinite(model)) return null;

        const diff = model - price;
        if (Math.abs(diff) < 1e-8) return mid;

        if (diff > 0) {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    return mid;
}

interface BsGreeks {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
}

function blackScholesGreeks(
    isCall: boolean,
    S: number,
    K: number,
    T: number,
    sigma: number
): BsGreeks | null {
    if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return null;

    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const pdfD1 = normPdf(d1);

    const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
    const gamma = pdfD1 / (S * sigma * sqrtT);

    // Theta is normalized to per-day decay to match UI expectations.
    const thetaPerYear = -(S * pdfD1 * sigma) / (2 * sqrtT);
    const theta = thetaPerYear / 365.25;

    // Vega/rho are normalized to per 1% changes.
    const vega = (S * pdfD1 * sqrtT) / 100;
    const rhoPerRate = isCall ? K * T * normCdf(d2) : -K * T * normCdf(-d2);
    const rho = rhoPerRate / 100;

    return { delta, gamma, theta, vega, rho };
}

function pushWarning(standard: StandardizedOption, warning: string): void {
    if (!standard.warnings) standard.warnings = [];
    if (!standard.warnings.includes(warning)) standard.warnings.push(warning);
}

export function standardizeOption(
    opt: NormalizedOption,
    spotMap: Record<string, number | null>,
    nowMs: number
): NormalizedOption {
    const family = getUnderlyingFamily(opt.underlying);
    const spot = family ? (spotMap[family] ?? null) : null;
    const T = parseExpiryToT(opt.expiry, nowMs);
    const midInfo = optionMid(opt);

    const standard: StandardizedOption = {
        spot,
        T,
        moneyness: spot != null && opt.strike > 0 ? opt.strike / spot : null,
        midUsd: midInfo.value,
        midUsdPerUnderlying: midInfo.value,
        iv: null,
        delta: null,
        gamma: null,
        theta: null,
        vega: null,
        rho: null,
        warnings: [],
    };

    const sourceIv = normalizeIv(opt.markIv);
    if (sourceIv != null) {
        standard.iv = sourceIv;
    } else if (
        standard.midUsd != null &&
        standard.spot != null &&
        standard.T != null &&
        standard.T > 0 &&
        opt.strike > 0
    ) {
        const solvedIv = solveIvBisection(
            opt.right === "C",
            standard.midUsd,
            standard.spot,
            opt.strike,
            standard.T
        );

        if (solvedIv != null) {
            standard.iv = solvedIv;
        } else {
            pushWarning(standard, "IV_UNAVAILABLE");
        }
    } else {
        pushWarning(standard, "IV_UNAVAILABLE");
    }

    const modelGreeks = standard.spot != null &&
        standard.T != null &&
        standard.T > 0 &&
        opt.strike > 0 &&
        standard.iv != null
        ? blackScholesGreeks(opt.right === "C", standard.spot, opt.strike, standard.T, standard.iv)
        : null;

    standard.delta = finiteOrNull(opt.delta) ?? modelGreeks?.delta ?? null;
    standard.gamma = finiteOrNull(opt.gamma) ?? modelGreeks?.gamma ?? null;
    standard.theta = finiteOrNull(opt.theta) ?? modelGreeks?.theta ?? null;
    standard.vega = finiteOrNull(opt.vega) ?? modelGreeks?.vega ?? null;
    standard.rho = finiteOrNull(opt.rho) ?? modelGreeks?.rho ?? null;

    if (
        standard.delta == null &&
        standard.gamma == null &&
        standard.theta == null &&
        standard.vega == null &&
        standard.rho == null
    ) {
        pushWarning(standard, "GREEKS_UNAVAILABLE");
    }

    if (opt.warnings?.length) {
        for (const warning of opt.warnings) {
            pushWarning(standard, warning);
        }
    }

    return {
        ...opt,
        standard,
    };
}

export interface IbitBtcEquivalent {
    midUsdPerUnderlyingBtcEq: number | null;
    strikeBtcEq: number | null;
    moneynessBtcEq: number | null;
    warnings: string[];
}

export function toIbitBtcEquivalent(
    opt: NormalizedOption,
    spotMap: Record<string, number | null>
): IbitBtcEquivalent {
    const warnings: string[] = [];
    const btcSpot = spotMap.BTC ?? null;
    const ibitSpot = spotMap.IBIT ?? null;
    const mid = opt.standard?.midUsd ?? null;

    if (opt.contractMultiplier === 100) {
        warnings.push("IBIT_MULTIPLIER_100");
    }

    if (!(btcSpot && btcSpot > 0 && ibitSpot && ibitSpot > 0)) {
        return {
            midUsdPerUnderlyingBtcEq: null,
            strikeBtcEq: null,
            moneynessBtcEq: null,
            warnings,
        };
    }

    const btcPerShare = ibitSpot / btcSpot;
    if (!(btcPerShare > 0)) {
        return {
            midUsdPerUnderlyingBtcEq: null,
            strikeBtcEq: null,
            moneynessBtcEq: null,
            warnings,
        };
    }

    const strikeBtcEq = opt.strike / btcPerShare;
    const moneynessBtcEq = strikeBtcEq / btcSpot;
    const midUsdPerUnderlyingBtcEq = mid != null ? mid / btcPerShare : null;

    warnings.push("IBIT_BTC_EQ_APPROX");

    return {
        midUsdPerUnderlyingBtcEq,
        strikeBtcEq,
        moneynessBtcEq,
        warnings,
    };
}

