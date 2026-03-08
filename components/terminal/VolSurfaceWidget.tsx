"use client";

import React, { useMemo, useState } from "react";
import { formatIv } from "@/src/core/utils/numbers";
import { CompareRow } from "@/src/services/optionsService";
import { Venue } from "@/src/core/types/venues";
import { IVSmileChart } from "./IVSmileChart";
import { IVTermChart } from "./IVTermChart";

interface FairRow {
    market: string;
    iv: number | null;
    m: number | null;
    expiry: string;
    warnings?: string[];
}

interface FairPanelData {
    rows: FairRow[];
    winner: string | null;
    explain: string;
}

interface PanopticRow {
    rawId?: string;
    strike: number;
    right: "C" | "P";
    warnings?: string[];
}

interface VolSurfaceWidgetProps {
    fairData: FairPanelData | null;
    fairLoading: boolean;
    panopticRows: PanopticRow[];
    panopticLoading: boolean;
    rows: CompareRow[];
    venues: Venue[];
    underlying: string;
    viewMode: "COMPARE" | "BEST";
    selectedRow: CompareRow | null;
    themeMode: "dark" | "light";
    activeTab?: TabKey;
    onActiveTabChange?: (tab: TabKey) => void;
}

type TabKey = "VOL" | "SMILE" | "TERM" | "FAIR" | "PANOPTIC";
const TABS: TabKey[] = ["VOL", "SMILE", "TERM", "FAIR", "PANOPTIC"];
export type { TabKey };

export function VolSurfaceWidget({
    fairData,
    fairLoading,
    panopticRows,
    panopticLoading,
    rows,
    venues,
    underlying,
    viewMode,
    selectedRow,
    themeMode,
    activeTab,
    onActiveTabChange,
}: VolSurfaceWidgetProps) {
    const [internalTab, setInternalTab] = useState<TabKey>("VOL");
    const tab = activeTab ?? internalTab;
    const setTab = onActiveTabChange ?? setInternalTab;
    const panelHeightClass = tab === "SMILE" || tab === "TERM" ? "h-[230px]" : "h-[240px]";

    const chartVenues = useMemo(
        () => venues.filter((venue) => venue !== "PANOPTIC"),
        [venues]
    );

    const panopticPreview = useMemo(() => panopticRows.slice(0, 12), [panopticRows]);

    const volBars = useMemo(() => {
        const byStrike = new Map<number, number[]>();
        const primaryVenue = venues[0] ?? "DERIBIT";

        for (const row of rows) {
            const venueKey = viewMode === "BEST" && row.bestVenue ? row.bestVenue : primaryVenue;
            const iv = row.venues[venueKey]?.markIv;
            if (iv == null || !Number.isFinite(iv)) continue;

            const normalizedIv = iv > 3 ? iv / 100 : iv;
            const existing = byStrike.get(row.strike) ?? [];
            existing.push(normalizedIv);
            byStrike.set(row.strike, existing);
        }

        const aggregated = Array.from(byStrike.entries())
            .map(([strike, values]) => ({
                strike,
                iv: values.reduce((sum, v) => sum + v, 0) / values.length,
            }))
            .sort((a, b) => a.strike - b.strike);

        if (aggregated.length === 0) return [];

        const sampled = aggregated.length > 12
            ? aggregated.filter((_, idx) => idx % Math.ceil(aggregated.length / 12) === 0).slice(0, 12)
            : aggregated;

        const minIv = Math.min(...sampled.map((x) => x.iv));
        const maxIv = Math.max(...sampled.map((x) => x.iv));
        const range = Math.max(1e-9, maxIv - minIv);

        return sampled.map((item) => ({
            ...item,
            heightPct: maxIv === minIv ? 55 : 20 + ((item.iv - minIv) / range) * 65,
        }));
    }, [rows, venues, viewMode]);

    return (
        <div className={`${panelHeightClass} bg-[#0d1117] border border-[#1e2a3a] flex flex-col font-sans shrink-0 overflow-hidden`}>
            <header className="px-3 py-2 border-b border-[#1e2a3a] shrink-0">
                <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto">
                    {TABS.map((key) => {
                        const active = tab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={`analysis-tab-btn px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded-sm transition-colors ${active
                                    ? themeMode === "light"
                                        ? "analysis-tab-active text-[#173f67] border-[#78a6cf] bg-[#d8e9fb]"
                                        : "analysis-tab-active text-[#e2e8f0] border-[#3a4f67] bg-[#1a2332]"
                                    : themeMode === "light"
                                        ? "analysis-tab-inactive text-[#38648d] border-[#b8cee4] bg-[#f7fbff] hover:text-[#215684] hover:bg-[#edf4ff] hover:border-[#90b4d8]"
                                        : "analysis-tab-inactive text-[#5a6a7a] border-[#1e2a3a] hover:text-[#8b9bab]"
                                    }`}
                            >
                                {key}
                            </button>
                        );
                    })}
                </div>
            </header>

            {tab === "VOL" && (
                <div className="vol-surface-panel flex-1 p-3 flex items-end justify-between gap-[2px] relative overflow-hidden">
                    <div className="vol-surface-axis absolute top-2 left-3 text-[#5a6a7a] text-[9px] font-mono">IV%</div>

                    {volBars.length === 0 ? (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a7a]">
                            No live IV data
                        </div>
                    ) : (
                        <>
                            {volBars.map((bar) => (
                                <div
                                    key={bar.strike}
                                    className="vol-surface-bar w-full bg-[#00e676]/10 border-t border-[#00e676]/40 hover:bg-[#00e676]/20 transition-colors"
                                    style={{ height: `${bar.heightPct}%` }}
                                    title={`${bar.strike.toLocaleString()} | ${formatIv(bar.iv)}`}
                                />
                            ))}
                            <div className="vol-surface-axis absolute bottom-0.5 w-full flex justify-between px-1.5 text-[8px] text-[#5a6a7a] font-mono">
                                <span>{volBars[0]?.strike?.toLocaleString() ?? "-"}</span>
                                <span>ATM-ish</span>
                                <span>{volBars[volBars.length - 1]?.strike?.toLocaleString() ?? "-"}</span>
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "SMILE" && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <IVSmileChart rows={rows} venues={chartVenues} underlying={underlying} themeMode={themeMode} />
                </div>
            )}

            {tab === "TERM" && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <IVTermChart underlying={underlying} venues={chartVenues} active={tab === "TERM"} />
                </div>
            )}

            {tab === "FAIR" && (
                <div className="flex-1 overflow-auto p-2 text-[10px]">
                    <div className="mb-2 text-[9px] text-[#6f8092]">
                        Selected: {selectedRow ? `${selectedRow.underlying} ${selectedRow.strike.toLocaleString()} ${selectedRow.right} ${selectedRow.expiry}` : "-"}
                    </div>
                    {fairLoading ? (
                        <div className="h-full flex items-center justify-center text-[#5a6a7a]">Loading FAIR...</div>
                    ) : !fairData || fairData.rows.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[#5a6a7a]">No FAIR rows available</div>
                    ) : (
                        <div className="space-y-2">
                            <table className="w-full text-[10px] border-collapse">
                                <thead>
                                    <tr className="text-[#7a8a9a] uppercase tracking-wider">
                                        <th className="text-left pb-1">Market</th>
                                        <th className="text-right pb-1">IV</th>
                                        <th className="text-right pb-1">M</th>
                                        <th className="text-right pb-1">Expiry</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fairData.rows.map((row) => (
                                        <tr key={`${row.market}-${row.expiry}`} className="border-t border-[#1e2a3a]">
                                            <td className="py-1 text-[#c0ccd8]">{row.market}</td>
                                            <td className="py-1 text-right font-mono text-[#e2e8f0]">{formatIv(row.iv)}</td>
                                            <td className="py-1 text-right font-mono text-[#c0ccd8]">
                                                {row.m != null ? row.m.toFixed(3) : "-"}
                                            </td>
                                            <td className="py-1 text-right font-mono text-[#8b9bab]">{row.expiry}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="text-[10px] text-[#8b9bab]">
                                Winner: <span className="text-[#00e676] font-bold">{fairData.winner ?? "-"}</span>
                            </div>
                            <div className="text-[9px] text-[#5a6a7a]">{fairData.explain}</div>
                            <div className="flex flex-wrap gap-1">
                                {Array.from(new Set(fairData.rows.flatMap((r) => r.warnings ?? []))).map((warning) => (
                                    <span
                                        key={warning}
                                        className="px-1.5 py-0.5 text-[9px] border border-[#2a3a4a] text-[#88aacc] bg-[#111a27] rounded-sm"
                                    >
                                        {warning}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === "PANOPTIC" && (
                <div className="flex-1 overflow-auto p-2 text-[10px]">
                    {panopticLoading ? (
                        <div className="h-full flex items-center justify-center text-[#5a6a7a]">Loading Panoptic...</div>
                    ) : panopticPreview.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[#5a6a7a]">
                            {underlying.toUpperCase().includes("ETH")
                                ? "No Panoptic liquidity rows available"
                                : "Panoptic liquidity is currently available for BTC and ETH only"}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="text-[9px] text-[#7f8c9b]">PANOPTIC_LIQUIDITY_ONLY_NO_QUOTES</div>
                            <table className="w-full text-[10px] border-collapse">
                                <thead>
                                    <tr className="text-[#7a8a9a] uppercase tracking-wider">
                                        <th className="text-left pb-1">ID</th>
                                        <th className="text-right pb-1">Strike</th>
                                        <th className="text-right pb-1">Side</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {panopticPreview.map((row) => (
                                        <tr key={String(row.rawId ?? `${row.strike}-${row.right}`)} className="border-t border-[#1e2a3a]">
                                            <td className="py-1 text-[#c0ccd8] truncate max-w-[140px]">{String(row.rawId ?? "-")}</td>
                                            <td className="py-1 text-right font-mono text-[#e2e8f0]">
                                                {Number.isFinite(row.strike) ? row.strike.toFixed(2) : "-"}
                                            </td>
                                            <td className="py-1 text-right font-mono text-[#8b9bab]">{row.right}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
