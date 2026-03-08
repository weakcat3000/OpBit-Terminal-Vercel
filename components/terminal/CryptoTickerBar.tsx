"use client";

import React, { useEffect, useState, useRef } from 'react';

interface TickerItem {
    symbol: string;
    price: number;
    change24hPct: number;
}

export function CryptoTickerBar() {
    const [items, setItems] = useState<TickerItem[]>([]);

    // Ref keeping track of previous prices to trigger flash animations
    const priceMapRef = useRef<Record<string, number>>({});
    // Set of symbols that are currently flashing 'up' or 'down'
    const [flashState, setFlashState] = useState<Record<string, 'up' | 'down'>>({});

    useEffect(() => {
        let mounted = true;
        const fetchTicker = async () => {
            try {
                const res = await fetch('/api/market/ticker');
                if (res.ok) {
                    const data = await res.json();
                    if (mounted && data.items) {
                        const newFlashState: Record<string, 'up' | 'down'> = {};
                        let hasFlashes = false;

                        data.items.forEach((item: TickerItem) => {
                            const prevPrice = priceMapRef.current[item.symbol];
                            if (prevPrice !== undefined && prevPrice !== item.price) {
                                newFlashState[item.symbol] = item.price > prevPrice ? 'up' : 'down';
                                hasFlashes = true;
                            }
                            priceMapRef.current[item.symbol] = item.price;
                        });

                        setItems(data.items);

                        if (hasFlashes) {
                            setFlashState(prev => ({ ...prev, ...newFlashState }));
                            setTimeout(() => {
                                if (mounted) {
                                    setFlashState(prev => {
                                        const next = { ...prev };
                                        Object.keys(newFlashState).forEach(k => delete next[k]);
                                        return next;
                                    });
                                }
                            }, 300);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch ticker data", err);
            }
        };

        fetchTicker();
        const interval = setInterval(fetchTicker, 5000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    if (items.length === 0) return null;

    const renderItems = () => (
        items.map((item, idx) => {
            const isUp = item.change24hPct > 0;
            const isDown = item.change24hPct < 0;
            const flash = flashState[item.symbol];

            let colorClass = "text-[#8b9bab]";
            let arrow = "";

            if (isUp) {
                colorClass = "text-[#00e676]";
                arrow = "+";
            } else if (isDown) {
                colorClass = "text-[#ff3b3b]";
                arrow = "-";
            }

            // Transient flash class
            const bgFlash = flash === 'up' ? 'bg-[#00e676]/20' : flash === 'down' ? 'bg-[#ff3b3b]/20' : 'bg-transparent';

            return (
                <div
                    key={`${item.symbol}-${idx}`}
                    className={`flex items-center gap-1.5 px-3 py-[1px] shrink-0 font-mono text-[10px] transition-colors duration-300 ${bgFlash}`}
                >
                    <span className="font-bold text-[#e2e8f0]">{item.symbol}</span>
                    <span className="text-[#e2e8f0] tabular-nums">${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                    <span className={`${colorClass} tabular-nums font-bold flex items-center`}>
                        {arrow && <span className="text-[8px] mr-0.5">{arrow}</span>}
                        {Math.abs(item.change24hPct).toFixed(2)}%
                    </span>
                    <span className="text-[#2a3547] ml-2 font-sans font-light">|</span>
                </div>
            );
        })
    );

    return (
        <div className="fixed bottom-0 left-0 right-0 h-[20px] bg-[#080c14] border-t border-[#1e2a3a] overflow-hidden flex items-center z-50">
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                }
                .animate-marquee:hover {
                    animation-play-state: paused;
                }
            `}} />
            <div className="flex whitespace-nowrap animate-marquee w-max select-none">
                {renderItems()}
                {renderItems()}
            </div>
        </div>
    );
}

