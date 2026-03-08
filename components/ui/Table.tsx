"use client";

import React from "react";

interface Column<T> {
    key: string;
    header: string;
    align?: "left" | "right" | "center";
    width?: string;
    render?: (row: T) => React.ReactNode;
    mono?: boolean;
}

interface TableProps<T> {
    columns: Column<T>[];
    data: T[];
    rowKey: (row: T) => string;
    selectedKey?: string | null;
    onRowClick?: (row: T) => void;
    stickyHeader?: boolean;
    className?: string;
}

function widthToClass(width?: string): string {
    if (!width) return "";

    const value = width.trim().toLowerCase();
    const widthMap: Record<string, string> = {
        "40px": "w-[40px]",
        "48px": "w-[48px]",
        "56px": "w-[56px]",
        "64px": "w-[64px]",
        "72px": "w-[72px]",
        "80px": "w-[80px]",
        "88px": "w-[88px]",
        "96px": "w-[96px]",
        "104px": "w-[104px]",
        "112px": "w-[112px]",
        "120px": "w-[120px]",
        "128px": "w-[128px]",
        "140px": "w-[140px]",
        "160px": "w-[160px]",
        "180px": "w-[180px]",
        "200px": "w-[200px]",
        "220px": "w-[220px]",
        "240px": "w-[240px]",
        "260px": "w-[260px]",
        "280px": "w-[280px]",
        "300px": "w-[300px]",
        "320px": "w-[320px]",
        "25%": "w-1/4",
        "33%": "w-1/3",
        "50%": "w-1/2",
        "66%": "w-2/3",
        "75%": "w-3/4",
        "100%": "w-full",
    };

    const direct = widthMap[value];
    if (direct) return direct;

    const pxMatch = /^(\d+(?:\.\d+)?)px$/.exec(value);
    if (pxMatch) {
        const target = Number.parseFloat(pxMatch[1]);
        const pxOptions = Object.keys(widthMap)
            .filter((k) => k.endsWith("px"))
            .map((k) => ({
                key: k,
                n: Number.parseFloat(k.replace("px", "")),
            }))
            .filter((v) => Number.isFinite(v.n));

        if (pxOptions.length > 0) {
            const nearest = pxOptions.sort((a, b) => Math.abs(a.n - target) - Math.abs(b.n - target))[0];
            return widthMap[nearest.key];
        }
    }

    const pctMatch = /^(\d+(?:\.\d+)?)%$/.exec(value);
    if (pctMatch) {
        const target = Number.parseFloat(pctMatch[1]);
        const pctOptions = Object.keys(widthMap)
            .filter((k) => k.endsWith("%"))
            .map((k) => ({
                key: k,
                n: Number.parseFloat(k.replace("%", "")),
            }))
            .filter((v) => Number.isFinite(v.n));

        if (pctOptions.length > 0) {
            const nearest = pctOptions.sort((a, b) => Math.abs(a.n - target) - Math.abs(b.n - target))[0];
            return widthMap[nearest.key];
        }
    }

    return "w-auto";
}

export function Table<T>({
    columns,
    data,
    rowKey,
    selectedKey,
    onRowClick,
    stickyHeader = true,
    className = "",
}: TableProps<T>) {
    return (
        <div className={`overflow-auto ${className}`}>
            <table className="w-full border-collapse text-[11px]">
                <thead>
                    <tr
                        className={
                            stickyHeader ? "sticky top-0 z-10 bg-[#0d1520]" : ""
                        }
                    >
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={`px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5a7a9a] border-b border-[#1e2a3a] whitespace-nowrap ${col.align === "right"
                                        ? "text-right"
                                        : col.align === "center"
                                            ? "text-center"
                                            : "text-left"
                                    } ${widthToClass(col.width)}`}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => {
                        const key = rowKey(row);
                        const isSelected = selectedKey === key;
                        return (
                            <tr
                                key={key}
                                onClick={() => onRowClick?.(row)}
                                className={`cursor-pointer border-b border-[#111a27] transition-colors ${isSelected
                                        ? "bg-[#1a2a4a] text-white"
                                        : "hover:bg-[#111a27] text-[#c0ccd8]"
                                    }`}
                            >
                                {columns.map((col) => (
                                    <td
                                        key={col.key}
                                        className={`px-1.5 py-0.5 whitespace-nowrap ${col.mono ? "font-mono" : ""
                                            } ${col.align === "right"
                                                ? "text-right"
                                                : col.align === "center"
                                                    ? "text-center"
                                                    : "text-left"
                                            }`}
                                    >
                                        {col.render
                                            ? col.render(row)
                                            : String((row as Record<string, unknown>)[col.key] ?? "-")}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

