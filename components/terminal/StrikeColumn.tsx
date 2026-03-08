"use client";

import React from "react";

export function StrikeColumn({ strike }: { strike: number }) {
    return (
        <div className="strike-col-cell font-mono font-bold text-[12px] text-[#e0e8f0] text-center bg-[#0a1018] px-2 py-0.5">
            {strike.toLocaleString()}
        </div>
    );
}

