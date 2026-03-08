"use client";

import React from "react";
import Image from "next/image";

export type MobileTab = "CHAIN" | "CHARTS" | "STRATEGY";

interface MobileBottomNavProps {
    activeTab: MobileTab;
    onChangeTab: (tab: MobileTab) => void;
    onAssistantToggle: () => void;
    assistantHighlighted?: boolean;
}

export function MobileBottomNav({ activeTab, onChangeTab, onAssistantToggle, assistantHighlighted = false }: MobileBottomNavProps) {
    return (
        <div className="flex items-center justify-between px-2 pb-5 pt-2 border-t border-[#1e2a3a] bg-[#0d1117] shrink-0 w-full z-10">
            <button
                onClick={() => onChangeTab("CHAIN")}
                className={`flex-1 flex flex-col items-center gap-1 ${activeTab === "CHAIN" ? "text-[#47b5ff]" : "text-[#5a6a7a]"}`}
            >
                <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="text-[10px] uppercase font-mono tracking-wider">Chain</span>
            </button>
            <button
                onClick={() => onChangeTab("CHARTS")}
                className={`flex-1 flex flex-col items-center gap-1 ${activeTab === "CHARTS" ? "text-[#47b5ff]" : "text-[#5a6a7a]"}`}
            >
                <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M4 18V6m0 12h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="m8 14 3-3 2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[10px] uppercase font-mono tracking-wider">Charts</span>
            </button>
            <button
                onClick={() => onChangeTab("STRATEGY")}
                className={`flex-1 flex flex-col items-center gap-1 ${activeTab === "STRATEGY" ? "text-[#47b5ff]" : "text-[#5a6a7a]"}`}
            >
                <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M13 3 6.5 13h4.5L9.5 21 17 10h-4z" fill="currentColor" />
                </svg>
                <span className="text-[10px] uppercase font-mono tracking-wider">Strategy</span>
            </button>
            <button
                onClick={onAssistantToggle}
                className={`flex-1 flex flex-col items-center gap-1 text-[#47b5ff] transition-all ${
                    assistantHighlighted ? "ring-2 ring-[#47b5ff] rounded-sm bg-[#0f2238] shadow-[0_0_24px_rgba(71,181,255,0.45)] py-1" : ""
                }`}
            >
                <div>
                    <Image
                        src="/ai-chat-icon.svg"
                        alt="AI"
                        width={16}
                        height={16}
                        className="h-4 w-4 shrink-0 invert brightness-0 origin-center"
                        style={{ filter: "drop-shadow(0 0 4px #47b5ff) brightness(1.5)" }}
                    />
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#b9ddff]">Ask AI</span>
            </button>
        </div>
    );
}
