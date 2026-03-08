"use client";

import React from "react";
import { Venue, ALL_VENUES, VENUE_LABELS } from "@/src/core/types/venues";
import { VenueStatus } from "@/src/core/types/options";
import { StatusBadge } from "./StatusBadge";

interface VenueTogglesProps {
    activeVenues: Venue[];
    onToggle: (venue: Venue) => void;
    venueStatus: VenueStatus[];
    themeMode: "dark" | "light";
    pendingPanopticHighlight?: boolean;
}

const DeribitLogo = () => (
    <svg suppressHydrationWarning viewBox="0 0 216 216" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path
            suppressHydrationWarning
            d="M36 180H0V144H36V72H0V36H36V0H72V36H108V0H144V36C183.8 36 216 68.2 216 108C216 147.8 183.8 180 144 180V216H108V180H72V216H36V180ZM72 144H144C163.9 144 180 127.9 180 108C180 88.1 163.9 72 144 72H72V144Z"
            fill="#0052FF"
        />
    </svg>
);

const AevoLogo = () => (
    <svg
        suppressHydrationWarning
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 800 800"
        xmlSpace="preserve"
        className="w-full h-full"
    >
        <circle suppressHydrationWarning cx="400" cy="400" r="400" fill="#0d1118" />
        <path
            suppressHydrationWarning
            fill="#ffffff"
            d="M593.7,297.5c-10.4-16.2-23.2-28.8-38.4-37.8s-35.3-13.6-60.4-13.6c-22,0-40.3,3.7-54.9,11
            c-14.6,7.4-26.7,17.8-36.3,31.2c-5-7.3-11-13.8-18.2-19.3c-7.1-5.6-15-10.1-23.4-13.6c-8.5-3.5-17.1-6-26-7.8
            c-8.9-1.8-17.5-2.6-26-2.6c-13.9,0-27.5,1.7-41.1,5.1c-13.4,3.5-25.5,9-36.1,16.5c-10.5,7.6-19.2,17.2-25.9,29.2
            c-5.6,9.9-9.1,21.2-10.6,34.2l47.3,8.5c1.3-18.6,7.9-31.9,20-40.2c12.2-8.3,27.5-12.4,46-12.4s33.3,4.5,44.7,13.5
            c11.5,9,17.1,23.4,17.1,43.1v31.2c-15.8,0-31.4,0.1-46.8,0.3c-15.4,0.2-31.1,0.4-46.8,0.8c-12.4,0-24.3,2.2-35.6,6.4
            c-11.4,4.2-21.4,10.1-30,17.6c-8.7,7.5-15.6,16.6-20.6,27.4s-7.6,22.7-7.6,35.8s2.3,24.8,6.7,35s10.5,19.2,18.2,26.9
            c9.7,9.7,21.2,17.1,34.7,22.3c13.6,5.1,28.8,7.8,45.7,7.8c25.8,0,47.4-5,64.7-15c17.3-10,30.8-23.5,40.4-40.4
            c8.8,18.5,22.5,32.5,41,41.9c18.5,9.5,39.3,14.2,62.4,14.2c17.3,0,31.7-1.9,43.1-5.8c11.3-3.9,22.5-10.3,33.2-19.1
            c11.2-9.3,19.7-19.5,25.7-30.7c4.8-8.9,8.3-19,10.5-30.3l0,0l-46.8-8.4c-4.2,18.5-12.7,31.9-25.4,40.4
            s-25.7,12.7-40.4,12.7s-27-2.8-37.1-8.4s-18.1-12.9-24.3-22c-6.2-9-10.6-19.4-13.3-31.2c-2.6-11.8-4-23.7-4-36.1v-2.3
            l197.7-0.6v-15c0-21.6-1.6-40.4-4.6-56.4C608.5,325.8,602.5,311.1,593.7,297.5L593.7,297.5z M372.4,419
            c0,13.6-1.2,26.1-3.5,37.6c-2.2,11.6-9,23-20.2,34.1c-7.7,7.8-16.9,13.2-27.7,16.5c-10.7,3.3-21.7,4.9-32.9,4.9
            c-15.3,0-28.4-4.3-39-13c-10.6-8.7-15.9-21.1-15.9-37.3s5.5-28.6,16.5-37.3c10.9-8.7,24-13,39-13h0l83.6-0.6V419z
            M566.2,375.1v0.2H419.4c0-13.6,2.1-26.1,6.1-37.6c4-11.5,10.1-21.5,18.2-30c6.2-6.6,13.3-11.8,21.4-15.6
            c8.1-3.9,17.8-5.8,28.9-5.8c13.1,0,23.8,2.2,32.3,6.6c8.4,4.4,15.3,10.1,20.8,17c6.6,8.1,11.3,17.5,14.2,28.6
            C564.2,349.3,565.8,361.6,566.2,375.1L566.2,375.1z"
        />
        <path
            suppressHydrationWarning
            fill="#ffffff"
            d="M725.6,262.4c-17.8-42.1-43.3-79.9-75.7-112.3s-70.2-57.9-112.3-75.7C494,56,447.7,46.6,400,46.6
            S306,56,262.4,74.4c-42.1,17.8-79.9,43.3-112.3,75.7s-57.9,70.2-75.7,112.3C56,306,46.6,352.3,46.6,400s9.3,94,27.8,137.6
            c17.8,42.1,43.3,79.9,75.7,112.3s70.2,57.9,112.3,75.7C306,744,352.3,753.4,400,753.4s94-9.3,137.6-27.8
            c42.1-17.8,79.9-43.3,112.3-75.7s57.9-70.2,75.7-112.3C744,494,753.4,447.7,753.4,400S744,306,725.6,262.4z M625.8,625.8
            c-60.3,60.3-140.5,93.5-225.8,93.5s-165.5-33.2-225.8-93.5S80.6,485.3,80.6,400s33.2-165.5,93.6-225.8S314.7,80.6,400,80.6
            s165.5,33.2,225.8,93.6c60.3,60.3,93.5,140.5,93.5,225.8S686.2,565.5,625.8,625.8z"
        />
    </svg>
);

const LyraLogo = () => {
    const id = React.useId();
    return (
        <svg
            suppressHydrationWarning
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            className="w-full h-full"
        >
            <path
                suppressHydrationWarning
                fill={`url(#lyra_logo_a_${id})`}
                d="m15.884 9.979-3.134 3.145H4.812c-.574 0-.861-.658-.473-1.052l8.872-8.929a.495.495 0 0 1 .794.135l2.21 4.923a1.59 1.59 0 0 1-.33 1.778"
            />
            <path
                suppressHydrationWarning
                fill={`url(#lyra_logo_b_${id})`}
                d="M3 13.686c.18.242.827.563 1.947.563h12.321c.714 0 1.361.416 1.643 1.069l2.042 4.827a.62.62 0 0 1-.574.855H7.523a2.03 2.03 0 0 1-1.856-1.204z"
            />
            <defs>
                <linearGradient id={`lyra_logo_a_${id}`} x1="12" x2="12" y1="2.994" y2="21.001" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#5ADCD3" />
                    <stop offset="1" stopColor="#37C4B1" />
                </linearGradient>
                <linearGradient id={`lyra_logo_b_${id}`} x1="18.838" x2="5.267" y1="15.025" y2="19.988" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#47D1C1" />
                    <stop offset="1" stopColor="#21BFA1" />
                </linearGradient>
            </defs>
        </svg>
    );
};

const IbitLogo = () => {
    const id = React.useId();
    return (
        <svg
            suppressHydrationWarning
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full block"
        >
            <defs>
                <linearGradient id={`ibit_wordmark_grad_${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#d7dde6" />
                </linearGradient>
            </defs>
            <g transform="translate(50 50)">
                <circle cx="0" cy="0" r="47" stroke="#f7931a" strokeOpacity="0.65" strokeWidth="2" />
                <text
                    x="0"
                    y="-7"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontSize="33"
                    fontWeight="700"
                    letterSpacing="-1"
                    fill={`url(#ibit_wordmark_grad_${id})`}
                >
                    iBit
                </text>
                <text
                    x="0"
                    y="17"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontSize="12"
                    fontWeight="600"
                    letterSpacing="-0.1"
                    fill="#bfc8d4"
                >
                    BlackRock
                </text>
            </g>
        </svg>
    );
};

const FallbackLogo = ({ initial, bgClass }: { initial: string; bgClass: string }) => (
    <div className={`w-full h-full rounded-full flex items-center justify-center text-[#ffffff] font-bold text-[8px] font-sans ${bgClass}`}>
        {initial}
    </div>
);

export const VENUE_META: Record<Venue, { logo: React.ReactNode }> = {
    DERIBIT: { logo: <DeribitLogo /> },
    AEVO: { logo: <AevoLogo /> },
    LYRA_V2: { logo: <LyraLogo /> },
    PANOPTIC: { logo: <FallbackLogo initial="P" bgClass="bg-[#9333ea]" /> },
    IBIT: { logo: <IbitLogo /> },
};

export function VenueToggles({
    activeVenues,
    onToggle,
    venueStatus,
    themeMode,
    pendingPanopticHighlight = false,
}: VenueTogglesProps) {
    const statusMap = new Map(venueStatus.map((vs) => [vs.venue, vs]));

    return (
        <div className="flex items-center gap-1.5">
            {ALL_VENUES.map((venue) => {
                const isPanopticPending = venue === "PANOPTIC" && pendingPanopticHighlight;
                const isActive = activeVenues.includes(venue) || isPanopticPending;
                const vs = statusMap.get(venue);

                return (
                    <button
                        key={venue}
                        onClick={() => onToggle(venue)}
                        className={`venue-toggle-btn flex items-center gap-1.5 px-2 py-0.5 text-[10px] rounded border transition-all ${isActive
                            ? themeMode === "light"
                                ? "venue-toggle-active border-[#6fa3d1] bg-[#d9ebff] text-[#14588f]"
                                : "venue-toggle-active border-[#2a4a6a] bg-[#0d1a2a] text-[#88bbdd]"
                            : themeMode === "light"
                                ? "venue-toggle-inactive border-[#b8cee5] bg-[#f8fbff] text-[#54789d] hover:border-[#92b6d9] hover:text-[#2e5f8a]"
                                : "venue-toggle-inactive border-[#1a2030] bg-transparent text-[#4a5a6a] opacity-50 hover:opacity-80"
                            }`}
                    >
                        {/* Logo Element */}
                        <div suppressHydrationWarning className="no-theme-invert w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden">
                            {VENUE_META[venue].logo}
                        </div>

                        <StatusBadge
                            venue={VENUE_LABELS[venue]}
                            status={vs?.status ?? "down"}
                            reason={vs?.reason}
                            themeMode={themeMode}
                        />
                    </button>
                );
            })}
        </div>
    );
}

