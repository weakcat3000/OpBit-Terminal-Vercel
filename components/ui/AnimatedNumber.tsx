"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

interface AnimatedNumberProps {
    value: number | null | undefined;
    decimals?: number;
    durationMs?: number;
    flashDurationMs?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
    nullText?: string;
    signed?: boolean;
}

function easeOutCubic(x: number): number {
    return 1 - Math.pow(1 - x, 3);
}

export function AnimatedNumber({
    value,
    decimals = 2,
    durationMs = 420,
    flashDurationMs = 140,
    prefix = "",
    suffix = "",
    className = "",
    nullText = "-",
    signed = false,
}: AnimatedNumberProps) {
    const target = value != null && Number.isFinite(value) ? value : null;
    const [display, setDisplay] = useState<number | null>(target);
    const [flash, setFlash] = useState<"up" | "down" | null>(null);

    const startRef = useRef<number | null>(target);
    const targetRef = useRef<number | null>(target);
    const startedAtRef = useRef<number>(0);
    const frameRef = useRef<number | null>(null);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleDisplay = (next: number | null) => {
        requestAnimationFrame(() => setDisplay(next));
    };

    useEffect(() => {
        if (target == null) {
            targetRef.current = null;
            startRef.current = null;
            scheduleDisplay(null);
            return;
        }

        const previous = targetRef.current;
        if (previous == null) {
            targetRef.current = target;
            startRef.current = target;
            scheduleDisplay(target);
            return;
        }
        if (Math.abs(previous - target) < 1e-12) return;

        startRef.current = display ?? previous;
        targetRef.current = target;
        startedAtRef.current = performance.now();

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFlash(target > previous ? "up" : "down");
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlash(null), flashDurationMs);

        const animate = (t: number) => {
            const begin = startedAtRef.current;
            const start = startRef.current ?? target;
            const end = targetRef.current ?? target;
            const progress = Math.min(1, (t - begin) / durationMs);
            const eased = easeOutCubic(progress);
            setDisplay(start + (end - start) * eased);
            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            }
        };

        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(animate);
    }, [target, display, durationMs, flashDurationMs]);

    useEffect(() => {
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        };
    }, []);

    const text = useMemo(() => {
        if (display == null || !Number.isFinite(display)) return nullText;
        const sign = signed && display > 0 ? "+" : "";
        return `${prefix}${sign}${display.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        })}${suffix}`;
    }, [display, prefix, suffix, decimals, nullText, signed]);

    return (
        <span
            className={`font-mono tabular-nums transition-colors duration-200 ${
                flash === "up"
                    ? "bg-[#00e676]/7"
                    : flash === "down"
                        ? "bg-[#ff3b3b]/7"
                        : "bg-transparent"
            } ${className}`}
        >
            {text}
        </span>
    );
}
