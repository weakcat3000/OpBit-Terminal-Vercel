"use client";

import React from "react";

interface PillProps {
    children: React.ReactNode;
    color?: "green" | "yellow" | "red" | "blue" | "gray";
    className?: string;
}

const colorMap = {
    green: "bg-emerald-900/50 text-emerald-400 border-emerald-700/50",
    yellow: "bg-amber-900/50 text-amber-400 border-amber-700/50",
    red: "bg-red-900/50 text-red-400 border-red-700/50",
    blue: "bg-blue-900/50 text-blue-400 border-blue-700/50",
    gray: "bg-gray-800/50 text-gray-400 border-gray-700/50",
};

export function Pill({ children, color = "gray", className = "" }: PillProps) {
    return (
        <span
            className={`ui-pill ui-pill-${color} inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${colorMap[color]} ${className}`}
        >
            {children}
        </span>
    );
}

