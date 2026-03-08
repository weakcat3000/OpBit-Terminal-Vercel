"use client";

import React from "react";
import { Panel } from "../ui/Panel";

interface WatchlistItem {
    label: string;
    contractKey: string;
    side: "C" | "P";
    mid: number | null;
}

interface WatchlistProps {
    items: WatchlistItem[];
    onSelect: (contractKey: string, side: "C" | "P") => void;
    selectedKey: string | null;
}

export function Watchlist({ items, onSelect, selectedKey }: WatchlistProps) {
    return (
        <Panel title="Watchlist" className="flex-1 min-h-0 flex flex-col" noPad>
            <div className="p-1 overflow-y-auto flex-1">
                {items.length === 0 ? (
                    <div className="text-[10px] text-[#4a5a6a] py-4 text-center">
                        Click rows to add to watchlist
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {items.map((item) => (
                            <button
                                key={item.contractKey}
                                onClick={() => onSelect(item.contractKey, item.side)}
                                className={`w-full flex items-center justify-between px-2 py-0.5 rounded text-[10px] transition-colors ${item.contractKey === selectedKey
                                    ? "bg-[#1a2a4a] text-white"
                                    : "text-[#8899aa] hover:bg-[#0d1520]"
                                    }`}
                            >
                                <span className="font-mono truncate mr-1">{item.label}</span>
                                <span
                                    className={`font-mono font-bold ${item.side === "C" ? "text-emerald-400" : "text-red-400"
                                        }`}
                                >
                                    {item.mid != null ? item.mid.toFixed(2) : "-"}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Panel>
    );
}

