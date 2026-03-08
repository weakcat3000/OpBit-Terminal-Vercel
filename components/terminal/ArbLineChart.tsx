"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { ArbHistoryPoint } from "@/src/services/arbitrage/arbTypes";

interface ArbLineChartProps {
    /** Map of opportunity id -> history points */
    histories: Record<string, ArbHistoryPoint[]>;
    /** Selected opportunity id (highlighted) */
    selectedId: string | null;
    /** Labels for each id */
    labels: Record<string, string>;
    themeMode: "dark" | "light";
}

const CHART_COLORS = [
    "#0ce4ae",
    "#facc15",
    "#f43f5e",
    "#a855f7",
    "#38bdf8",
    "#fb923c",
    "#22c55e",
    "#e879f9",
];
const MIN_PROFIT_LINE = 0.02; // 2% threshold line
const CHART_WINDOW_MS = 5 * 60 * 1000;
const CHART_MAX_Y = 0.10;
const CHART_MIN_Y = -0.10;
const Y_TICK_COUNT = 5;
const X_TICK_COUNT = 4;

function formatTimeLabel(ts: number): string {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
}

export function ArbLineChart({ histories, selectedId, labels, themeMode }: ArbLineChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDark = themeMode === "dark";

    const ids = useMemo(() => {
        const all = Object.keys(histories);
        if (selectedId && all.includes(selectedId)) {
            return [selectedId, ...all.filter((id) => id !== selectedId)].slice(0, 8);
        }
        return all.slice(0, 8);
    }, [histories, selectedId]);

    useEffect(() => {
        let animationFrameId = 0;

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (!rect || rect.width === 0 || rect.height === 0) return;

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = rect.height;
            const pad = { top: 16, right: 14, bottom: 30, left: 56 };
            const chartW = w - pad.left - pad.right;
            const chartH = h - pad.top - pad.bottom;
            if (chartW <= 0 || chartH <= 0) return;

            const bgColor = isDark ? "#111622" : "#f8fbff";
            const gridMajorColor = isDark ? "rgba(66,87,114,0.55)" : "rgba(154,177,201,0.72)";
            const gridMinorColor = isDark ? "rgba(53,71,95,0.35)" : "rgba(181,199,220,0.55)";
            const axisLineColor = isDark ? "#86a3c4" : "#4f7091";
            const axisTextColor = isDark ? "#90a9c5" : "#4e6783";
            const legendTextColor = isDark ? "#e7f2ff" : "#254563";
            const legendBg = isDark ? "rgba(8,14,24,0.7)" : "rgba(238,246,255,0.85)";
            const legendBorder = isDark ? "rgba(79,108,140,0.4)" : "rgba(144,170,197,0.8)";
            const thresholdStroke = isDark ? "rgba(12,228,174,0.4)" : "rgba(12,184,146,0.45)";
            const thresholdLabel = isDark ? "rgba(12,228,174,0.86)" : "rgba(12,150,118,0.92)";

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, w, h);

            const nowMs = Date.now();
            const tMin = nowMs - CHART_WINDOW_MS;
            const tMax = nowMs;

            let observedMin = 0;
            for (const id of ids) {
                const pts = histories[id] ?? [];
                for (const pt of pts) {
                    if (pt.profitPct < observedMin) observedMin = pt.profitPct;
                }
            }

            let pMin = Math.min(-0.02, observedMin * 1.15);
            pMin = Math.max(CHART_MIN_Y, pMin);
            const pMax = CHART_MAX_Y;

            const toX = (t: number) => pad.left + ((t - tMin) / (tMax - tMin)) * chartW;
            const toY = (p: number) => pad.top + chartH - ((p - pMin) / (pMax - pMin)) * chartH;

            ctx.strokeStyle = gridMinorColor;
            ctx.lineWidth = 0.7;
            for (let i = 0; i <= Y_TICK_COUNT; i++) {
                const y = pad.top + (chartH / Y_TICK_COUNT) * i;
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(w - pad.right, y);
                ctx.stroke();
            }
            for (let i = 0; i <= X_TICK_COUNT; i++) {
                const x = pad.left + (chartW / X_TICK_COUNT) * i;
                ctx.beginPath();
                ctx.moveTo(x, pad.top);
                ctx.lineTo(x, pad.top + chartH);
                ctx.stroke();
            }

            ctx.strokeStyle = gridMajorColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, toY(0));
            ctx.lineTo(w - pad.right, toY(0));
            ctx.stroke();

            ctx.strokeStyle = axisLineColor;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top);
            ctx.lineTo(pad.left, pad.top + chartH);
            ctx.lineTo(pad.left + chartW, pad.top + chartH);
            ctx.stroke();

            ctx.font = "10px monospace";
            ctx.fillStyle = axisTextColor;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            for (let i = 0; i <= Y_TICK_COUNT; i++) {
                const val = pMax - ((pMax - pMin) / Y_TICK_COUNT) * i;
                const y = pad.top + (chartH / Y_TICK_COUNT) * i;
                ctx.fillText(`${(val * 100).toFixed(1)}%`, pad.left - 6, y);
            }

            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            for (let i = 0; i <= X_TICK_COUNT; i++) {
                const t = tMin + (CHART_WINDOW_MS / X_TICK_COUNT) * i;
                const x = pad.left + (chartW / X_TICK_COUNT) * i;
                ctx.fillText(formatTimeLabel(t), x, h - pad.bottom + 8);
            }

            const threshY = toY(MIN_PROFIT_LINE);
            ctx.strokeStyle = thresholdStroke;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.moveTo(pad.left, threshY);
            ctx.lineTo(w - pad.right, threshY);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = "10px monospace";
            ctx.fillStyle = thresholdLabel;
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            ctx.fillText("2%", pad.left + 4, threshY - 3);

            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const pts = (histories[id] ?? [])
                    .filter((p) => p.ts >= tMin)
                    .sort((a, b) => a.ts - b.ts);
                if (pts.length === 0) continue;

                const color = CHART_COLORS[i % CHART_COLORS.length];
                const isSelected = id === selectedId;

                if (pts.length === 1) {
                    const only = pts[0];
                    const x = toX(only.ts);
                    const y = toY(only.profitPct);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = isSelected ? 2.4 : 1.6;
                    ctx.globalAlpha = isSelected ? 1 : 0.72;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = isSelected ? 10 : 5;
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    ctx.moveTo(Math.max(pad.left, x - 28), y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 1;
                    ctx.beginPath();
                    ctx.arc(x, y, isSelected ? 3.2 : 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    continue;
                }

                if (isSelected) {
                    let windowStart: number | null = null;
                    for (const pt of pts) {
                        if (pt.profitPct >= MIN_PROFIT_LINE) {
                            if (windowStart === null) windowStart = pt.ts;
                        } else {
                            if (windowStart !== null && pt.ts - windowStart >= 5000) {
                                ctx.fillStyle = isDark ? "rgba(12,228,174,0.08)" : "rgba(12,228,174,0.1)";
                                ctx.fillRect(toX(windowStart), pad.top, toX(pt.ts) - toX(windowStart), chartH);
                            }
                            windowStart = null;
                        }
                    }
                    if (windowStart !== null) {
                        const lastPt = pts[pts.length - 1];
                        if (lastPt.ts - windowStart >= 5000) {
                            ctx.fillStyle = isDark ? "rgba(12,228,174,0.08)" : "rgba(12,228,174,0.1)";
                            ctx.fillRect(toX(windowStart), pad.top, toX(lastPt.ts) - toX(windowStart), chartH);
                        }
                    }
                }

                ctx.strokeStyle = color;
                ctx.lineWidth = isSelected ? 2.4 : 1.6;
                ctx.globalAlpha = isSelected ? 1 : 0.72;
                ctx.shadowColor = color;
                ctx.shadowBlur = isSelected ? 10 : 5;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                for (let j = 0; j < pts.length; j++) {
                    const x = toX(pts[j].ts);
                    const y = toY(pts[j].profitPct);
                    if (j === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 1;

                const last = pts[pts.length - 1];
                const lx = toX(last.ts);
                const ly = toY(last.profitPct);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(lx, ly, isSelected ? 3 : 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = bgColor;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(lx, ly, isSelected ? 3 : 2.4, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle = axisTextColor;
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("TIME (LAST 5M)", pad.left + chartW / 2, h - 14);
            ctx.save();
            ctx.translate(14, pad.top + chartH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("PROFIT %", 0, 0);
            ctx.restore();

            ctx.font = "10px monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            const legendIds = ids.slice(0, 8);
            const legendBoxX = pad.left + 10;
            const legendTextX = legendBoxX + 10;
            const legendRowHeight = 14;
            const legendY = pad.top + 6;
            const maxLegendWidth = legendIds.reduce((maxWidth, id) => {
                const label = (labels[id] ?? id.slice(0, 20)).slice(0, 14);
                return Math.max(maxWidth, ctx.measureText(label).width);
            }, 0);
            if (legendIds.length > 0) {
                const legendWidth = 24 + maxLegendWidth;
                const legendHeight = legendIds.length * legendRowHeight + 8;
                ctx.fillStyle = legendBg;
                ctx.fillRect(legendBoxX - 6, legendY - 7, legendWidth, legendHeight);
                ctx.strokeStyle = legendBorder;
                ctx.lineWidth = 1;
                ctx.strokeRect(legendBoxX - 6, legendY - 7, legendWidth, legendHeight);
            }
            for (let i = 0; i < legendIds.length; i++) {
                const id = legendIds[i];
                const color = CHART_COLORS[i % CHART_COLORS.length];
                const label = labels[id] ?? id.slice(0, 20);
                const y = legendY + i * legendRowHeight;
                ctx.fillStyle = color;
                ctx.fillRect(legendBoxX, y - 5, 6, 6);
                ctx.fillStyle = legendTextColor;
                ctx.fillText(label.slice(0, 14), legendTextX, y - 1);
            }
        };

        draw();

        const resizeObserver = new ResizeObserver(() => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(draw);
        });

        if (canvasRef.current?.parentElement) {
            resizeObserver.observe(canvasRef.current.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [histories, ids, selectedId, labels, isDark]);

    const hasData = ids.some((id) => (histories[id] ?? []).length > 0);

    return (
        <div className={`relative w-full h-full min-h-[100px] ${isDark ? "bg-[#111622]" : "bg-[#f8fbff]"}`}>
            {!hasData && (
                <div className={`absolute inset-0 flex items-center justify-center text-[10px] ${isDark ? "text-[#64748b]" : "text-[#6b7f94]"}`}>
                    Select an opportunity to chart profit % over time
                </div>
            )}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full block"
            />
        </div>
    );
}
