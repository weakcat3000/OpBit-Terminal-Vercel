import React from "react";
import Link from "next/link";

export default function MethodologyPage() {
    return (
        <div className="min-h-screen bg-[#060a10] text-[#c0ccd8]">
            <div className="max-w-3xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/terminal"
                        className="text-[#4a90d9] text-sm hover:underline mb-4 inline-block"
                    >
                        â† Back to Terminal
                    </Link>
                    <h1 className="text-2xl font-bold text-white mb-2">Methodology</h1>
                    <p className="text-[#7a8a9a] text-sm">
                        How the DeFi Options Terminal normalizes, matches, and compares
                        options across venues.
                    </p>
                </div>

                {/* Contract Key */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold text-white mb-3 border-b border-[#1e2a3a] pb-2">
                        Contract Key Formation
                    </h2>
                    <p className="text-sm mb-3">
                        Every option is identified by a canonical <code className="text-[#4a90d9] bg-[#111a27] px-1 py-0.5 rounded text-xs">contractKey</code> constructed as:
                    </p>
                    <div className="bg-[#0a0e17] border border-[#1e2a3a] rounded p-4 font-mono text-sm text-[#88ccff] mb-3">
                        {`\${UNDERLYING}|\${EXPIRY}|\${STRIKE}|\${RIGHT}`}
                    </div>
                    <p className="text-sm mb-2">Example:</p>
                    <div className="bg-[#0a0e17] border border-[#1e2a3a] rounded p-4 font-mono text-sm text-emerald-400">
                        ETH|2026-03-29|3500|P
                    </div>
                    <ul className="text-sm text-[#8899aa] mt-3 space-y-1 list-disc list-inside">
                        <li><strong>UNDERLYING</strong> â€” Asset symbol (ETH, BTC, IBIT)</li>
                        <li><strong>EXPIRY</strong> â€” UTC date in YYYY-MM-DD format</li>
                        <li><strong>STRIKE</strong> â€” Strike price as a number</li>
                        <li><strong>RIGHT</strong> â€” C (Call) or P (Put)</li>
                    </ul>
                </section>

                {/* Matching */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold text-white mb-3 border-b border-[#1e2a3a] pb-2">
                        Cross-Venue Matching
                    </h2>
                    <p className="text-sm mb-3">
                        Matching is done in two phases:
                    </p>
                    <ol className="text-sm text-[#8899aa] space-y-2 list-decimal list-inside">
                        <li>
                            <strong>Exact Match:</strong> Contracts with identical <code className="text-[#4a90d9] bg-[#111a27] px-1 py-0.5 rounded text-xs">contractKey</code> across venues are matched directly.
                        </li>
                        <li>
                            <strong>Fuzzy Expiry Match:</strong> If no exact match exists, contracts with the <em>same underlying, strike, and right</em> but expiries within Â±1 calendar day are matched and flagged with <code className="text-amber-400 bg-[#111a27] px-1 py-0.5 rounded text-xs">approxExpiryMatch</code>.
                        </li>
                    </ol>
                    <p className="text-sm text-[#8899aa] mt-3">
                        Contracts with different strikes are <strong>never</strong> matched.
                    </p>
                </section>

                {/* Metrics */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold text-white mb-3 border-b border-[#1e2a3a] pb-2">
                        Comparison Metrics
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-sm font-bold text-[#4a90d9] mb-1">Spread</h3>
                            <div className="bg-[#0a0e17] border border-[#1e2a3a] rounded p-3 font-mono text-xs text-[#88ccff]">
                                spreadAbs = ask âˆ’ bid<br />
                                spreadPct = spreadAbs / mid
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[#4a90d9] mb-1">vs Benchmark</h3>
                            <div className="bg-[#0a0e17] border border-[#1e2a3a] rounded p-3 font-mono text-xs text-[#88ccff]">
                                vsBenchmarkAbs = venue_mid âˆ’ benchmark_mid<br />
                                vsBenchmarkPct = vsBenchmarkAbs / benchmark_mid
                            </div>
                            <p className="text-sm text-[#8899aa] mt-2">
                                Default benchmark is <strong>Deribit</strong>. If Deribit is not available for a contract,
                                the venue with the smallest spreadPct is used as benchmark, and a warning is emitted.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[#4a90d9] mb-1">IV Gap</h3>
                            <div className="bg-[#0a0e17] border border-[#1e2a3a] rounded p-3 font-mono text-xs text-[#88ccff]">
                                ivGap = venue_markIv âˆ’ benchmark_markIv
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[#4a90d9] mb-1">Best Venue</h3>
                            <p className="text-sm text-[#8899aa]">
                                The venue with the lowest mid price for the contract. This is a simple heuristic â€”
                                for a more complete analysis, consider spread and liquidity.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Limitations */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold text-white mb-3 border-b border-[#1e2a3a] pb-2">
                        Limitations
                    </h2>
                    <ul className="text-sm text-[#8899aa] space-y-2 list-disc list-inside">
                        <li>
                            <strong>Venue Availability:</strong> Deribit is the only fully-wired venue.
                            Aevo runs in mock mode. Lyra v2, Panoptic, and IBIT are scaffolded but not connected.
                        </li>
                        <li>
                            <strong>IV Comparability:</strong> Mark IV methodologies differ across venues.
                            Direct IV comparisons should be interpreted with caution.
                        </li>
                        <li>
                            <strong>Quote Staleness:</strong> Quotes are cached for 2 seconds.
                            In fast markets, displayed prices may lag.
                        </li>
                        <li>
                            <strong>Price Units:</strong> Deribit quotes are converted from underlying units (BTC/ETH)
                            to USD using the current underlying price. This introduces a small conversion approximation.
                        </li>
                        <li>
                            <strong>Matching Precision:</strong> The Â±1 day fuzzy expiry match is approximate.
                            Different venues may have subtly different settlement times.
                        </li>
                    </ul>
                </section>

                {/* Footer */}
                <div className="text-center text-[10px] text-[#3a4a5a] border-t border-[#1e2a3a] pt-4">
                    DeFi Options Terminal v1.0 â€” For informational purposes only.
                </div>
            </div>
        </div>
    );
}

