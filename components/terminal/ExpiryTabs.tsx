"use client";

import React from "react";

interface ExpiryTabsProps {
    expiries: string[];
    selected: string | null;
    onSelect: (expiry: string) => void;
    rightInsetClassName?: string;
}

export function ExpiryTabs({ expiries, selected, onSelect, rightInsetClassName = "" }: ExpiryTabsProps) {
    if (expiries.length === 0) {
        return (
            <div className="px-2 py-1 text-[10px] text-[#4a5a6a]">
                No expiries available
            </div>
        );
    }

    return (
        <div className={`expiry-tabs w-full flex items-center gap-0.5 px-2 py-1 bg-[#070b12] border-b border-[#1e2a3a] overflow-x-auto ${rightInsetClassName}`}>
            <span className="expiry-tabs-label text-[10px] text-[#4a5a6a] uppercase tracking-wider mr-2 flex-shrink-0">
                Expiry:
            </span>
            {expiries.map((exp) => {
                const isSelected = exp === selected;
                // Format as shorter label: "29Mar26"
                const d = new Date(exp + "T00:00:00Z");
                const label = `${d.getUTCDate()}${d.toLocaleString("en", {
                    month: "short",
                    timeZone: "UTC",
                })}${String(d.getUTCFullYear()).slice(2)}`;

                return (
                    <button
                        key={exp}
                        onClick={() => onSelect(exp)}
                        className={`expiry-tab-btn px-2 py-0.5 text-[11px] font-mono rounded transition-colors flex-shrink-0 ${isSelected
                                ? "expiry-tab-btn-selected bg-[#1a2a4a] text-[#88ccff] border border-[#2a4a7a]"
                                : "expiry-tab-btn-unselected text-[#5a7a9a] hover:text-[#88aacc] hover:bg-[#0d1520] border border-transparent"
                            }`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

