"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Venue } from "@/src/core/types/venues";
import { VenueStatus } from "@/src/core/types/options";
import { VenueToggles } from "./VenueToggles";
import { Pill } from "../ui/Pill";

interface TopBarProps {
    underlying: string;
    onUnderlyingChange: (u: string) => void;
    viewMode: "COMPARE" | "BEST";
    onViewModeChange: (m: "COMPARE" | "BEST") => void;
    venues: Venue[];
    onVenueToggle: (v: Venue) => void;
    venueStatus: VenueStatus[];
    onAssistantToggle: () => void;
    assistantOpen: boolean;
    assistantHighlighted?: boolean;
    lastRefreshed: number | null;
    themeMode: "dark" | "light";
    onThemeToggle: () => void;
    pendingPanopticHighlight?: boolean;
}

const UNDERLYINGS = ["BTC", "ETH", "IBIT"];

function formatLocalDateTime(ms: number): string {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

export function TopBar({
    underlying,
    onUnderlyingChange,
    viewMode,
    onViewModeChange,
    venues,
    onVenueToggle,
    venueStatus,
    onAssistantToggle,
    assistantOpen,
    assistantHighlighted = false,
    lastRefreshed,
    themeMode,
    onThemeToggle,
    pendingPanopticHighlight = false,
}: TopBarProps) {
    const [nowMs, setNowMs] = useState<number | null>(null);
    void lastRefreshed;

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = () => {
            const now = Date.now();
            setNowMs(now);
            const msToNextSecond = 1000 - (now % 1000);
            timer = setTimeout(tick, msToNextSecond);
        };
        tick();
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, []);

    return (
        <div className={`topbar-shell flex items-center gap-3 pl-3 pr-1 py-1.5 border-b text-[11px] ${
            themeMode === "light"
                ? "bg-[#f7fbff] border-[#b7cde3]"
                : "bg-[#070b12] border-[#1e2a3a]"
        }`}>
            {/* Logo / Brand */}
            <div className="flex items-center gap-1.5 mr-2">
                <Image
                    src="/opbit_icon_transparent.png"
                    alt="OpBit icon"
                    width={38}
                    height={30}
                    className="no-theme-invert h-6 w-auto block"
                    suppressHydrationWarning
                    priority
                />
                <span className="text-[19px] italic leading-none tracking-tight">
                    <span className="font-extrabold text-[#ffffff] [-webkit-text-stroke:1.3px_#ff8c00]">
                        Op
                    </span>
                    <span className="font-bold text-[#ff8c00] [-webkit-text-stroke:1.3px_#ff8c00]">
                        Bit
                    </span>
                </span>
            </div>

            {/* Underlying selector */}
            <div className={`flex items-center gap-1 border-r pr-3 ${themeMode === "light" ? "border-[#c5d7ea]" : "border-[#1e2a3a]"}`}>
                {UNDERLYINGS.map((u) => (
                    <button
                        key={u}
                        onClick={() => onUnderlyingChange(u)}
                        className={`topbar-underlying-btn px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${underlying === u
                            ? themeMode === "light"
                                ? "topbar-underlying-active bg-[#dcecff] text-[#0f4d86]"
                                : "topbar-underlying-active bg-[#1a2a4a] text-white"
                            : themeMode === "light"
                                ? "topbar-underlying-inactive text-[#2e5f8b] hover:text-[#194e80]"
                                : "topbar-underlying-inactive text-[#5a7a9a] hover:text-[#88aacc]"
                            }`}
                    >
                        {u}
                    </button>
                ))}
            </div>

            {/* BEST Mode Toggle */}
            <div className={`border-r pr-3 flex items-center ${themeMode === "light" ? "border-[#c5d7ea]" : "border-[#1e2a3a]"}`}>
                <button
                    onClick={() => onViewModeChange(viewMode === "BEST" ? "COMPARE" : "BEST")}
                    className={`topbar-best-toggle flex items-center gap-1.5 px-2 py-0.5 text-[10px] rounded border transition-all ${viewMode === "BEST"
                        ? themeMode === "light"
                            ? "topbar-best-active border-[#6fa3d1] bg-[#d9ebff] text-[#14588f]"
                            : "topbar-best-active border-[#2a4a6a] bg-[#0d1a2a] text-[#88bbdd]"
                        : themeMode === "light"
                            ? "topbar-best-inactive border-[#b8cee5] bg-[#f8fbff] text-[#54789d]"
                            : "topbar-best-inactive border-[#1a2030] bg-transparent text-[#4a5a6a] opacity-50 hover:opacity-80"
                        }`}
                >
                    <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden">
                        <Image
                            src="/opbit_icon_transparent.png"
                            alt="OpBit icon"
                            width={16}
                            height={16}
                            className="no-theme-invert w-3.5 h-3.5 object-contain"
                            suppressHydrationWarning
                        />
                    </div>
                    <span className="inline-flex items-center gap-1">
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${viewMode === "BEST" ? "bg-emerald-400" : "bg-[#4a5a6a]"
                                }`}
                        />
                        <Pill color={viewMode === "BEST" ? "green" : "gray"}>BEST</Pill>
                    </span>
                </button>
            </div>

            {/* Venue toggles */}
            <div className={`border-r pr-3 ${themeMode === "light" ? "border-[#c5d7ea]" : "border-[#1e2a3a]"}`}>
                <VenueToggles
                    activeVenues={venues}
                    onToggle={onVenueToggle}
                    venueStatus={venueStatus}
                    themeMode={themeMode}
                    pendingPanopticHighlight={pendingPanopticHighlight}
                />
            </div>

            {/* Assistant trigger */}
            <button
                type="button"
                onClick={onAssistantToggle}
                className={`topbar-chat-btn flex items-center gap-1 px-2 py-0.5 text-[10px] leading-none border rounded transition-colors ${
                    themeMode === "light"
                        ? "bg-[#edf5ff] border-[#a7c2de] text-[#2e5f8c] shadow-[0_0_14px_rgba(71,151,255,0.24)] hover:bg-[#e3f0ff] hover:border-[#80abd2] hover:text-[#1c5488] hover:shadow-[0_0_18px_rgba(71,151,255,0.34)]"
                        : "text-[#5a6a7a] border-[#1e2a3a] shadow-[0_0_16px_rgba(71,181,255,0.32)] hover:border-[#3a4a5a] hover:text-[#88aacc] hover:shadow-[0_0_22px_rgba(71,181,255,0.42)]"
                } ${assistantHighlighted ? "ring-4 ring-[#47b5ff] onboarding-halo-button border-[#47b5ff] text-white" : ""}`}
            >
                <span className="inline-flex h-5 items-center justify-center self-center">
                    <Image
                        src="/ai-chat-icon.svg"
                        alt="AI assistant icon"
                        width={20}
                        height={20}
                        className="no-theme-invert block h-5 w-5 shrink-0 object-contain"
                        suppressHydrationWarning
                    />
                </span>
                <span className={`whitespace-nowrap leading-none ${assistantOpen ? "text-[#9fd6ff]" : ""}`}>
                    Chat with OpBit AI
                </span>
                <kbd className={`ml-1 inline-flex h-5 items-center px-1 py-0 text-[9px] leading-none border rounded ${
                    themeMode === "light"
                        ? "bg-[#f4f9ff] border-[#b3cae1] text-[#4f7394]"
                        : "bg-[#111a27] border-[#2a3a4a]"
                }`}>C</kbd>
            </button>
            <button
                type="button"
                onClick={(event) => {
                    event.preventDefault();
                    onThemeToggle();
                }}
                title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className={`topbar-theme-btn inline-flex h-6 items-center gap-1 px-1.5 text-[9px] leading-none font-mono border rounded transition-colors ${themeMode === "light"
                    ? "text-[#1c5488] border-[#80abd2] bg-[#e3f0ff] hover:bg-[#d9eaff] hover:border-[#6d9bc7]"
                    : "text-[#5a6a7a] border-[#1e2a3a] bg-[#0b111c] hover:border-[#3a4a5a] hover:text-[#88aacc]"
                    }`}
            >
                {themeMode === "dark" ? (
                    <svg viewBox="0 0 24 24" className="no-theme-invert h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M12 2.5v2.2M12 19.3v2.2M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" className="no-theme-invert h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a7.3 7.3 0 1 0 10.2 10.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                )}
                <span>{themeMode === "dark" ? "LITE" : "DARK"}</span>
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Clock + last refreshed */}
            <div className="flex items-center gap-3">
                <span className={`text-[9px] font-mono whitespace-nowrap leading-none ${
                    themeMode === "light" ? "text-[#4f7394]" : "text-[#6c8aa8]"
                }`} suppressHydrationWarning>
                    {nowMs != null ? `Local Time: ${formatLocalDateTime(nowMs)}` : "Local Time: --/--/---- --:--:--"}
                </span>
            </div>
        </div>
    );
}

