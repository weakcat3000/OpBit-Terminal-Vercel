"use client";

import React, { useMemo } from "react";
import { StrategyLeg, StrategyScenario } from "@/src/strategy/StrategyTypes";
import { computePayoffCurve } from "@/src/strategy/PayoffEngine";

interface PayoffChartProps {
    legs: StrategyLeg[];
    spot: number;
    scenario: StrategyScenario;
    themeMode: "dark" | "light";
}

export function PayoffChart({ legs, spot, scenario, themeMode }: PayoffChartProps) {
    const result = useMemo(
        () => computePayoffCurve(legs, spot, scenario),
        [legs, spot, scenario]
    );

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
    const minPnl = rawMinPnl - pnlPadding;
    const maxPnl = rawMaxPnl + pnlPadding;

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

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[140px]" preserveAspectRatio="none">
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
                    <line
                        x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
                        stroke="#3a4f67" strokeWidth="1" strokeDasharray="4 4"
                        vectorEffect="non-scaling-stroke"
                    />
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

                {/* Break-even dots */}
                {breakEvens.map((be, i) => (
                    <circle
                        key={i}
                        cx={xScale(be)} cy={zeroY} r="3"
                        fill={spotAccent} stroke="#fff" strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </svg>

            {/* Labels */}
            <div className="flex justify-between px-1 text-[8px] text-[#5a6a7a] font-mono mt-0.5">
                <span>{Math.round(minSpot).toLocaleString()}</span>
                <span style={{ color: spotAccent }}>Spot {Math.round(adjustedSpot).toLocaleString()}</span>
                <span>{Math.round(maxSpot).toLocaleString()}</span>
            </div>

            {/* Summary row */}
            <div className="flex justify-between px-2 mt-1 text-[9px]">
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
