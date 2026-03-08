"use client";

import React from "react";

interface PanelProps {
    children: React.ReactNode;
    title?: string;
    className?: string;
    noPad?: boolean;
}

export function Panel({ children, title, className = "", noPad }: PanelProps) {
    const contentClass = noPad
        ? "h-full min-h-0 flex flex-col"
        : "p-2";

    return (
        <div
            className={`bg-[#0a0e17] border border-[#1e2a3a] rounded-sm overflow-hidden ${className}`}
        >
            {title && (
                <div className="px-2 py-1 bg-[#0d1520] border-b border-[#1e2a3a] text-[10px] font-bold uppercase tracking-widest text-[#4a90d9]">
                    {title}
                </div>
            )}
            <div className={contentClass}>{children}</div>
        </div>
    );
}

