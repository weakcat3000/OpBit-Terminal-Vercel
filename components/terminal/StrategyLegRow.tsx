"use client";

import React from "react";
import { StrategyLeg } from "@/src/strategy/StrategyTypes";
import { useStrategyBuilderStore } from "@/src/strategy/StrategyBuilderStore";
import { VENUE_LABELS } from "@/src/core/types/venues";

function formatExpiry(expiry: string): string {
    try {
        const d = new Date(`${expiry}T00:00:00Z`);
        return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase();
    } catch {
        return expiry;
    }
}

function formatPrice(v: number | null): string {
    if (v == null || !Number.isFinite(v)) return "-";
    return v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v.toFixed(4);
}

export function StrategyLegRow({ leg }: { leg: StrategyLeg }) {
    const updateLeg = useStrategyBuilderStore((s) => s.updateLeg);
    const removeLeg = useStrategyBuilderStore((s) => s.removeLeg);

    const pnl = (() => {
        if (leg.currentMark == null || !Number.isFinite(leg.currentMark)) return null;
        const entry = Number.isFinite(leg.entryPrice) ? leg.entryPrice : 0;
        const multiplier = Number.isFinite(leg.multiplier) && leg.multiplier > 0 ? leg.multiplier : 1;
        const quantity = Number.isFinite(leg.quantity) && leg.quantity > 0 ? leg.quantity : 0;
        const sign = leg.side === "BUY" ? 1 : -1;
        const value = sign * (leg.currentMark - entry) * multiplier * quantity;
        return Number.isFinite(value) ? value : null;
    })();

    const isBuy = leg.side === "BUY";

    return (
        <div className="flex flex-col gap-1 px-3 py-2 border-b border-[#1e2a3a] hover:bg-[#0d1520] transition-colors">
            {/* Top line: side + contract description */}
            <div className="flex items-center gap-2 text-[11px]">
                <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${isBuy
                            ? "bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30"
                            : "bg-[#ff5252]/15 text-[#ff5252] border border-[#ff5252]/30"
                        }`}
                >
                    {leg.side}
                </span>
                <span className="text-[#e2e8f0] font-mono font-semibold">
                    {leg.quantity}x
                </span>
                <span className="text-[#8b9bab] font-mono">
                    {leg.strike.toLocaleString()}{leg.type === "CALL" ? "C" : "P"}
                </span>
                <span className="text-[#5a6a7a] font-mono text-[10px]">
                    {formatExpiry(leg.expiry)}
                </span>
                <span className="text-[#5a6a7a]">@</span>
                <span className="text-[#e2e8f0] font-mono">
                    {formatPrice(leg.entryPrice)}
                </span>
            </div>

            {/* Bottom line: venue + live mark + pnl + controls */}
            <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[#1a2332] border border-[#2a3a4a] text-[#8b9bab] text-[9px]">
                        {VENUE_LABELS[leg.venue] ?? leg.venue}
                    </span>
                    <span className="text-[#5a6a7a]">
                        Mark: <span className="text-[#c0ccd8] font-mono">{formatPrice(leg.currentMark)}</span>
                    </span>
                    {pnl != null && (
                        <span className={`font-mono font-semibold ${pnl >= 0 ? "text-[#00e676]" : "text-[#ff5252]"}`}>
                            {pnl >= 0 ? "+" : ""}{formatPrice(pnl)}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        className="px-1 text-[#5a6a7a] hover:text-[#c0ccd8] transition-colors"
                        onClick={() => updateLeg(leg.id, { quantity: Math.max(1, leg.quantity - 1) })}
                        title="Decrease quantity"
                    >
                        −
                    </button>
                    <button
                        type="button"
                        className="px-1 text-[#5a6a7a] hover:text-[#c0ccd8] transition-colors"
                        onClick={() => updateLeg(leg.id, { quantity: leg.quantity + 1 })}
                        title="Increase quantity"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        className="px-1.5 text-[#5a6a7a] hover:text-[#39d5ff] transition-colors text-[9px]"
                        onClick={() => updateLeg(leg.id, { side: isBuy ? "SELL" : "BUY" })}
                        title="Flip side"
                    >
                        ⇄
                    </button>
                    <button
                        type="button"
                        className="px-1 text-[#5a6a7a] hover:text-[#ff5252] transition-colors"
                        onClick={() => removeLeg(leg.id)}
                        title="Remove leg"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    );
}
