"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onCommand: (command: string, args: string) => void;
    expiries: string[];
}

const COMMANDS = [
    { cmd: "underlying", desc: "Switch underlying (ETH, BTC, IBIT)", example: "underlying ETH" },
    { cmd: "expiry", desc: "Jump to expiry", example: "expiry 2026-03-29" },
    { cmd: "venue", desc: "Toggle venue", example: "venue AEVO" },
    { cmd: "filter", desc: 'Filter by vsBench%', example: "filter vsBench > 5" },
    { cmd: "refresh", desc: "Refresh data", example: "refresh" },
];

export function CommandPalette({
    isOpen,
    onClose,
    onCommand,
    expiries,
}: CommandPaletteProps) {
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const filteredCmds = useMemo(() => {
        const lower = input.toLowerCase();
        return COMMANDS.filter(
            (c) =>
                c.cmd.includes(lower) ||
                c.desc.toLowerCase().includes(lower)
        );
    }, [input]);

    const handleSubmit = useCallback(() => {
        const parts = input.trim().split(/\s+/);
        const cmd = parts[0]?.toLowerCase();
        const args = parts.slice(1).join(" ");
        if (cmd) {
            onCommand(cmd, args);
            onClose();
        }
    }, [input, onCommand, onClose]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            window.addEventListener("keydown", handler);
            return () => window.removeEventListener("keydown", handler);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
            />

            {/* Palette */}
            <div className="relative w-full max-w-lg bg-[#0a0e17] border border-[#2a3a5a] rounded-lg shadow-2xl overflow-hidden">
                {/* Input */}
                <div className="flex items-center border-b border-[#1e2a3a] px-3 py-2">
                    <span className="text-[#4a90d9] mr-2 text-sm">{">"}</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSubmit();
                        }}
                        placeholder="Type a command..."
                        className="flex-1 bg-transparent text-white text-sm font-mono outline-none placeholder-[#3a4a5a]"
                    />
                    <kbd className="px-1.5 py-0.5 text-[9px] bg-[#111a27] border border-[#2a3a4a] rounded text-[#5a6a7a]">
                        ESC
                    </kbd>
                </div>

                {/* Suggestions */}
                <div className="max-h-60 overflow-y-auto">
                    {filteredCmds.map((cmd) => (
                        <button
                            key={cmd.cmd}
                            onClick={() => {
                                setInput(cmd.cmd + " ");
                                inputRef.current?.focus();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#111a27] transition-colors"
                        >
                            <span className="font-mono text-[12px] text-[#4a90d9] w-20 flex-shrink-0">
                                {cmd.cmd}
                            </span>
                            <span className="text-[11px] text-[#7a8a9a] flex-1">
                                {cmd.desc}
                            </span>
                            <span className="text-[10px] text-[#3a4a5a] font-mono">
                                {cmd.example}
                            </span>
                        </button>
                    ))}

                    {/* Expiry quick jump */}
                    {input.toLowerCase().startsWith("expiry") && expiries.length > 0 && (
                        <div className="border-t border-[#1e2a3a] py-1">
                            <div className="px-3 py-1 text-[9px] text-[#4a5a6a] uppercase">
                                Available Expiries
                            </div>
                            {expiries.map((exp) => (
                                <button
                                    key={exp}
                                    onClick={() => {
                                        onCommand("expiry", exp);
                                        onClose();
                                    }}
                                    className="w-full px-3 py-1 text-left text-[11px] font-mono text-[#88aacc] hover:bg-[#111a27]"
                                >
                                    {exp}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

