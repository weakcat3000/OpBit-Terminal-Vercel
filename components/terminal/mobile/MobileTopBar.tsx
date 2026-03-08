"use client";

import React from "react";
import Image from "next/image";
import { Venue } from "@/src/core/types/venues";
import { VENUE_META } from "@/components/terminal/VenueToggles";

interface MobileTopBarProps {
    underlying: string;
    onUnderlyingChange: (u: string) => void;
    venues: Venue[];
    onVenueToggle: (v: Venue) => void;
    viewMode: "COMPARE" | "BEST";
    onViewModeChange: (m: "COMPARE" | "BEST") => void;
}

export function MobileTopBar({ underlying, onUnderlyingChange, venues, onVenueToggle, viewMode, onViewModeChange }: MobileTopBarProps) {
    const UNDERLYINGS = ["BTC", "ETH", "IBIT"];
    const AVAILABLE_VENUES: Venue[] = ["DERIBIT", "AEVO", "LYRA_V2", "PANOPTIC"];
    const MOBILE_VENUE_LABELS: Record<Venue, string> = {
        DERIBIT: "DERIBIT",
        AEVO: "AEVO",
        LYRA_V2: "LYRA",
        PANOPTIC: "PANOPTIC",
        IBIT: "IBIT",
    };

    return (
        <div className="border-b border-[#1e2a3a] bg-[#0d1117] shrink-0 z-10 w-full">
            <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
                <div className="flex items-center gap-1 shrink-0 mr-1">
                    <Image
                        src="/opbit_icon_transparent.png"
                        alt="OpBit icon"
                        width={18}
                        height={18}
                        className="no-theme-invert h-[18px] w-auto block"
                        priority
                    />
                    <span className="text-[13px] italic leading-none tracking-tight">
                        <span className="font-extrabold text-[#ffffff] [-webkit-text-stroke:0.55px_#ff8c00]">Op</span>
                        <span className="font-bold text-[#ff8c00] [-webkit-text-stroke:0.55px_#ff8c00]">Bit</span>
                    </span>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="h-9 flex items-stretch rounded-md border border-[#254368] bg-[#0a1220] p-0.5">
                        {UNDERLYINGS.map((u) => {
                            const isActive = underlying === u;
                            return (
                                <button
                                    key={u}
                                    onClick={() => onUnderlyingChange(u)}
                                    className={`flex-1 rounded-[5px] text-[13px] font-mono font-bold transition-colors ${isActive
                                            ? "bg-[#0d2642] text-[#47b5ff] border border-[#2f6ea9]"
                                            : "text-[#7d93aa] hover:text-[#9fb8cf]"
                                        }`}
                                >
                                    {u}
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar px-2 pb-2">
                <button
                    onClick={() => onViewModeChange(viewMode === "BEST" ? "COMPARE" : "BEST")}
                    className={`h-8 min-w-[88px] flex items-center justify-center gap-1.5 px-2 text-[10px] font-mono rounded-sm border transition-all shrink-0 ${viewMode === "BEST"
                        ? "border-[#2a4a6a] bg-[#0d1a2a] text-[#88bbdd]"
                        : "border-[#1a2030] bg-[#0a0f18] text-[#4a5a6a]"
                        }`}
                >
                    <Image
                        src="/opbit_icon_transparent.png"
                        alt="OpBit icon"
                        width={14}
                        height={14}
                        className="no-theme-invert h-3.5 w-3.5 object-contain"
                    />
                    <span className="tracking-wide">BEST</span>
                </button>

                {AVAILABLE_VENUES.map((v) => {
                    const active = venues.includes(v);
                    return (
                        <button
                            key={v}
                            onClick={() => onVenueToggle(v)}
                            className={`h-8 flex items-center px-2 text-[10px] font-mono rounded-sm transition-colors border whitespace-nowrap shrink-0 ${active
                                ? "bg-[#102a43] border-[#2f6ea9] text-[#b9ddff]"
                                : "bg-[#0a0f18] border-[#1e2a3a] text-[#5a6a7a]"
                                }`}
                        >
                            <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden mr-1 [&_svg]:block [&_svg]:w-full [&_svg]:h-full">
                                {VENUE_META[v]?.logo}
                            </div>
                            {MOBILE_VENUE_LABELS[v]}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
