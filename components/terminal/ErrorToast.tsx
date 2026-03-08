"use client";

import React, { useEffect } from "react";

interface ErrorToastProps {
    message: string | null;
    onDismiss: () => void;
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(onDismiss, 3200);
        return () => clearTimeout(timer);
    }, [message, onDismiss]);

    if (!message) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 transition-all duration-300 opacity-100 translate-y-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-red-950/90 border border-red-800/50 rounded-lg shadow-lg backdrop-blur-sm">
                <span className="text-red-400 text-[11px]">!</span>
                <span className="text-red-300 text-[11px] max-w-xs truncate">
                    {message}
                </span>
                <button
                    onClick={onDismiss}
                    className="text-red-500 hover:text-red-300 ml-1"
                >
                    x
                </button>
            </div>
        </div>
    );
}

