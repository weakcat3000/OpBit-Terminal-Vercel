"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Venue, VENUE_LABELS } from "@/src/core/types/venues";
import { CompareRow } from "@/src/services/optionsService";

interface IVTermChartProps {
    underlying: string;
    venues: Venue[];
    active: boolean;
}

interface InstrumentsResponse {
    expiries?: string[];
}

interface CompareResponse {
    rows?: CompareRow[];
}

interface TermPoint {
    expiry: string;
    iv: number;
}

function normalizeIv(iv: number | null | undefined): number | null {
    if (iv == null || !Number.isFinite(iv)) return null;
    if (iv > 3) return iv / 100;
    if (iv < 0) return null;
    return iv;
}

function colorByVenue(venue: Venue): string {
    if (venue === "DERIBIT") return "#1f6dff";
    if (venue === "AEVO") return "#e8edf5";
    if (venue === "LYRA_V2") return "#34d4c2";
    if (venue === "IBIT") return "#f7a326";
    return "#9f7aea";
}

function parseUnderlyingFamily(underlying: string): "BTC" | "ETH" | "IBIT" {
    const u = underlying.toUpperCase();
    if (u.includes("ETH")) return "ETH";
    if (u.includes("IBIT")) return "IBIT";
    return "BTC";
}

function formatExpiryLabel(expiry: string): string {
    const [y, m, d] = expiry.split("-");
    if (!y || !m || !d) return expiry;
    return `${d}/${m}`;
}

export function IVTermChart({ underlying, venues, active }: IVTermChartProps) {
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [seriesByVenue, setSeriesByVenue] = useState<Partial<Record<Venue, TermPoint[]>>>({});
    const hasDataRef = useRef(false);
    const lastQueryKeyRef = useRef<string | null>(null);

    const venuesKey = useMemo(() => venues.join(","), [venues]);
    const activeVenues = useMemo(
        () => (venuesKey ? (venuesKey.split(",").filter(Boolean) as Venue[]) : []),
        [venuesKey]
    );

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
        setEnabled((prev) => {
            const next: Record<Venue, boolean> = {
                DERIBIT: false,
                AEVO: false,
                LYRA_V2: false,
                PANOPTIC: false,
                IBIT: false,
            };
            for (const venue of activeVenues) {
                next[venue] = prev[venue] ?? true;
            }
            return next;
        });
    }, [activeVenues]);

    useEffect(() => {
        hasDataRef.current = Object.values(seriesByVenue).some((points) => (points?.length ?? 0) > 0);
    }, [seriesByVenue]);

    useEffect(() => {
        if (!active) return;
        let cancelled = false;

        const load = async () => {
            const queryKey = `${underlying}|${venuesKey}`;
            const keyChanged = lastQueryKeyRef.current !== queryKey;
            lastQueryKeyRef.current = queryKey;

            const shouldBlock = keyChanged || !hasDataRef.current;
            if (shouldBlock) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }
            setError(null);

            try {
                const iRes = await fetch(`/api/options/instruments?underlying=${underlying}&venues=${venuesKey}`);
                if (!iRes.ok) {
                    throw new Error(`Instruments ${iRes.status}`);
                }
                const instruments = (await iRes.json()) as InstrumentsResponse;
                const expiries = (instruments.expiries ?? []).slice(0, 6);
                if (expiries.length === 0) {
                    if (!cancelled) setSeriesByVenue({});
                    return;
                }

                const family = parseUnderlyingFamily(underlying);
                const sRes = await fetch(`/api/market/spot?symbols=${family}`);
                if (!sRes.ok) {
                    throw new Error(`Spot ${sRes.status}`);
                }
                const spotJson = await sRes.json();
                const spot = spotJson?.spots?.[family] as number | null;
                if (!(spot != null && Number.isFinite(spot) && spot > 0)) {
                    throw new Error("Spot unavailable");
                }

                const results = await Promise.allSettled(
                    expiries.map(async (expiry) => {
                        const cRes = await fetch(
                            `/api/options/compare?underlying=${underlying}&expiry=${expiry}&venues=${venuesKey}&benchmark=DERIBIT`
                        );
                        if (!cRes.ok) {
                            throw new Error(`Compare ${expiry} ${cRes.status}`);
                        }
                        const compare = (await cRes.json()) as CompareResponse;
                        return { expiry, rows: compare.rows ?? [] };
                    })
                );

                const next: Partial<Record<Venue, TermPoint[]>> = {};
                for (const venue of activeVenues) {
                    next[venue] = [];
                }

                for (const result of results) {
                    if (result.status !== "fulfilled") continue;
                    const { expiry, rows } = result.value;

                    for (const venue of activeVenues) {
                        let bestIv: number | null = null;
                        let bestDist = Number.POSITIVE_INFINITY;

                        for (const row of rows) {
                            if (row.right !== "C") continue;
                            const leg = row.venues[venue];
                            if (!leg) continue;
                            const iv = normalizeIv(leg.markIv);
                            if (iv == null) continue;
                            const dist = Math.abs(row.strike - spot);
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestIv = iv;
                            }
                        }

                        if (bestIv != null) {
                            (next[venue] ??= []).push({ expiry, iv: bestIv });
                        }
                    }
                }

                for (const venue of activeVenues) {
                    next[venue] = (next[venue] ?? []).sort((a, b) => a.expiry.localeCompare(b.expiry));
                }

                if (!cancelled) {
                    setSeriesByVenue(next);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Term data unavailable");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        };

        load();
        const timer = setInterval(load, 30000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [active, underlying, venuesKey, activeVenues]);

    const visibleSeries = useMemo(
        () => activeVenues.filter((venue) => (enabled[venue] ?? true) && (seriesByVenue[venue]?.length ?? 0) > 0),
        [activeVenues, enabled, seriesByVenue]
    );

    const allPoints = useMemo(
        () => visibleSeries.flatMap((venue) => seriesByVenue[venue] ?? []),
        [visibleSeries, seriesByVenue]
    );

    if (loading) {
        return <div className="h-full flex items-center justify-center text-[10px] text-[#5a6a7a]">Loading term structure...</div>;
    }

    if (error) {
        return <div className="h-full flex items-center justify-center text-[10px] text-[#a07070]">{error}</div>;
    }

    if (allPoints.length === 0) {
        return <div className="h-full flex items-center justify-center text-[10px] text-[#5a6a7a]">No term structure data.</div>;
    }

    const expiries = Array.from(new Set(allPoints.map((p) => p.expiry))).sort();
    const minIv = Math.min(...allPoints.map((p) => p.iv));
    const maxIv = Math.max(...allPoints.map((p) => p.iv));

    const x = (expiry: string) => {
        const idx = expiries.indexOf(expiry);
        const r = Math.max(1, expiries.length - 1);
        return 12 + (idx / r) * 83;
    };
    const y = (iv: number) => {
        const r = maxIv - minIv || 1;
        return 90 - ((iv - minIv) / r) * 78;
    };

    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <div className="px-2 pt-0.5 pb-0 flex items-center gap-2 flex-wrap text-[8px] text-[#6f8092] shrink-0">
                {activeVenues.map((venue) => (
                    <label key={venue} className="inline-flex items-center gap-1 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={enabled[venue] ?? true}
                            onChange={() =>
                                setEnabled((prev) => {
                                    const was = prev[venue] ?? true;
                                    return { ...prev, [venue]: !was };
                                })
                            }
                            className="h-2 w-2 accent-[#4ea7ff]"
                        />
                        <span style={{ color: colorByVenue(venue) }}>{VENUE_LABELS[venue]}</span>
                    </label>
                ))}
                {refreshing && (
                    <span className="ml-auto text-[8px] text-[#6f8092]">Refreshing...</span>
                )}
            </div>

            <div className="relative flex-1 min-h-0 px-2 pb-1 overflow-hidden">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                    <rect x="0" y="0" width="100" height="100" fill="#0b111c" />
                    <line x1="12" y1="90" x2="95" y2="90" stroke="#2d425a" strokeWidth="0.7" />
                    <line x1="12" y1="12" x2="12" y2="90" stroke="#2d425a" strokeWidth="0.7" />
                    <line x1="12" y1="12" x2="95" y2="12" stroke="#203448" strokeWidth="0.35" strokeDasharray="1.2 1.4" />
                    <line x1="12" y1="51" x2="95" y2="51" stroke="#203448" strokeWidth="0.35" strokeDasharray="1.2 1.4" />
                    <line x1="12" y1="90" x2="95" y2="90" stroke="#203448" strokeWidth="0.35" strokeDasharray="1.2 1.4" />

                    {expiries.map((expiry) => (
                        <line
                            key={`x-grid-${expiry}`}
                            x1={x(expiry)}
                            y1="12"
                            x2={x(expiry)}
                            y2="90"
                            stroke="#1a2b3c"
                            strokeWidth="0.25"
                            strokeDasharray="0.7 1.6"
                        />
                    ))}

                    {visibleSeries.map((venue) => {
                        const points = seriesByVenue[venue] ?? [];
                        const polyline = points.map((p) => `${x(p.expiry)},${y(p.iv)}`).join(" ");
                        const color = colorByVenue(venue);
                        return (
                            <g key={venue}>
                                <polyline
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="0.9"
                                    points={polyline}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                                {points.map((p) => (
                                    <circle key={`${venue}-${p.expiry}`} cx={x(p.expiry)} cy={y(p.iv)} r="1.05" fill={color}>
                                        <title>{`${VENUE_LABELS[venue]} | ${p.expiry} | ATM IV ${(p.iv * 100).toFixed(1)}%`}</title>
                                    </circle>
                                ))}
                            </g>
                        );
                    })}
                </svg>

                <div className="absolute left-2 top-0 text-[9px] text-[#7f95ad]">ATM IV</div>
                <div className="absolute left-0 top-[10px] text-[8px] text-[#7f95ad]">{(maxIv * 100).toFixed(1)}%</div>
                <div className="absolute left-0 top-[49px] text-[8px] text-[#6f8092]">{(((maxIv + minIv) / 2) * 100).toFixed(1)}%</div>
                <div className="absolute left-0 bottom-[12px] text-[8px] text-[#7f95ad]">{(minIv * 100).toFixed(1)}%</div>

                <div className="absolute left-2 bottom-0 text-[9px] text-[#7f95ad]">{formatExpiryLabel(expiries[0])}</div>
                <div className="absolute right-2 bottom-0 text-[9px] text-[#7f95ad]">{formatExpiryLabel(expiries[expiries.length - 1])}</div>
                {expiries.length > 2 && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 text-[9px] text-[#7f95ad]">
                        {formatExpiryLabel(expiries[Math.floor(expiries.length / 2)])}
                    </div>
                )}

                <div className="absolute top-0 right-2 text-[9px] text-[#6f8092] text-right">
                    {visibleSeries.map((venue) => {
                        const points = seriesByVenue[venue] ?? [];
                        if (points.length < 2) return null;
                        const first = points[0].iv;
                        const last = points[points.length - 1].iv;
                        const slope = last - first;
                        const label = slope > 0.001 ? "UP" : slope < -0.001 ? "DOWN" : "FLAT";
                        return (
                            <div key={`slope-${venue}`} style={{ color: colorByVenue(venue) }}>
                                {VENUE_LABELS[venue]} {label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
