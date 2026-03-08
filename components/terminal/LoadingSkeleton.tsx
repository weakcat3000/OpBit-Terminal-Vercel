"use client";

import React from "react";
import Image from "next/image";

const EXPIRY_WIDTH_CLASSES = [
    "w-[54px]",
    "w-[60px]",
    "w-[58px]",
    "w-[64px]",
    "w-[56px]",
    "w-[62px]",
];

interface LoadingSkeletonProps {
    selectedExpiry?: string | null;
}

function formatExpiryLabel(expiry?: string | null): string {
    if (!expiry) return "Loading expiry...";
    const d = new Date(`${expiry}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return `Loading ${expiry} contract`;
    return `Loading ${expiry} contract`;
}

export function LoadingSkeleton({ selectedExpiry }: LoadingSkeletonProps) {
    const delays = ["loading-d1", "loading-d2", "loading-d3", "loading-d4", "loading-d5", "loading-d6"] as const;
    const loadingLabel = formatExpiryLabel(selectedExpiry);

    return (
        <div className="loading-surface h-full overflow-hidden p-2">
            <div className="relative z-10 flex h-full flex-col gap-2">
                <div className="flex items-center justify-between border-b border-[#1e2a3a] pb-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#5f7da3]">
                            Expiry
                        </span>
                        <span className="rounded-sm border border-[#2a4364] bg-[#112035]/70 px-2 py-0.5 text-[10px] font-mono text-[#9fd2ff] whitespace-nowrap shrink-0">
                            {loadingLabel}
                        </span>
                        {EXPIRY_WIDTH_CLASSES.slice(0, 4).map((widthClass, i) => (
                            <div
                                key={i}
                                className={`loading-block ${delays[i % delays.length]} h-4 rounded-sm opacity-70 ${widthClass}`}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <Image
                            src="/opbit_icon_transparent.png"
                            alt="OpBit"
                            className="h-4 w-4 opacity-55"
                            width={16}
                            height={16}
                            suppressHydrationWarning
                        />
                        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#5fa47f]">
                            Syncing live chain
                        </span>
                        <span className="loading-dot loading-d1" />
                        <span className="loading-dot loading-d2" />
                        <span className="loading-dot loading-d3" />
                    </div>
                </div>

                <div className="loading-progress" />

                <div className="grid grid-cols-[1fr_90px_1fr] gap-1 text-[10px] uppercase tracking-[0.14em] font-mono">
                    <div className="rounded-sm border border-[#19443f]/45 bg-[#0d2b27]/50 py-1 text-center text-[#4fc79d]">
                        Calls
                    </div>
                    <div className="rounded-sm border border-[#2a3a4a] bg-[#101927]/65 py-1 text-center text-[#6f85a4]">
                        Strike
                    </div>
                    <div className="rounded-sm border border-[#4a2428]/45 bg-[#2b1013]/45 py-1 text-center text-[#d06773]">
                        Puts
                    </div>
                </div>

                <div className="grid grid-cols-[30px_1fr_1fr_1fr_1fr_1fr_86px_30px_1fr_1fr_1fr_1fr_1fr] gap-1">
                    {Array.from({ length: 13 }).map((_, i) => (
                        <div
                            key={i}
                            className={`loading-block ${delays[i % delays.length]} h-3 rounded-sm border border-[#223652]/45 ${i === 6 ? "loading-block--strike" : ""}`}
                        />
                    ))}
                </div>

                <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
                    {Array.from({ length: 16 }).map((_, rowIndex) => (
                        <div
                            key={rowIndex}
                            className="grid grid-cols-[30px_1fr_1fr_1fr_1fr_1fr_86px_30px_1fr_1fr_1fr_1fr_1fr] items-center gap-1"
                        >
                            {Array.from({ length: 13 }).map((__, colIndex) => {
                                const isStrike = colIndex === 6;
                                const isBestMarker = colIndex === 0 || colIndex === 7;
                                const delayClass = delays[(rowIndex + colIndex) % delays.length];

                                return (
                                    <div
                                        key={colIndex}
                                        className={`loading-block ${delayClass} rounded-sm border border-[#223652]/45 ${
                                            isStrike
                                                ? "loading-block--strike h-5"
                                                : isBestMarker
                                                    ? "loading-block--pulse h-4"
                                                    : "h-5"
                                        }`}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-sm border border-[#2a4364] bg-[#0a1523]/85 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[#88c5ff]">
                    <span className="loading-spinner" />
                    Building live options chain
                </div>
            </div>
        </div>
    );
}

