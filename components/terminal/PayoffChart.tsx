"use client";

import React, { useMemo, useState } from "react";
import { StrategyLeg, StrategyScenario } from "@/src/strategy/StrategyTypes";
import { computePayoffCurve } from "@/src/strategy/PayoffEngine";

interface PayoffChartProps {
    legs: StrategyLeg[];
    spot: number;
    scenario: StrategyScenario;
    themeMode: "dark" | "light";
    chartMode?: "profit" | "payoff";
}

interface HoverState {
    x: number;
    y: number;
    point: { spot: number; pnl: number };
}

export function PayoffChart({ legs, spot, scenario, themeMode, chartMode = "payoff" }: PayoffChartProps) {
    const result = useMemo(
        () => computePayoffCurve(legs, spot, scenario, chartMode),
        [legs, spot, scenario, chartMode]
    );
    const [hover, setHover] = useState<HoverState | null>(null);
    const extremaZones = useMemo(() => {
        if (result.points.length === 0) {
            return { maxGainZone: null, maxLossZone: null } satisfies ExtremaZones;
        }
        const domainMaxSpot = result.points[result.points.length - 1].spot;
        return computeExtremaZonesFromLegs(legs, chartMode, domainMaxSpot);
    }, [legs, chartMode, result.points]);

    if (result.points.length === 0) {
        return (
            <div className="h-[140px] flex items-center justify-center text-[10px] text-[#5a6a7a]">
                Add legs to see payoff
            </div>
        );
    }

    const { points, breakEvens } = result;

    const minSpot = points[0].spot;
    const maxSpot = points[points.length - 1].spot;
    const allPnl = points.map((p) => p.pnl);
    const rawMinPnl = Math.min(...allPnl);
    const rawMaxPnl = Math.max(...allPnl);
    const pnlPadding = Math.max(Math.abs(rawMaxPnl - rawMinPnl) * 0.15, 1);
    // Always include zero in vertical range so the $0 line is visible.
    const minPnl = Math.min(rawMinPnl - pnlPadding, 0);
    const maxPnl = Math.max(rawMaxPnl + pnlPadding, 0);

    const W = 800;
    const H = 280;
    const PAD_L = 10;
    const PAD_R = 10;
    const PAD_T = 20;
    const PAD_B = 20;

    const xScale = (s: number) =>
        PAD_L + ((s - minSpot) / (maxSpot - minSpot)) * (W - PAD_L - PAD_R);
    const yScale = (pnl: number) =>
        PAD_T + ((maxPnl - pnl) / (maxPnl - minPnl)) * (H - PAD_T - PAD_B);

    // Line path
    const linePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.spot)} ${yScale(p.pnl)}`)
        .join(" ");

    // Zero line Y
    const zeroY = yScale(0);
    const zeroInView = zeroY >= PAD_T && zeroY <= H - PAD_B;

    // Current spot X
    const adjustedSpot = spot * (1 + scenario.spotShiftPct);
    const spotX = xScale(adjustedSpot);
    const spotAccent = themeMode === "light" ? "#d97706" : "#ffd740";

    // Area path (fill below/above zero)
    const areaAbovePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.spot)} ${yScale(Math.max(0, p.pnl))}`)
        .join(" ") + ` L ${xScale(points[points.length - 1].spot)} ${zeroY} L ${xScale(points[0].spot)} ${zeroY} Z`;

    const areaBelowPath = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.spot)} ${yScale(Math.min(0, p.pnl))}`)
        .join(" ") + ` L ${xScale(points[points.length - 1].spot)} ${zeroY} L ${xScale(points[0].spot)} ${zeroY} Z`;

    const maxLossPoint =
        result.maxLoss != null
            ? points.reduce((worst, p) => (p.pnl < worst.pnl ? p : worst), points[0])
            : null;
    const maxGainPoint =
        result.maxGain != null
            ? points.reduce((best, p) => (p.pnl > best.pnl ? p : best), points[0])
            : null;
    const chartHasUnlimitedGain = result.maxGain == null;
    const maxLossLabel = maxLossPoint ? `Max Loss ${formatUsd(maxLossPoint.pnl)}` : null;
    const maxGainLabel = maxGainPoint ? `Max Gain ${formatUsd(maxGainPoint.pnl)}` : null;
    const labelBounds: LabelBounds = {
        minX: PAD_L + 4,
        maxX: W - PAD_R - 4,
        minY: PAD_T + 4,
        maxY: H - PAD_B - 4,
    };
    const majorLabelFontSize = 18;
    const minorLabelFontSize = 16;
    const occupiedLabelRects: Rect[] = [];
    const labels: LabelPlacement[] = [];
    const labelBgFill = themeMode === "light" ? "rgba(255,255,255,0.92)" : "rgba(6, 14, 24, 0.88)";

    if (zeroInView) {
        labels.push(
            placeLabel({
                text: "$0",
                anchorX: PAD_L + 8,
                anchorY: zeroY,
                color: "#9db2c9",
                borderColor: "#4a6077",
                prefer: "up-right",
                bounds: labelBounds,
                occupied: occupiedLabelRects,
                fontSize: majorLabelFontSize,
                bgFill: labelBgFill,
            })
        );
    }

    if (maxLossPoint && maxLossLabel) {
        labels.push(
            placeLabel({
                text: maxLossLabel,
                anchorX: xScale(maxLossPoint.spot),
                anchorY: yScale(maxLossPoint.pnl),
                color: "#ffb3b3",
                borderColor: "#ff6e6e",
                prefer: "up-right",
                bounds: labelBounds,
                occupied: occupiedLabelRects,
                fontSize: majorLabelFontSize,
                bgFill: labelBgFill,
            })
        );
    }

    if (maxGainPoint && maxGainLabel) {
        labels.push(
            placeLabel({
                text: maxGainLabel,
                anchorX: xScale(maxGainPoint.spot),
                anchorY: yScale(maxGainPoint.pnl),
                color: "#abffd2",
                borderColor: "#3ce28b",
                prefer: "up-left",
                bounds: labelBounds,
                occupied: occupiedLabelRects,
                fontSize: majorLabelFontSize,
                bgFill: labelBgFill,
            })
        );
    }

    breakEvens.forEach((be) => {
        labels.push(
            placeLabel({
                text: `BE ${Math.round(be).toLocaleString()}`,
                anchorX: xScale(be),
                anchorY: zeroY,
                color: spotAccent,
                borderColor: spotAccent,
                prefer: zeroY <= PAD_T + 24 ? "down-center" : "up-center",
                bounds: labelBounds,
                occupied: occupiedLabelRects,
                fontSize: minorLabelFontSize,
                bgFill: labelBgFill,
            })
        );
    });

    if (chartHasUnlimitedGain) {
        labels.push(
            placeLabel({
                text: "Max Gain Infinity",
                anchorX: W - PAD_R - 4,
                anchorY: PAD_T + 6,
                color: "#abffd2",
                borderColor: "#3ce28b",
                prefer: "down-left",
                bounds: labelBounds,
                occupied: occupiedLabelRects,
                fontSize: minorLabelFontSize,
                bgFill: labelBgFill,
            })
        );
    }

    const maxGainZone = result.maxGain != null ? extremaZones.maxGainZone : null;
    const maxLossZone = result.maxLoss != null ? extremaZones.maxLossZone : null;

    const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const localX = ((event.clientX - rect.left) / rect.width) * W;
        const localY = ((event.clientY - rect.top) / rect.height) * H;
        const clampedX = clamp(localX, PAD_L, W - PAD_R);
        const clampedY = clamp(localY, PAD_T, H - PAD_B);
        const spotRatio = (clampedX - PAD_L) / (W - PAD_L - PAD_R);
        const pointIndex = Math.round(clamp(spotRatio, 0, 1) * (points.length - 1));
        const point = points[pointIndex];
        if (!point) return;
        setHover({ x: clampedX, y: clampedY, point });
    };

    const hoverLines = hover
        ? [
            `Spot ${Math.round(hover.point.spot).toLocaleString()}`,
            `P/L ${formatUsdPrecise(hover.point.pnl)}`,
            maxGainZone ? `Max gain zone ${formatZoneDescriptor(maxGainZone, minSpot, maxSpot)}` : "Max gain zone n/a",
            maxLossZone ? `Max loss zone ${formatZoneDescriptor(maxLossZone, minSpot, maxSpot)}` : "Max loss zone n/a",
        ]
        : [];
    const hoverTooltip = hover
        ? placeHoverTooltip({
            anchorX: hover.x,
            anchorY: hover.y,
            lines: hoverLines,
            fontSize: 14,
            bounds: labelBounds,
        })
        : null;

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-[190px]"
                preserveAspectRatio="none"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHover(null)}
            >
                <defs>
                    <linearGradient id="payoff-gain" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#00e676" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#00e676" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="payoff-loss" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ff5252" stopOpacity="0" />
                        <stop offset="100%" stopColor="#ff5252" stopOpacity="0.2" />
                    </linearGradient>
                </defs>

                {/* Gain area */}
                <path d={areaAbovePath} fill="url(#payoff-gain)" />
                {/* Loss area */}
                <path d={areaBelowPath} fill="url(#payoff-loss)" />

                {/* Zero line */}
                {zeroInView && (
                    <>
                        <line
                            x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
                            stroke="#3a4f67" strokeWidth="1" strokeDasharray="4 4"
                            vectorEffect="non-scaling-stroke"
                        />
                    </>
                )}

                {/* Payoff curve */}
                <path
                    d={linePath} fill="none" stroke="#39d5ff" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />

                {/* Current spot vertical */}
                <line
                    x1={spotX} y1={PAD_T} x2={spotX} y2={H - PAD_B}
                    stroke={spotAccent} strokeWidth="1" strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke" opacity="0.7"
                />

                {/* Hover crosshair */}
                {hover && (
                    <g>
                        <line
                            x1={hover.x}
                            y1={PAD_T}
                            x2={hover.x}
                            y2={H - PAD_B}
                            stroke="#6f8092"
                            strokeWidth="1"
                            strokeDasharray="3 4"
                            opacity="0.45"
                            vectorEffect="non-scaling-stroke"
                        />
                        <line
                            x1={PAD_L}
                            y1={yScale(hover.point.pnl)}
                            x2={W - PAD_R}
                            y2={yScale(hover.point.pnl)}
                            stroke="#6f8092"
                            strokeWidth="1"
                            strokeDasharray="3 4"
                            opacity="0.35"
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle
                            cx={xScale(hover.point.spot)}
                            cy={yScale(hover.point.pnl)}
                            r="3.5"
                            fill="#0b1624"
                            stroke="#bcd4ec"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}

                {/* Break-even dots */}
                {breakEvens.map((be, i) => (
                    <g key={i}>
                        <circle
                            cx={xScale(be)} cy={zeroY} r="3"
                            fill={spotAccent} stroke="#fff" strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                ))}

                {/* Max-loss marker and label */}
                {maxLossPoint && (
                    <g>
                        <circle
                            cx={xScale(maxLossPoint.spot)}
                            cy={yScale(maxLossPoint.pnl)}
                            r="3"
                            fill="#ff5252"
                            stroke="#fff"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}

                {/* Max-gain marker and label */}
                {maxGainPoint && (
                    <g>
                        <circle
                            cx={xScale(maxGainPoint.spot)}
                            cy={yScale(maxGainPoint.pnl)}
                            r="3"
                            fill="#00e676"
                            stroke="#fff"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}

                {labels.map((label, index) => (
                    <g key={`${label.text}-${index}`}>
                        <rect
                            x={label.rect.x}
                            y={label.rect.y}
                            width={label.rect.w}
                            height={label.rect.h}
                            rx="4"
                            fill={label.bgFill}
                            stroke={label.borderColor}
                            strokeOpacity="0.5"
                            strokeWidth="1"
                        />
                        <text
                            x={label.textX}
                            y={label.textY}
                            fill={label.color}
                            fontSize={label.fontSize}
                            fontWeight="700"
                            fontFamily="monospace"
                        >
                            {label.text}
                        </text>
                    </g>
                ))}

                {hoverTooltip && (
                    <g>
                        <rect
                            x={hoverTooltip.rect.x}
                            y={hoverTooltip.rect.y}
                            width={hoverTooltip.rect.w}
                            height={hoverTooltip.rect.h}
                            rx="6"
                            fill={themeMode === "light" ? "rgba(255,255,255,0.96)" : "rgba(4, 10, 18, 0.94)"}
                            stroke="#5f7ea3"
                            strokeWidth="1"
                        />
                        {hoverTooltip.lines.map((line, i) => (
                            <text
                                key={`${line}-${i}`}
                                x={hoverTooltip.textX}
                                y={hoverTooltip.textY + i * hoverTooltip.lineHeight}
                                fill={i === 0 ? "#d4e6f9" : i === 1 ? "#8fd0ff" : "#a8bfd8"}
                                fontSize="12.5"
                                fontWeight="700"
                                fontFamily="monospace"
                            >
                                {line}
                            </text>
                        ))}
                    </g>
                )}
            </svg>

            {/* Labels */}
            <div className="flex justify-between px-1 text-[10px] text-[#5a6a7a] font-mono mt-0.5">
                <span>{Math.round(minSpot).toLocaleString()}</span>
                <span style={{ color: spotAccent }}>Spot {Math.round(adjustedSpot).toLocaleString()}</span>
                <span>{Math.round(maxSpot).toLocaleString()}</span>
            </div>

            {/* Summary row */}
            <div className="flex justify-between px-2 mt-1 text-[11px]">
                <span className="text-[#5a6a7a]">
                    Max Gain: <span className="text-[#00e676] font-mono">
                        {result.maxGain != null ? formatUsd(result.maxGain) : "∞"}
                    </span>
                </span>
                <span className="text-[#5a6a7a]">
                    Max Loss: <span className="text-[#ff5252] font-mono">
                        {result.maxLoss != null ? formatUsd(result.maxLoss) : "∞"}
                    </span>
                </span>
                {breakEvens.length > 0 && (
                    <span className="text-[#5a6a7a]">
                        BE: <span className="font-mono" style={{ color: spotAccent }}>
                            {breakEvens.map((b) => Math.round(b).toLocaleString()).join(", ")}
                        </span>
                    </span>
                )}
            </div>
        </div>
    );
}

function formatUsd(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${v.toFixed(0)}`;
}

function clamp(v: number, min: number, max: number): number {
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface LabelBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

type LabelPlacementMode =
    | "up-right"
    | "up-left"
    | "down-right"
    | "down-left"
    | "up-center"
    | "down-center";

interface PlaceLabelParams {
    text: string;
    anchorX: number;
    anchorY: number;
    color: string;
    borderColor: string;
    prefer: LabelPlacementMode;
    bounds: LabelBounds;
    occupied: Rect[];
    fontSize: number;
    bgFill: string;
}

interface LabelPlacement {
    text: string;
    color: string;
    borderColor: string;
    bgFill: string;
    fontSize: number;
    rect: Rect;
    textX: number;
    textY: number;
}

interface SpotZone {
    startSpot: number;
    endSpot: number;
    width: number;
    count: number;
}

interface ExtremaZones {
    maxGainZone: SpotZone | null;
    maxLossZone: SpotZone | null;
}

interface HoverTooltipPlacement {
    rect: Rect;
    lines: string[];
    textX: number;
    textY: number;
    lineHeight: number;
}

function textRectForMode(
    mode: LabelPlacementMode,
    anchorX: number,
    anchorY: number,
    w: number,
    h: number,
    gap = 10
): Rect {
    switch (mode) {
        case "up-right":
            return { x: anchorX + gap, y: anchorY - h - gap, w, h };
        case "up-left":
            return { x: anchorX - w - gap, y: anchorY - h - gap, w, h };
        case "down-right":
            return { x: anchorX + gap, y: anchorY + gap, w, h };
        case "down-left":
            return { x: anchorX - w - gap, y: anchorY + gap, w, h };
        case "up-center":
            return { x: anchorX - w / 2, y: anchorY - h - gap, w, h };
        case "down-center":
            return { x: anchorX - w / 2, y: anchorY + gap, w, h };
        default:
            return { x: anchorX + gap, y: anchorY - h - gap, w, h };
    }
}

function overlapArea(a: Rect, b: Rect): number {
    const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return xOverlap * yOverlap;
}

function clampRectToBounds(rect: Rect, bounds: LabelBounds): Rect {
    const x = clamp(rect.x, bounds.minX, bounds.maxX - rect.w);
    const y = clamp(rect.y, bounds.minY, bounds.maxY - rect.h);
    return { ...rect, x, y };
}

function modePreferenceOrder(prefer: LabelPlacementMode): LabelPlacementMode[] {
    const all: LabelPlacementMode[] = ["up-right", "up-left", "down-right", "down-left", "up-center", "down-center"];
    return [prefer, ...all.filter((m) => m !== prefer)];
}

function placeLabel(params: PlaceLabelParams): LabelPlacement {
    const { text, anchorX, anchorY, color, borderColor, prefer, bounds, occupied, fontSize, bgFill } = params;
    const padX = 10;
    const padY = 7;
    const estimatedW = text.length * fontSize * 0.62 + padX * 2;
    const estimatedH = fontSize + padY * 2;
    const modes = modePreferenceOrder(prefer);

    let bestRect: Rect | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < modes.length; i++) {
        const rawRect = textRectForMode(modes[i], anchorX, anchorY, estimatedW, estimatedH);
        const rect = clampRectToBounds(rawRect, bounds);
        const shiftPenalty = Math.abs(rect.x - rawRect.x) + Math.abs(rect.y - rawRect.y);
        const overlapPenalty = occupied.reduce((acc, box) => acc + overlapArea(rect, box), 0);
        const score = overlapPenalty * 200 + shiftPenalty + i * 6;

        if (score < bestScore) {
            bestScore = score;
            bestRect = rect;
        }
    }

    const chosen = bestRect ?? clampRectToBounds(textRectForMode(prefer, anchorX, anchorY, estimatedW, estimatedH), bounds);
    occupied.push(chosen);

    return {
        text,
        color,
        borderColor,
        bgFill,
        fontSize,
        rect: chosen,
        textX: chosen.x + padX,
        textY: chosen.y + padY + fontSize - 2,
    };
}

function formatUsdPrecise(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1000) return `${v >= 0 ? "+" : "-"}$${(abs / 1000).toFixed(2)}k`;
    return `${v >= 0 ? "+" : "-"}$${abs.toFixed(1)}`;
}

function totalPnlAtExpiry(legs: StrategyLeg[], mode: "profit" | "payoff", spot: number): number {
    let total = 0;
    for (const leg of legs) {
        const strike = Number.isFinite(leg.strike) && leg.strike > 0 ? leg.strike : 0;
        const entry = Number.isFinite(leg.entryPrice) && leg.entryPrice >= 0 ? leg.entryPrice : 0;
        const qty = Number.isFinite(leg.quantity) && leg.quantity > 0 ? leg.quantity : 0;
        const mult = Number.isFinite(leg.multiplier) && leg.multiplier > 0 ? leg.multiplier : 1;
        const sign = leg.side === "BUY" ? 1 : -1;
        const intrinsic = leg.type === "CALL"
            ? Math.max(0, spot - strike)
            : Math.max(0, strike - spot);
        const legPnl = mode === "payoff"
            ? sign * intrinsic * qty * mult
            : sign * (intrinsic - entry) * qty * mult;
        if (Number.isFinite(legPnl)) total += legPnl;
    }
    return total;
}

function mergeSpotZones(zones: SpotZone[], tolerance: number): SpotZone[] {
    if (zones.length <= 1) return zones;
    const sorted = [...zones].sort((a, b) => a.startSpot - b.startSpot);
    const merged: SpotZone[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const prev = merged[merged.length - 1];
        if (current.startSpot <= prev.endSpot + tolerance) {
            prev.endSpot = Math.max(prev.endSpot, current.endSpot);
            prev.width = Math.max(0, prev.endSpot - prev.startSpot);
            prev.count += current.count;
            continue;
        }
        merged.push({ ...current });
    }
    return merged;
}

function pickDominantZone(zones: SpotZone[]): SpotZone | null {
    if (zones.length === 0) return null;
    zones.sort((a, b) => {
        if (b.width !== a.width) return b.width - a.width;
        return b.count - a.count;
    });
    return zones[0];
}

function computeExtremaZonesFromLegs(
    legs: StrategyLeg[],
    mode: "profit" | "payoff",
    domainMaxSpot: number
): ExtremaZones {
    if (legs.length === 0) {
        return { maxGainZone: null, maxLossZone: null };
    }

    const strikeBoundaries = legs
        .map((leg) => (Number.isFinite(leg.strike) && leg.strike > 0 ? leg.strike : null))
        .filter((v): v is number => v != null);
    const rawBoundaries = [0, ...strikeBoundaries, Math.max(domainMaxSpot, 1)]
        .filter((v) => Number.isFinite(v) && v >= 0)
        .sort((a, b) => a - b);

    const boundaries: number[] = [];
    for (const boundary of rawBoundaries) {
        const prev = boundaries[boundaries.length - 1];
        if (prev == null || Math.abs(prev - boundary) > 1e-9) {
            boundaries.push(boundary);
        }
    }
    if (boundaries.length < 2) {
        return { maxGainZone: null, maxLossZone: null };
    }

    const values = boundaries.map((b) => totalPnlAtExpiry(legs, mode, b));
    const globalMax = Math.max(...values);
    const globalMin = Math.min(...values);
    const valueTol = Math.max(Math.abs(globalMax - globalMin) * 1e-8, 1e-6);
    const maxZones: SpotZone[] = [];
    const minZones: SpotZone[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
        const left = boundaries[i];
        const right = boundaries[i + 1];
        const leftValue = values[i];
        const rightValue = values[i + 1];
        const flat = Math.abs(rightValue - leftValue) <= valueTol;
        const midValue = flat
            ? (leftValue + rightValue) / 2
            : totalPnlAtExpiry(legs, mode, (left + right) / 2);

        if (flat && Math.abs(midValue - globalMax) <= valueTol) {
            maxZones.push({
                startSpot: left,
                endSpot: right,
                width: Math.max(0, right - left),
                count: 2,
            });
        }
        if (flat && Math.abs(midValue - globalMin) <= valueTol) {
            minZones.push({
                startSpot: left,
                endSpot: right,
                width: Math.max(0, right - left),
                count: 2,
            });
        }
    }

    for (let i = 0; i < boundaries.length; i++) {
        const spot = boundaries[i];
        const value = values[i];
        if (Math.abs(value - globalMax) <= valueTol) {
            maxZones.push({ startSpot: spot, endSpot: spot, width: 0, count: 1 });
        }
        if (Math.abs(value - globalMin) <= valueTol) {
            minZones.push({ startSpot: spot, endSpot: spot, width: 0, count: 1 });
        }
    }

    const spotTol = Math.max(domainMaxSpot * 1e-8, 1e-6);
    const mergedMax = mergeSpotZones(maxZones, spotTol);
    const mergedMin = mergeSpotZones(minZones, spotTol);

    return {
        maxGainZone: pickDominantZone(mergedMax),
        maxLossZone: pickDominantZone(mergedMin),
    };
}

function formatZoneDescriptor(zone: SpotZone, minSpot: number, maxSpot: number): string {
    const span = Math.max(maxSpot - minSpot, 1);
    const edgeTol = span * 0.015;
    const nearLeftEdge = zone.startSpot <= minSpot + edgeTol;
    const nearRightEdge = zone.endSpot >= maxSpot - edgeTol;
    const start = Math.round(zone.startSpot).toLocaleString();
    const end = Math.round(zone.endSpot).toLocaleString();

    if (nearLeftEdge && !nearRightEdge) return `<= ${end}`;
    if (!nearLeftEdge && nearRightEdge) return `>= ${start}`;
    if (nearLeftEdge && nearRightEdge) return "across chart range";
    return `${start} - ${end}`;
}

function placeHoverTooltip(params: {
    anchorX: number;
    anchorY: number;
    lines: string[];
    fontSize: number;
    bounds: LabelBounds;
}): HoverTooltipPlacement {
    const { anchorX, anchorY, lines, fontSize, bounds } = params;
    const lineHeight = fontSize + 4;
    const padX = 10;
    const padY = 8;
    const maxLineChars = lines.reduce((m, line) => Math.max(m, line.length), 0);
    const w = maxLineChars * fontSize * 0.60 + padX * 2;
    const h = lines.length * lineHeight + padY * 2 - 3;
    const gap = 12;

    let x = anchorX + gap;
    let y = anchorY - h - gap;
    if (x + w > bounds.maxX) x = anchorX - w - gap;
    if (x < bounds.minX) x = bounds.minX;
    if (y < bounds.minY) y = anchorY + gap;
    if (y + h > bounds.maxY) y = bounds.maxY - h;

    return {
        rect: { x, y, w, h },
        lines,
        textX: x + padX,
        textY: y + padY + fontSize - 1,
        lineHeight,
    };
}
