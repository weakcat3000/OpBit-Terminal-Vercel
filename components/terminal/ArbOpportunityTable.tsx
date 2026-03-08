"use client";

import React from "react";
import { ArbOpportunity } from "@/src/services/arbitrage/arbTypes";
import { VENUE_LABELS } from "@/src/core/types/venues";

interface ArbOpportunityTableProps {
    opportunities: ArbOpportunity[];
    selectedId: string | null;
    onSelect: (opp: ArbOpportunity) => void;
    themeMode: "dark" | "light";
    emptyLabel?: string;
    loading?: boolean;
    scannedContracts?: number;
}

function typeLabel(kind: ArbOpportunity["kind"]): string {
    switch (kind) {
        case "CROSS_VENUE_SAME_CONTRACT":
            return "CROSS-VENUE";
        case "INTRA_VENUE_BOX":
            return "BOX SPREAD";
        case "INTRA_VENUE_PUT_CALL_PARITY":
            return "PUT-CALL PARITY";
        default:
            return "UNKNOWN";
    }
}

function formatUSD(value: number): string {
    if (!Number.isFinite(value) || value === 0) return "-";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

function formatPct(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
}

function formatAge(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "-";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export function ArbOpportunityTable({
    opportunities,
    selectedId,
    onSelect,
    themeMode,
    emptyLabel,
    loading = false,
    scannedContracts = 0,
}: ArbOpportunityTableProps) {
    const isDark = themeMode === "dark";
    const borderColor = isDark ? "border-[#2a3547]" : "border-[#bfd0e2]";
    const headerBg = isDark ? "bg-[#111622]" : "bg-[#f2f7fc]";
    const headerText = isDark ? "text-[#64748b]" : "text-[#5b6f86]";
    const bodyBg = isDark ? "bg-[#080c14]" : "bg-[#f8fbff]";

    if (opportunities.length === 0) {
        return (
            <div
                className={`flex-1 flex items-center justify-center text-[10px] px-3 text-center ${isDark ? "text-[#64748b]" : "text-[#64748b]"
                    }`}
            >
                {loading ? (
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 text-[#8da7c3]">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#0ce4ae] animate-pulse" />
                            <span className="font-mono uppercase tracking-[0.08em] animate-pulse">Scanning contracts...</span>
                        </div>
                        <div className="font-mono text-[#7f93a8]">
                            {scannedContracts.toLocaleString()} contracts scanned
                        </div>
                        {scannedContracts === 0 && (
                            <div className="max-w-[320px] text-[10px] leading-relaxed text-[#6f86a1]">
                                This may take awhile depending on network traffic and venue response times.
                            </div>
                        )}
                    </div>
                ) : (
                    emptyLabel ?? "No riskless opportunities detected for this scan."
                )}
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-auto">
            <table className={`min-w-full table-fixed divide-y text-[10px] border-collapse font-mono ${isDark ? "divide-[#2a3547]" : "divide-[#bfd0e2]"}`}>
                <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[10%]" />
                    <col className="w-[11%]" />
                    <col className="w-[19%]" />
                    <col className="w-[10%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[10%]" />
                </colgroup>
                <thead className={`sticky top-0 z-10 ${headerBg}`}>
                    <tr
                        className={`text-left text-[10px] uppercase tracking-tighter ${headerText}`}
                    >
                        <th className={`px-3 py-2 font-medium border-b border-r ${borderColor}`}>TYPE</th>
                        <th className={`px-3 py-2 font-medium border-b border-r ${borderColor}`}>EXPIRY</th>
                        <th className={`text-right px-3 py-2 font-medium border-b border-r ${borderColor}`}>STRIKE</th>
                        <th className={`px-3 py-2 font-medium border-b border-r ${borderColor}`}>VENUES</th>
                        <th className={`text-right px-3 py-2 font-medium border-b border-r ${borderColor}`}>PROFIT%</th>
                        <th className={`text-right px-3 py-2 font-medium border-b border-r ${borderColor}`}>MAXSIZE</th>
                        <th className={`text-right px-3 py-2 font-medium border-b border-r ${borderColor}`}>MAXPRF</th>
                        <th className={`text-right px-3 py-2 font-medium border-b ${borderColor}`}>AGE</th>
                    </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-[#2a3547]" : "divide-[#bfd0e2]"} ${bodyBg}`}>
                    {opportunities.map((opp) => {
                        const isSelected = opp.id === selectedId;
                        const strikeLabel = opp.strikes
                            ? `${opp.strikes[0].toLocaleString()}/${opp.strikes[1].toLocaleString()}`
                            : opp.strike != null
                                ? `${opp.strike.toLocaleString()} ${opp.optionType === "CALL" ? "C" : "P"}`
                                : "-";

                        const venueLabel =
                            opp.kind === "CROSS_VENUE_SAME_CONTRACT"
                                ? `${VENUE_LABELS[opp.buyVenue!] ?? opp.buyVenue}->${VENUE_LABELS[opp.sellVenue!] ?? opp.sellVenue}`
                                : VENUE_LABELS[opp.venue!] ?? opp.venue ?? "-";

                        const profitPositive = opp.profitPct >= 0;
                        const maxProfitPositive = opp.profitUSD_max >= 0;

                        return (
                            <tr
                                key={opp.id}
                                onClick={() => onSelect(opp)}
                                className={`cursor-pointer transition-colors ${isSelected
                                        ? (isDark ? "bg-[#1e2532]" : "bg-[#e7f1fb]")
                                        : (isDark ? "hover:bg-[#111622]" : "hover:bg-[#f1f6fc]")
                                    }`}
                            >
                                <td className={`px-3 py-3 border-r ${borderColor}`}>
                                    <span
                                        className={`inline-block px-1.5 py-0.5 rounded-none text-[9px] font-mono border whitespace-nowrap ${opp.kind === "CROSS_VENUE_SAME_CONTRACT"
                                                ? "bg-[#0ce4ae]/10 text-[#0cae8c] border-[#0cae8c]/30"
                                                : isDark
                                                    ? "bg-slate-500/10 text-slate-300 border-slate-500/20"
                                                    : "bg-[#dbe7f5] text-[#3f5974] border-[#b8cade]"
                                            }`}
                                    >
                                        {typeLabel(opp.kind)}
                                    </span>
                                </td>
                                <td className={`px-3 py-3 border-r ${borderColor} ${isDark ? "text-[#64748b]" : "text-[#5f748b]"}`}>
                                    {opp.expiry.replace(/^\d{4}-/, "")}
                                </td>
                                <td className={`px-3 py-3 border-r ${borderColor} text-right font-mono ${isDark ? "text-[#e2e8f0]" : "text-[#1e3a56]"}`}>
                                    {strikeLabel}
                                </td>
                                <td className={`px-3 py-3 border-r ${borderColor} text-[10px] break-words ${isDark ? "text-[#e2e8f0]" : "text-[#2b4867]"}`}>
                                    {venueLabel}
                                </td>
                                <td className={`px-3 py-3 border-r ${borderColor} text-right font-mono font-bold ${profitPositive ? (isDark ? "text-[#0ce4ae]" : "text-[#0cae8c]") : (isDark ? "text-[#ff3b3b]" : "text-[#d14343]")}`}>
                                    {profitPositive ? `+${formatPct(opp.profitPct)}` : formatPct(opp.profitPct)}
                                </td>
                                <td className={`px-3 py-3 border-r ${borderColor} text-right font-mono ${isDark ? "text-[#e2e8f0]" : "text-[#1e3a56]"}`}>
                                    {formatUSD(opp.maxSizeUSD)}
                                </td>
                                <td className={`px-3 py-3 border-r ${borderColor} text-right font-mono ${maxProfitPositive ? (isDark ? "text-[#0ce4ae]" : "text-[#0cae8c]") : (isDark ? "text-[#ff3b3b]" : "text-[#d14343]")}`}>
                                    {formatUSD(opp.profitUSD_max)}
                                </td>
                                <td className="px-2 py-3 text-right">
                                    <span className={`font-mono text-[9px] uppercase ${isDark ? "text-[#64748b]" : "text-[#5f748b]"}`}>
                                        {formatAge(opp.quoteAgeMsMax)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
