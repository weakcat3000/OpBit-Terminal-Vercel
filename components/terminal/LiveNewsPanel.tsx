"use client";

import React, { useEffect, useState } from "react";
import { Panel } from "../ui/Panel";

interface LiveNewsItem {
    id: string;
    title: string;
    description: string;
    publishedAt: string;
    sourceName: string;
    sourceUrl: string | null;
    imageUrl: string | null;
    symbols: string[];
    isBreaking?: boolean;
}

interface LiveNewsResponse {
    updatedAt: number;
    underlying: string;
    items: LiveNewsItem[];
    status?: "ok" | "down";
    reason?: string;
}

interface LiveNewsPanelProps {
    underlying: string;
}

function relativeTime(timestamp: string): string {
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return "now";
    const diffMs = Date.now() - parsed;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function LiveNewsPanel({ underlying }: LiveNewsPanelProps) {
    const [items, setItems] = useState<LiveNewsItem[]>([]);
    const [status, setStatus] = useState<"ok" | "down">("ok");
    const [reason, setReason] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const fetchNews = async (showLoading: boolean) => {
            if (showLoading) setLoading(true);
            try {
                const res = await fetch(`/api/market/news?underlying=${encodeURIComponent(underlying)}&limit=60`, {
                    cache: "no-store",
                });
                const data: LiveNewsResponse = await res.json();
                if (!mounted) return;
                const nextItems = data.items ?? [];
                setItems(nextItems);
                if (nextItems.length > 0) {
                    setStatus("ok");
                    setReason(null);
                } else {
                    const isDown = data.status === "down";
                    setStatus(isDown ? "down" : "ok");
                    setReason(isDown ? (data.reason ?? "Unable to load live headlines") : null);
                }
            } catch {
                if (!mounted) return;
                setItems([]);
                setStatus("down");
                setReason("Unable to load live headlines");
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchNews(true);
        const interval = setInterval(() => fetchNews(false), 5000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [underlying]);

    return (
        <Panel title="Live News" className="flex-1 min-h-0 flex flex-col" noPad>
            <div className="px-2 py-1 border-b border-[#1e2a3a] bg-gradient-to-r from-[#0d1622] to-[#0b131f]">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8fb7db] truncate">
                        {underlying} Headlines
                    </span>
                </div>
            </div>

            <div className="news-scroll flex-1 min-h-0 overflow-y-scroll overscroll-contain p-1 space-y-1 pr-1.5">
                {loading ? (
                    Array.from({ length: 12 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-sm border border-[#1f3147] bg-[linear-gradient(110deg,#0f1928_8%,#1c3049_32%,#0f1928_56%)] bg-[length:220%_100%] animate-[opbit-loading-shimmer_1.8s_ease-in-out_infinite] p-1.5"
                        >
                            <div className="h-2 w-20 rounded bg-[#233a57]/80 mb-1" />
                            <div className="h-2 w-full rounded bg-[#233a57]/70 mb-0.5" />
                            <div className="h-2 w-3/4 rounded bg-[#233a57]/60" />
                        </div>
                    ))
                ) : items.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-[10px] text-[#58708a] px-3">
                        {status === "down" && reason
                            ? reason
                            : "No live articles available right now. Please refresh shortly."}
                    </div>
                ) : (
                    items.map((item) => {
                        const isFresh = Date.now() - Date.parse(item.publishedAt) < 20 * 60000;
                        const href = item.sourceUrl ?? "#";
                        return (
                            <a
                                key={item.id}
                                href={href}
                                target={item.sourceUrl ? "_blank" : undefined}
                                rel={item.sourceUrl ? "noreferrer" : undefined}
                                className={`block rounded-sm border px-1.5 py-1 transition-colors ${
                                    isFresh
                                        ? "border-[#1d5b47] bg-gradient-to-r from-[#0f241d] to-[#0f1d2a] hover:border-[#2e8a6b]"
                                        : "border-[#1e2a3a] bg-[#0d1520] hover:border-[#2f435a]"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`w-1.5 h-1.5 rounded-full ${isFresh ? "bg-[#00e676]" : "bg-[#4e6987]"}`} />
                                        <span className="text-[8px] uppercase tracking-[0.12em] text-[#7e9dbd] truncate">
                                            {item.sourceName}
                                        </span>
                                    </div>
                                    <span className="text-[8px] font-mono text-[#5f7a95] shrink-0">
                                        {relativeTime(item.publishedAt)}
                                    </span>
                                </div>
                                <div className="text-[9.5px] text-[#d5e3f3] font-semibold leading-snug line-clamp-2">
                                    {item.title}
                                </div>
                                {(item.symbols.length > 0 || item.isBreaking) && (
                                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                        {item.symbols.slice(0, 3).map((symbol) => (
                                            <span
                                                key={`${item.id}-${symbol}`}
                                                className="px-1 py-0.5 text-[8px] font-mono uppercase rounded-sm border border-[#2a4a67] text-[#8ac1ff] bg-[#102033]"
                                            >
                                                {symbol}
                                            </span>
                                        ))}
                                        {item.isBreaking && (
                                            <span className="px-1 py-0.5 text-[8px] font-bold uppercase rounded-sm border border-[#245843] text-[#65eab4] bg-[#123025]">
                                                Breaking
                                            </span>
                                        )}
                                    </div>
                                )}
                            </a>
                        );
                    })
                )}
            </div>
            {!loading && items.length > 8 && (
                <div className="px-2 py-1 border-t border-[#1e2a3a] bg-[#0b121d] text-[8px] uppercase tracking-[0.13em] text-[#5f7ea3]">
                    Scroll for more headlines
                </div>
            )}
        </Panel>
    );
}
