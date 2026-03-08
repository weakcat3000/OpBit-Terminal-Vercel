"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CompareRow } from "@/src/services/optionsService";
import { Venue, VENUE_LABELS } from "@/src/core/types/venues";

interface SmilePoint {
    strike: number;
    iv: number;
    mid: number | null;
}

interface IVSmileChartProps {
    rows: CompareRow[];
    venues: Venue[];
    underlying: string;
    themeMode: "dark" | "light";
}

function venueColor(venue: Venue, themeMode: "dark" | "light"): string {
    if (venue === "DERIBIT") return "#00a3ff";
    if (venue === "AEVO") return themeMode === "light" ? "#000000" : "#ffffff";
    if (venue === "LYRA_V2") return "#00fff0";
    if (venue === "PANOPTIC") return "#a78bfa";
    if (venue === "IBIT") return "#f7a326";
    return "#ffffff";
}

function normalizeIv(iv: number | null | undefined): number | null {
    if (iv == null || !Number.isFinite(iv)) return null;
    if (iv > 3) return iv / 100;
    if (iv < 0) return null;
    return iv;
}

function toSmoothPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
}

function toAreaPath(points: Array<{ x: number; y: number }>, baseline: number): string {
    if (points.length === 0) return "";
    const line = toSmoothPath(points);
    const last = points[points.length - 1];
    const first = points[0];
    return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function IVSmileChart({ rows, venues, underlying, themeMode }: IVSmileChartProps) {
    const [spot, setSpot] = useState<number | null>(null);
    const [enabled, setEnabled] = useState<Record<Venue, boolean>>(() => {
        const base: Record<Venue, boolean> = {
            DERIBIT: false,
            AEVO: false,
            LYRA_V2: false,
            PANOPTIC: false,
            IBIT: false,
        };
        for (const venue of venues) base[venue] = true;
        return base;
    });

    useEffect(() => {
        let cancelled = false;
        const symbol = underlying.includes("ETH") ? "ETH" : underlying.includes("IBIT") ? "IBIT" : "BTC";

        const loadSpot = async () => {
            try {
                const res = await fetch(`/api/market/spot?symbols=${symbol}`);
                if (!res.ok) return;
                const json = await res.json();
                if (!cancelled) setSpot(json?.spots?.[symbol] ?? null);
            } catch {
                if (!cancelled) setSpot(null);
            }
        };

        loadSpot();
        const timer = setInterval(loadSpot, 5000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [underlying]);

    const seriesByVenue = useMemo(() => {
        const out: Partial<Record<Venue, SmilePoint[]>> = {};

        for (const venue of venues) {
            const byStrike = new Map<number, { ivs: number[]; mids: number[] }>();
            for (const row of rows) {
                const leg = row.venues[venue];
                if (!leg) continue;
                const iv = normalizeIv(leg.markIv);
                if (iv == null) continue;

                const slot = byStrike.get(row.strike) ?? { ivs: [], mids: [] };
                slot.ivs.push(iv);
                if (leg.mid != null && Number.isFinite(leg.mid)) slot.mids.push(leg.mid);
                byStrike.set(row.strike, slot);
            }

            out[venue] = Array.from(byStrike.entries())
                .map(([strike, value]) => ({
                    strike,
                    iv: value.ivs.reduce((a, b) => a + b, 0) / value.ivs.length,
                    mid: value.mids.length > 0 ? value.mids.reduce((a, b) => a + b, 0) / value.mids.length : null,
                }))
                .sort((a, b) => a.strike - b.strike);
        }

        return out;
    }, [rows, venues]);

    const visibleVenues = useMemo(
        () => venues.filter((venue) => (enabled[venue] ?? true) && (seriesByVenue[venue]?.length ?? 0) > 0),
        [venues, enabled, seriesByVenue]
    );

    const allPoints = useMemo(
        () => visibleVenues.flatMap((venue) => seriesByVenue[venue] ?? []),
        [visibleVenues, seriesByVenue]
    );

    if (allPoints.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-[10px] text-[#5a6a7a]">
                No smile IV data for selected venues.
            </div>
        );
    }

    const rawMinStrike = Math.min(...allPoints.map((p) => p.strike));
    const rawMaxStrike = Math.max(...allPoints.map((p) => p.strike));
    const rawMinIv = Math.min(...allPoints.map((p) => p.iv));
    const rawMaxIv = Math.max(...allPoints.map((p) => p.iv));

    const strikePadding = (rawMaxStrike - rawMinStrike) * 0.10 || (spot ? spot * 0.10 : 1000);
    const minStrike = Math.max(0, rawMinStrike - strikePadding);
    const maxStrike = rawMaxStrike + strikePadding;

    const ivPadding = (rawMaxIv - rawMinIv) * 0.15 || 0.15;
    // Always show at least 0 (0%) bottom scale
    const minIv = 0;
    // Always show at least 1.5 (150%) top scale, or actual + padding
    const maxIv = Math.max(1.5, rawMaxIv + ivPadding);

    // Expand the internal SVG resolution so circles don't stretch as aggressively
    const chartLeft = 20;
    const chartRight = 780;
    const chartTop = 30;
    const chartBottom = 270;

    const x = (strike: number) => {
        const range = maxStrike - minStrike || 1;
        return chartLeft + ((strike - minStrike) / range) * (chartRight - chartLeft);
    };

    const y = (iv: number) => {
        const range = maxIv - minIv || 1;
        return chartBottom - ((iv - minIv) / range) * (chartBottom - chartTop);
    };

    const atmStrike =
        spot == null
            ? null
            : allPoints.reduce((best, point) => {
                if (best == null) return point.strike;
                return Math.abs(point.strike - spot) < Math.abs(best - spot) ? point.strike : best;
            }, null as number | null);

    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[#050a15] font-sans">
            <div className="px-4 py-2.5 flex items-center justify-between shrink-0 border-b border-[#1e2532]">
                <div className="flex gap-2 items-center flex-wrap">
                    {venues.map((venue) => {
                        const color = venueColor(venue, themeMode);
                        const on = enabled[venue] ?? true;
                        return (
                            <button
                                key={venue}
                                type="button"
                                onClick={() =>
                                    setEnabled((prev) => {
                                        const was = prev[venue] ?? true;
                                        return { ...prev, [venue]: !was };
                                    })
                                }
                                className={`flex items-center gap-2 rounded-full px-3 py-1 transition-colors border ${on
                                    ? themeMode === "light"
                                        ? "bg-[#eef6ff] border-[#8db0d2]"
                                        : "bg-[#1e2532] border-[#2a3441]"
                                    : themeMode === "light"
                                        ? "bg-transparent border-[#aac3db] opacity-80"
                                        : "bg-transparent border-[#1e2532] opacity-50"
                                    }`}
                                title={`Toggle ${VENUE_LABELS[venue]}`}
                            >
                                <div
                                    className={`w-2 h-2 rounded-full bg-[var(--bg-color)] ${on ? `shadow-[0_0_8px_var(--bg-color)]` : ""}`}
                                    style={{ '--bg-color': color } as React.CSSProperties}
                                />
                                <span className={`text-xs font-semibold ${on
                                    ? themeMode === "light" ? "text-[#111827]" : "text-slate-200"
                                    : themeMode === "light" ? "text-[#3f5874]" : "text-slate-500"
                                    }`}>
                                    {VENUE_LABELS[venue]}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div
                className="relative flex-1 min-h-0 overflow-hidden px-2 pb-2 pt-2 bg-[linear-gradient(to_right,#1e2532_1px,transparent_1px),linear-gradient(to_bottom,#1e2532_1px,transparent_1px)] bg-[size:40px_40px]"
            >
                <div className="absolute left-2 top-4 bottom-10 flex flex-col justify-between text-[10px] text-slate-500 pointer-events-none z-10">
                    <span>{(maxIv * 100).toFixed(0)}%</span>
                    <span>{(((maxIv + minIv) / 2) * 100).toFixed(0)}%</span>
                    <span>{(minIv * 100).toFixed(0)}%</span>
                </div>

                {/* Higher resolution viewBox (800x300 instead of 100x100) */}
                <svg viewBox="0 0 800 300" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                        <filter id="glow-line" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        {visibleVenues.map((venue) => (
                            <linearGradient key={`grad-${venue}`} id={`areaGrad-${venue}`} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={venueColor(venue, themeMode)} stopOpacity="0.15" />
                                <stop offset="100%" stopColor={venueColor(venue, themeMode)} stopOpacity="0" />
                            </linearGradient>
                        ))}
                    </defs>

                    <line x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} stroke="#2a3f5e" strokeWidth="1" />

                    {atmStrike != null && (
                        <line
                            x1={x(atmStrike)}
                            y1={chartTop}
                            x2={x(atmStrike)}
                            y2={chartBottom}
                            stroke="#39d5ff"
                            strokeDasharray="4 4"
                            strokeWidth="1.5"
                            opacity="0.9"
                        />
                    )}

                    {visibleVenues.map((venue) => {
                        const points = (seriesByVenue[venue] ?? []).map((point) => ({
                            x: x(point.strike),
                            y: y(point.iv),
                            strike: point.strike,
                            iv: point.iv,
                            mid: point.mid,
                        }));
                        if (points.length === 0) return null;

                        const color = venueColor(venue, themeMode);
                        const linePath = toSmoothPath(points);
                        const areaPath = toAreaPath(points, chartBottom);

                        return (
                            <g key={venue}>
                                <path d={areaPath} fill={`url(#areaGrad-${venue})`} />
                                <path
                                    d={linePath}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="1"
                                    opacity="0.3"
                                    filter="url(#glow-line)"
                                    vectorEffect="non-scaling-stroke"
                                />
                                <path
                                    d={linePath}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                                {points.map((p) => (
                                    <circle
                                        key={`${venue}-${p.strike}`}
                                        cx={p.x}
                                        cy={p.y}
                                        r="3"
                                        fill={color}
                                        stroke="#ffffff"
                                        strokeWidth="1"
                                        filter={`drop-shadow(0 0 6px ${color})`}
                                        vectorEffect="non-scaling-stroke"
                                    >
                                        <title>{`${VENUE_LABELS[venue]} | K ${p.strike.toLocaleString()} | IV ${(p.iv * 100).toFixed(2)}% | Mid ${p.mid != null ? p.mid.toFixed(2) : "-"}`}</title>
                                    </circle>
                                ))}
                            </g>
                        );
                    })}
                </svg>

                <div className="absolute left-2 top-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">IV</div>
                <div className="absolute left-8 bottom-1 text-[10px] font-mono text-slate-500">{minStrike.toLocaleString()}</div>
                <div className="absolute right-2 bottom-1 text-[10px] font-mono text-slate-500">{maxStrike.toLocaleString()}</div>
                {atmStrike != null && (
                    <div className="absolute top-0 right-2 text-[10px] uppercase tracking-wider text-[#39d5ff]">
                        ATM {atmStrike.toLocaleString()}
                    </div>
                )}
            </div>
        </div>
    );
}
