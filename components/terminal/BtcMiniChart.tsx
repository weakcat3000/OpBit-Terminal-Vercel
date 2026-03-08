"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

function easeOutExpo(x: number): number {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

interface MarketData {
    price: number | null;
    change24hPct: number | null;
    series: { t: number; p: number }[];
    updatedAt: number;
}

interface MarketMiniChartProps {
    symbol: "BTCUSDT" | "ETHUSDT";
    title: string;
    badgeIcon: React.ReactNode;
    onPriceUpdate?: (price: number | null) => void;
}

const BitcoinLogo = () => (
    <svg suppressHydrationWarning viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <circle suppressHydrationWarning cx="16" cy="16" r="16" fill="#F7931A" />
        <path
            suppressHydrationWarning
            fillRule="evenodd"
            clipRule="evenodd"
            d="M21.88 13.75c.3-2-1.22-3.08-3.3-3.8l.68-2.7-1.64-.41-.66 2.63c-.43-.1-.88-.2-1.33-.3l.66-2.65-1.64-.41-.68 2.7c-.36-.08-.7-.16-1.04-.24l.01-.01-2.26-.57-.43 1.73s1.22.28 1.19.3c.67.17.8.62.77.98l-.77 3.08c.05.01.1.02.15.05l-.16-.04-1.08 4.34c-.08.2-.29.5-.76.39.02.03-1.2-.3-1.2-.3L8 20.64l2.13.54c.4.1.78.2 1.16.3l-.69 2.75 1.64.41.68-2.7c.45.12.89.24 1.31.34l-.67 2.69 1.64.41.69-2.74c2.84.54 4.98.32 5.88-2.24.72-2.06-.04-3.24-1.53-4.01 1.08-.25 1.89-.96 2.1-2.43zm-3.76 5.26c-.5 2.06-4 1-5.13.73l.91-3.64c1.13.28 4.74.76 4.22 2.91zm.5-5.3c-.45 1.88-3.37.92-4.32.69l.83-3.3c.95.23 3.95.64 3.5 2.6z"
            fill="white"
        />
    </svg>
);

const EthereumLogo = () => (
    <svg suppressHydrationWarning viewBox="0 0 784.37 1277.39" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <polygon suppressHydrationWarning fill="#343434" fillRule="nonzero" points="392.07,0 383.5,29.11 383.5,873.74 392.07,882.29 784.13,650.54" />
        <polygon suppressHydrationWarning fill="#8C8C8C" fillRule="nonzero" points="392.07,0 -0,650.54 392.07,882.29 392.07,472.33" />
        <polygon suppressHydrationWarning fill="#3C3C3B" fillRule="nonzero" points="392.07,956.52 387.24,962.41 387.24,1263.28 392.07,1277.38 784.37,724.89" />
        <polygon suppressHydrationWarning fill="#8C8C8C" fillRule="nonzero" points="392.07,1277.38 392.07,956.52 -0,724.89" />
        <polygon suppressHydrationWarning fill="#141414" fillRule="nonzero" points="392.07,882.29 784.13,650.54 392.07,472.33" />
        <polygon suppressHydrationWarning fill="#393939" fillRule="nonzero" points="0,650.54 392.07,882.29 392.07,472.33" />
    </svg>
);

function MarketMiniChart({ symbol, title, badgeIcon, onPriceUpdate }: MarketMiniChartProps) {
    const [data, setData] = useState<MarketData | null>(null);
    const [displayPrice, setDisplayPrice] = useState<number | null>(null);
    const [flashState, setFlashState] = useState<"up" | "down" | null>(null);

    const targetPriceRef = useRef<number | null>(null);
    const startPriceRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const displayPriceRef = useRef<number | null>(null);
    const rAFRef = useRef<number | null>(null);
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        displayPriceRef.current = displayPrice;
    }, [displayPrice]);

    useEffect(() => {
        let mounted = true;

        const fetchMarket = async () => {
            try {
                const res = await fetch(`/api/market/btc?symbol=${encodeURIComponent(symbol)}`);
                if (!res.ok) return;

                const json: MarketData = await res.json();
                if (!mounted) return;
                const normalizedPrice = json.price != null && Number.isFinite(Number(json.price))
                    ? Number(json.price)
                    : null;
                const normalized: MarketData = {
                    ...json,
                    price: normalizedPrice,
                };
                onPriceUpdate?.(normalizedPrice);

                setData((prev) => {
                    const prevPrice = prev?.price != null && Number.isFinite(Number(prev.price))
                        ? Number(prev.price)
                        : null;
                    if (prevPrice != null && normalizedPrice != null && prevPrice !== normalizedPrice) {
                        startPriceRef.current = displayPriceRef.current ?? prevPrice;
                        targetPriceRef.current = normalizedPrice;
                        startTimeRef.current = performance.now();
                        setFlashState(normalizedPrice > prevPrice ? "up" : "down");

                        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
                        flashTimeoutRef.current = setTimeout(() => {
                            if (mounted) setFlashState(null);
                        }, 100);
                    } else if (prevPrice == null && normalizedPrice != null) {
                        setDisplayPrice(normalizedPrice);
                        targetPriceRef.current = normalizedPrice;
                    }
                    return normalized;
                });
            } catch (err) {
                console.error(`Failed to fetch ${symbol} mini chart data`, err);
            }
        };

        fetchMarket();
        const interval = setInterval(fetchMarket, 5000);

        return () => {
            mounted = false;
            clearInterval(interval);
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        };
    }, [symbol, onPriceUpdate]);

    useEffect(() => {
        const animate = (time: number) => {
            if (
                startPriceRef.current !== null &&
                targetPriceRef.current !== null &&
                startTimeRef.current !== null
            ) {
                const duration = 600;
                const elapsed = time - startTimeRef.current;
                const progress = Math.min(elapsed / duration, 1);
                const eased = easeOutExpo(progress);
                const current =
                    startPriceRef.current + (targetPriceRef.current - startPriceRef.current) * eased;

                setDisplayPrice(current);

                if (progress < 1) {
                    rAFRef.current = requestAnimationFrame(animate);
                    return;
                }

                startPriceRef.current = null;
            }

            rAFRef.current = requestAnimationFrame(animate);
        };

        rAFRef.current = requestAnimationFrame(animate);
        return () => {
            if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
        };
    }, []);

    const sparklinePath = useMemo(() => {
        const recentSeries = (data?.series ?? []).slice(-36);
        if (recentSeries.length < 2) return null;

        const w = 400;
        const h = 100;
        const prices = recentSeries.map((s) => s.p);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = maxP - minP || 1;
        const padY = h * 0.1;
        const drawH = h - padY * 2;

        const pts = recentSeries.map((point, i) => {
            const x = (i / (recentSeries.length - 1)) * w;
            const normalizedY = (point.p - minP) / range;
            const y = h - padY - normalizedY * drawH;
            return `${x},${y}`;
        });

        return `M ${pts.join(" L ")}`;
    }, [data]);
    const gradientIdUp = `${symbol.toLowerCase()}-grad-up`;
    const gradientIdDown = `${symbol.toLowerCase()}-grad-down`;

    const isUp = (data?.change24hPct ?? 0) >= 0;
    const flashStyle = useMemo(() => {
        if (flashState === "up") {
            return {
                backgroundColor: "rgba(0, 230, 118, 0.06)",
                borderColor: "rgba(0, 230, 118, 0.45)",
            };
        }
        if (flashState === "down") {
            return {
                backgroundColor: "rgba(255, 59, 59, 0.06)",
                borderColor: "rgba(255, 59, 59, 0.45)",
            };
        }
        return undefined;
    }, [flashState]);

    return (
        <div
            className="h-[180px] bg-[#111622] border border-[#2a3547] flex flex-col font-sans shrink-0 transition-colors duration-75"
            style={flashStyle}
        >
            <div className="px-3 py-2 border-b border-[#2a3547]/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="no-theme-invert w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden">
                        {badgeIcon}
                    </div>
                    <span className="text-[#8b9bab] text-[10px] uppercase tracking-widest font-bold">{title}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-[#4a5a6a] font-mono">
                    <span>BINANCE 3m</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
                </div>
            </div>

            <div className="p-3 flex flex-col justify-center flex-1 relative z-10 pl-4">
                <div className="text-[28px] font-mono font-bold text-[#e2e8f0] tracking-tighter tabular-nums leading-none">
                    <AnimatedNumber
                        value={displayPrice}
                        prefix="$"
                        decimals={2}
                        durationMs={540}
                        className="text-[#e2e8f0]"
                    />
                </div>
                <div className={`font-mono text-[11px] font-bold mt-1 ${isUp ? "text-[#00e676]" : "text-[#ff3b3b]"}`}>
                    <AnimatedNumber
                        value={Math.abs(data?.change24hPct ?? 0) * (isUp ? 1 : -1)}
                        decimals={2}
                        suffix="%"
                        signed
                        durationMs={500}
                        className={isUp ? "text-[#00e676]" : "text-[#ff3b3b]"}
                    />
                </div>
            </div>

            <div className="h-[74px] w-full mt-auto relative overflow-hidden border-t border-[#2a3547]/30">
                <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[#2a3547]/20 border-dashed border-[#2a3547]/40 w-full" />

                {sparklinePath ? (
                    <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="w-full h-full opacity-60">
                        <path
                            d={`${sparklinePath} L 400 100 L 0 100 Z`}
                            fill={isUp ? `url(#${gradientIdUp})` : `url(#${gradientIdDown})`}
                        />
                        <path
                            d={sparklinePath}
                            fill="none"
                            stroke={isUp ? "#00e676" : "#ff3b3b"}
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        <defs>
                            <linearGradient id={gradientIdUp} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#00e676" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#00e676" stopOpacity="0" />
                            </linearGradient>
                            <linearGradient id={gradientIdDown} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#ff3b3b" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#ff3b3b" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                    </svg>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[9px] text-[#4a5a6a] font-mono animate-pulse">awaiting block...</span>
                    </div>
                )}
            </div>
        </div>
    );
}

interface SymbolChartProps {
    onPriceUpdate?: (price: number | null) => void;
}

export function BtcMiniChart({ onPriceUpdate }: SymbolChartProps) {
    return (
        <MarketMiniChart
            symbol="BTCUSDT"
            title="Bitcoin Live"
            badgeIcon={<BitcoinLogo />}
            onPriceUpdate={onPriceUpdate}
        />
    );
}

export function EthMiniChart({ onPriceUpdate }: SymbolChartProps) {
    return (
        <MarketMiniChart
            symbol="ETHUSDT"
            title="Ethereum Live"
            badgeIcon={<EthereumLogo />}
            onPriceUpdate={onPriceUpdate}
        />
    );
}
