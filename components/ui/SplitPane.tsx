"use client";

import React from "react";

interface SplitPaneProps {
    left: React.ReactNode;
    center: React.ReactNode;
    right: React.ReactNode;
    leftWidth?: number;
    rightWidth?: number;
}

function paneWidthClass(width: number, fallback: string): string {
    const widthMap: Record<number, string> = {
        180: "w-[180px]",
        200: "w-[200px]",
        220: "w-[220px]",
        240: "w-[240px]",
        260: "w-[260px]",
        280: "w-[280px]",
        300: "w-[300px]",
        320: "w-[320px]",
        340: "w-[340px]",
        360: "w-[360px]",
    };

    return widthMap[Math.round(width)] ?? fallback;
}

export function SplitPane({
    left,
    center,
    right,
    leftWidth = 220,
    rightWidth = 280,
}: SplitPaneProps) {
    const leftPaneClass = paneWidthClass(leftWidth, "w-[220px]");
    const rightPaneClass = paneWidthClass(rightWidth, "w-[280px]");

    return (
        <div className="flex h-full overflow-hidden">
            <div className={`flex-shrink-0 border-r border-[#1e2a3a] overflow-y-auto ${leftPaneClass}`}>
                {left}
            </div>
            <div className="flex-1 overflow-hidden min-w-0">{center}</div>
            <div className={`flex-shrink-0 border-l border-[#1e2a3a] overflow-y-auto ${rightPaneClass}`}>
                {right}
            </div>
        </div>
    );
}

