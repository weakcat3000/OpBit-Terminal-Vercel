"use client";

import React from "react";
import { VenueLiveStatusCode } from "@/src/core/types/options";
import { Pill } from "../ui/Pill";

interface StatusBadgeProps {
    venue: string;
    status: VenueLiveStatusCode;
    reason?: string;
    themeMode: "dark" | "light";
}

const statusColor: Record<VenueLiveStatusCode, "green" | "yellow" | "red" | "blue"> = {
    ok: "green",
    degraded: "yellow",
    down: "red",
    delayed: "blue",
};

const lightPillClass: Record<VenueLiveStatusCode, string> = {
    ok: "bg-[#caf4dd] text-[#067a44] border-[#60c596]",
    degraded: "bg-[#fff0c8] text-[#9a6400] border-[#e3ba64]",
    down: "bg-[#ffd8dc] text-[#b0212f] border-[#e08a92]",
    delayed: "bg-[#d9ebff] text-[#145c98] border-[#7dade0]",
};

export function StatusBadge({ venue, status, reason, themeMode }: StatusBadgeProps) {
    const normalizedVenue = venue.trim().toUpperCase();
    const displayStatus: VenueLiveStatusCode =
        normalizedVenue === "IBIT" && status === "delayed" ? "ok" : status;

    return (
        <span className="relative group inline-flex items-center gap-1">
            <span
                className={`w-1.5 h-1.5 rounded-full ${displayStatus === "ok"
                        ? themeMode === "light" ? "bg-[#00b85c]" : "bg-emerald-400"
                        : displayStatus === "degraded"
                            ? themeMode === "light" ? "bg-[#d18b00]" : "bg-amber-400"
                            : displayStatus === "delayed"
                                ? themeMode === "light" ? "bg-[#2f86d8]" : "bg-blue-400"
                                : themeMode === "light" ? "bg-[#d53a48]" : "bg-red-400"
                    }`}
            />
            <Pill
                color={statusColor[displayStatus]}
                className={themeMode === "light" ? lightPillClass[displayStatus] : ""}
            >
                {venue}
            </Pill>
            {reason && (
                <span className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] border rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
                    themeMode === "light"
                        ? "bg-[#edf5ff] border-[#9fc0df] text-[#3e668c]"
                        : "bg-[#1a2235] border-[#2a3a5a] text-[#8899aa]"
                }`}>
                    {reason}
                </span>
            )}
        </span>
    );
}

