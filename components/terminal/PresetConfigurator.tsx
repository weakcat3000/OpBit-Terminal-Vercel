"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StrategyPresetKey } from "@/src/strategy/StrategyTypes";
import { CompareRow } from "@/src/services/optionsService";
import { useStrategyBuilderStore } from "@/src/strategy/StrategyBuilderStore";
import { rowToLeg } from "@/src/strategy/StrategyPresets";

// Describes what legs each preset needs
interface PresetLegDef {
    label: string;
    right: "C" | "P";
    side: "BUY" | "SELL";
    defaultOffset: number; // 0 = ATM, positive = OTM pct offset
}

interface PresetShape {
    label: string;
    description: string;
    legs: PresetLegDef[];
}

const PRESET_SHAPES: Record<StrategyPresetKey, PresetShape> = {
    LONG_CALL: {
        label: "Long Call",
        description: "Buy a call option — bullish directional bet",
        legs: [{ label: "Buy Call", right: "C", side: "BUY", defaultOffset: 0 }],
    },
    LONG_PUT: {
        label: "Long Put",
        description: "Buy a put option — bearish directional bet",
        legs: [{ label: "Buy Put", right: "P", side: "BUY", defaultOffset: 0 }],
    },
    STRADDLE: {
        label: "Straddle",
        description: "Buy ATM call + put — bet on volatility",
        legs: [
            { label: "Buy Call", right: "C", side: "BUY", defaultOffset: 0 },
            { label: "Buy Put", right: "P", side: "BUY", defaultOffset: 0 },
        ],
    },
    STRANGLE: {
        label: "Strangle",
        description: "Buy OTM call + put — cheaper vol bet",
        legs: [
            { label: "Buy Call", right: "C", side: "BUY", defaultOffset: 0.05 },
            { label: "Buy Put", right: "P", side: "BUY", defaultOffset: 0.05 },
        ],
    },
    BULL_CALL_SPREAD: {
        label: "Bull Call Spread",
        description: "Buy ATM call, sell OTM call — capped upside",
        legs: [
            { label: "Buy Call", right: "C", side: "BUY", defaultOffset: 0 },
            { label: "Sell Call", right: "C", side: "SELL", defaultOffset: 0.05 },
        ],
    },
    BEAR_CALL_SPREAD: {
        label: "Bear Call Spread",
        description: "Sell OTM call, buy higher call — defined-risk bearish credit",
        legs: [
            { label: "Sell Call", right: "C", side: "SELL", defaultOffset: 0.03 },
            { label: "Buy Call Wing", right: "C", side: "BUY", defaultOffset: 0.08 },
        ],
    },
    BULL_PUT_SPREAD: {
        label: "Bull Put Spread",
        description: "Sell OTM put, buy lower put — defined-risk bullish credit",
        legs: [
            { label: "Sell Put", right: "P", side: "SELL", defaultOffset: 0.03 },
            { label: "Buy Put Wing", right: "P", side: "BUY", defaultOffset: 0.08 },
        ],
    },
    BEAR_PUT_SPREAD: {
        label: "Bear Put Spread",
        description: "Buy ATM put, sell OTM put — capped downside",
        legs: [
            { label: "Buy Put", right: "P", side: "BUY", defaultOffset: 0 },
            { label: "Sell Put", right: "P", side: "SELL", defaultOffset: 0.05 },
        ],
    },
    IRON_CONDOR: {
        label: "Iron Condor",
        description: "Sell OTM put+call, buy farther wings — defined range strategy",
        legs: [
            { label: "Sell Put", right: "P", side: "SELL", defaultOffset: 0.03 },
            { label: "Buy Put Wing", right: "P", side: "BUY", defaultOffset: 0.08 },
            { label: "Sell Call", right: "C", side: "SELL", defaultOffset: 0.03 },
            { label: "Buy Call Wing", right: "C", side: "BUY", defaultOffset: 0.08 },
        ],
    },
    COVERED_CALL: {
        label: "Covered Call",
        description: "Sell OTM call against spot — income strategy",
        legs: [{ label: "Sell Call", right: "C", side: "SELL", defaultOffset: 0.03 }],
    },
};

function formatExpiry(expiry: string): string {
    try {
        const d = new Date(`${expiry}T00:00:00Z`);
        return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase();
    } catch {
        return expiry;
    }
}

function findNearestStrike(strikes: number[], target: number): number {
    let best = strikes[0];
    let bestDist = Infinity;
    for (const s of strikes) {
        const d = Math.abs(s - target);
        if (d < bestDist) {
            bestDist = d;
            best = s;
        }
    }
    return best;
}

function getDefaultStrikes(shape: PresetShape, callStrikes: number[], putStrikes: number[], spot: number): number[] {
    return shape.legs.map((leg) => {
        const strikes = leg.right === "C" ? callStrikes : putStrikes;
        if (strikes.length === 0) return 0;
        const target = leg.defaultOffset === 0
            ? spot
            : leg.right === "C"
                ? spot * (1 + leg.defaultOffset)
                : spot * (1 - leg.defaultOffset);
        return findNearestStrike(strikes, target);
    });
}

interface PresetConfiguratorProps {
    preset: StrategyPresetKey;
    rows: CompareRow[];
    underlying: string;
    spot: number;
    expiries: string[];
    selectedExpiry: string | null;
    onSelectExpiry: (e: string) => void;
}

export function PresetConfigurator({
    preset,
    rows,
    underlying,
    spot,
    expiries,
    selectedExpiry,
    onSelectExpiry,
}: PresetConfiguratorProps) {
    const shape = PRESET_SHAPES[preset];
    const setLegs = useStrategyBuilderStore((s) => s.setLegs);

    // Available strikes from current rows
    const callStrikes = useMemo(
        () => Array.from(new Set(rows.filter((r) => r.right === "C").map((r) => r.strike))).sort((a, b) => a - b),
        [rows]
    );
    const putStrikes = useMemo(
        () => Array.from(new Set(rows.filter((r) => r.right === "P").map((r) => r.strike))).sort((a, b) => a - b),
        [rows]
    );

    // Strike selections
    const [legStrikes, setLegStrikes] = useState<number[]>(() =>
        getDefaultStrikes(shape, callStrikes, putStrikes, spot)
    );

    // Re-init strikes when preset changes or rows change (expiry switch)
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLegStrikes(getDefaultStrikes(shape, callStrikes, putStrikes, spot));
    }, [preset, callStrikes, putStrikes, spot, shape]);

    // Build legs from current configuration
    const buildLegsFromConfig = useCallback(
        (strikes: number[]) => {
            const builtLegs = [];
            for (let i = 0; i < shape.legs.length; i++) {
                const legDef = shape.legs[i];
                const strike = strikes[i];
                const row = rows.find((r) => r.right === legDef.right && r.strike === strike);
                if (row) {
                    builtLegs.push(rowToLeg(row, legDef.side, underlying));
                }
            }
            return builtLegs;
        },
        [shape.legs, rows, underlying]
    );

    // Auto-build legs when config changes (preset, strikes, rows)
    useEffect(() => {
        const newLegs = buildLegsFromConfig(legStrikes);
        if (newLegs.length > 0) {
            setLegs(newLegs);
        }
    }, [legStrikes, buildLegsFromConfig, setLegs]);

    function handleStrikeChange(legIndex: number, strike: number) {
        setLegStrikes((prev) => {
            const next = [...prev];
            next[legIndex] = strike;
            return next;
        });
    }

    const strikesAvailable = callStrikes.length > 0 || putStrikes.length > 0;

    return (
        <div className="px-3 py-3 border-b border-[#1e2a3a] bg-[#080d14]">
            {/* Preset header */}
            <div className="mb-2">
                <div className="text-[11px] text-[#39d5ff] font-semibold">
                    {shape.label}
                </div>
                <div className="text-[9px] text-[#5a6a7a] mt-0.5">
                    {shape.description}
                </div>
            </div>

            {/* Expiry selector */}
            <div className="mb-2">
                <label className="text-[8px] text-[#5a6a7a] uppercase tracking-wider block mb-1">
                    Expiry
                </label>
                <select
                    value={selectedExpiry ?? ""}
                    onChange={(e) => onSelectExpiry(e.target.value)}
                    className="w-full bg-[#0d1520] border border-[#2a3a4a] rounded px-2 py-1 text-[10px] text-[#e2e8f0] font-mono focus:border-[#39d5ff]/50 focus:outline-none"
                    title="Select expiry date"
                >
                    {expiries.map((exp) => (
                        <option key={exp} value={exp}>
                            {formatExpiry(exp)}
                        </option>
                    ))}
                </select>
            </div>

            {/* Strike selectors per leg */}
            {strikesAvailable ? (
                <div className="space-y-2">
                    {shape.legs.map((legDef, i) => {
                        const strikes = legDef.right === "C" ? callStrikes : putStrikes;
                        return (
                            <div key={i}>
                                <label className="text-[8px] text-[#5a6a7a] uppercase tracking-wider block mb-1">
                                    <span className={legDef.side === "BUY" ? "text-[#00e676]" : "text-[#ff5252]"}>
                                        {legDef.side}
                                    </span>
                                    {" "}{legDef.right === "C" ? "Call" : "Put"} Strike
                                </label>
                                <select
                                    value={legStrikes[i] ?? ""}
                                    onChange={(e) => handleStrikeChange(i, Number(e.target.value))}
                                    className="w-full bg-[#0d1520] border border-[#2a3a4a] rounded px-2 py-1 text-[10px] text-[#e2e8f0] font-mono focus:border-[#39d5ff]/50 focus:outline-none"
                                    title={`Select strike for ${legDef.label}`}
                                >
                                    {strikes.map((s) => (
                                        <option key={s} value={s}>
                                            {s.toLocaleString()}{" "}
                                            {Math.abs(s - spot) / spot < 0.005
                                                ? "(ATM)"
                                                : s > spot
                                                    ? `(+${(((s - spot) / spot) * 100).toFixed(1)}%)`
                                                    : `(${(((s - spot) / spot) * 100).toFixed(1)}%)`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-[9px] text-[#5a6a7a] py-2 text-center">
                    No strikes available for this expiry
                </div>
            )}
        </div>
    );
}
