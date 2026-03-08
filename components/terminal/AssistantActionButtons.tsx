"use client";

import React, { useMemo, useState } from "react";
import { AssistantAction } from "@/src/assistant/validateAssistantJson";

type FocusTarget = "TOPBAR" | "CHAIN" | "ANALYSIS" | "STRATEGY" | "ASSISTANT" | null;

interface AssistantActionButtonsProps {
    actions: AssistantAction[];
    onRunAction: (
        action: AssistantAction
    ) =>
        | boolean
        | { ok: boolean; focusTarget?: FocusTarget }
        | Promise<boolean | { ok: boolean; focusTarget?: FocusTarget }>;
    onActionExecuted?: (result: { ok: boolean; focusTarget?: FocusTarget }) => void;
    themeMode: "dark" | "light";
}

interface CustomStrategyAction {
    type: "__addCustomStrategy";
    legs: AssistantAction[];
}

interface SequencedApplyAction {
    type: "__applySequencedActions";
    steps: AssistantAction[];
}

type RenderAction = AssistantAction | CustomStrategyAction | SequencedApplyAction;

function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value == null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function parseExecutionIntent(value: unknown): "BUY" | "SELL" | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === "BUY" || normalized === "SELL") return normalized;
    return null;
}

function parseOptionRight(value: unknown): "Call" | "Put" | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === "C" || normalized === "CALL") return "Call";
    if (normalized === "P" || normalized === "PUT") return "Put";
    return null;
}

function parseNumeric(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function stableValueKey(value: unknown): string {
    if (value == null) return "null";
    if (typeof value === "string") return `str:${value}`;
    if (typeof value === "number") return `num:${value}`;
    if (typeof value === "boolean") return `bool:${value}`;
    if (Array.isArray(value)) return `arr:[${value.map((item) => stableValueKey(item)).join(",")}]`;
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
        return `obj:{${entries.map(([k, v]) => `${k}:${stableValueKey(v)}`).join(",")}}`;
    }
    return `other:${String(value)}`;
}

function actionKey(action: AssistantAction): string {
    return `${action.type}|${stableValueKey(action.value)}`;
}

function normalizeActionResult(raw: boolean | { ok: boolean; focusTarget?: FocusTarget }): { ok: boolean; focusTarget: FocusTarget } {
    if (typeof raw === "boolean") {
        return { ok: raw, focusTarget: null };
    }
    return { ok: Boolean(raw?.ok), focusTarget: raw?.focusTarget ?? null };
}

function isSequencedUiAction(action: AssistantAction): boolean {
    switch (action.type) {
        case "setUnderlying":
        case "setExpiry":
        case "setExecutionSide":
        case "jumpToStrike":
        case "highlightContract":
        case "openStrategyPreset":
        case "addLegToStrategy":
        case "openPanel":
            return true;
        default:
            return false;
    }
}

function shouldOfferSequencedApply(actions: AssistantAction[]): boolean {
    return actions.some((action) => {
        switch (action.type) {
            case "setUnderlying":
            case "setExpiry":
            case "setExecutionSide":
            case "jumpToStrike":
            case "highlightContract":
            case "openStrategyPreset":
            case "addLegToStrategy":
                return true;
            default:
                return false;
        }
    });
}

function actionExecutionPriority(action: AssistantAction): number {
    switch (action.type) {
        case "setUnderlying":
            return 10;
        case "setExpiry":
            return 20;
        case "setExecutionSide":
            return 30;
        case "jumpToStrike":
            return 40;
        case "highlightContract":
            return 50;
        case "openStrategyPreset":
            return 55;
        case "addLegToStrategy":
            return 56;
        case "openPanel":
            return 60;
        default:
            return 100;
    }
}

function sortActionsForExecution(actions: AssistantAction[]): AssistantAction[] {
    return actions
        .map((action, index) => ({ action, index }))
        .sort((a, b) => {
            const pa = actionExecutionPriority(a.action);
            const pb = actionExecutionPriority(b.action);
            if (pa !== pb) return pa - pb;
            return a.index - b.index;
        })
        .map(({ action }) => action);
}

function buildSequencedSteps(actions: AssistantAction[]): AssistantAction[] {
    const sequenced = sortActionsForExecution(actions.filter((action) => isSequencedUiAction(action)));
    const hasHighlight = sequenced.some((action) => action.type === "highlightContract");
    if (hasHighlight) return sequenced;

    const jump = sequenced.find((action) => action.type === "jumpToStrike");
    if (!jump) return sequenced;

    const jumpStrike = parseNumeric(jump.value);
    if (jumpStrike == null) return sequenced;

    return [
        ...sequenced,
        { type: "highlightContract", value: { strike: jumpStrike } },
    ];
}

function withReplaceExistingFlag(action: AssistantAction, replaceExisting: boolean): AssistantAction {
    if (action.type !== "addLegToStrategy") return action;
    const payload = asRecord(action.value);
    if (!payload) return action;
    return {
        ...action,
        value: {
            ...payload,
            replaceExisting,
        },
    };
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

interface StepRetryPlan {
    attempts: number;
    firstRetryDelayMs: number;
    retryDelayGrowthMs: number;
    maxRetryDelayMs: number;
    settleDelayMs: number;
    maxElapsedMs: number;
}

function retryPlanForStep(action: AssistantAction): StepRetryPlan {
    switch (action.type) {
        case "setUnderlying":
            return {
                attempts: 1,
                firstRetryDelayMs: 0,
                retryDelayGrowthMs: 0,
                maxRetryDelayMs: 0,
                settleDelayMs: 220,
                maxElapsedMs: 400,
            };
        case "setExpiry":
            return {
                attempts: 8,
                firstRetryDelayMs: 120,
                retryDelayGrowthMs: 60,
                maxRetryDelayMs: 360,
                settleDelayMs: 120,
                maxElapsedMs: 2600,
            };
        case "jumpToStrike":
        case "highlightContract":
            return {
                attempts: 8,
                firstRetryDelayMs: 100,
                retryDelayGrowthMs: 50,
                maxRetryDelayMs: 250,
                settleDelayMs: 0,
                maxElapsedMs: 2200,
            };
        default:
            return {
                attempts: 1,
                firstRetryDelayMs: 0,
                retryDelayGrowthMs: 0,
                maxRetryDelayMs: 0,
                settleDelayMs: 0,
                maxElapsedMs: 300,
            };
    }
}

function formatPresetLabel(raw: string): string {
    const normalized = raw.trim().toUpperCase();
    const known: Record<string, string> = {
        LONG_CALL: "Long Call",
        LONG_PUT: "Long Put",
        STRADDLE: "Straddle",
        STRANGLE: "Strangle",
        BULL_CALL_SPREAD: "Bull Call Spread",
        BEAR_CALL_SPREAD: "Bear Call Spread",
        BULL_PUT_SPREAD: "Bull Put Spread",
        BEAR_PUT_SPREAD: "Bear Put Spread",
        IRON_CONDOR: "Iron Condor",
        COVERED_CALL: "Covered Call",
        BEARCALLSPREAD: "Bear Call Spread",
        BULLPUTSPREAD: "Bull Put Spread",
    };
    if (known[normalized]) return known[normalized];
    return raw
        .replace(/[_-]+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function actionLabel(action: RenderAction): string {
    if (action.type === "__addCustomStrategy") {
        return "Add Custom Strategy";
    }
    if (action.type === "__applySequencedActions") {
        return `Apply ${action.steps.length} Steps`;
    }

    switch (action.type) {
        case "setUnderlying":
            return `Set Underlying: ${String(action.value)}`;
        case "setExpiry":
            return `Set Expiry: ${String(action.value)}`;
        case "jumpToStrike":
            return `Jump To Strike ${String(action.value)}`;
        case "highlightContract":
            return "Highlight Contract";
        case "openPanel":
            return String(action.value).toUpperCase() === "ARBITRAGE"
                ? "Open Arbitrage Scanner"
                : `Open ${String(action.value)} Panel`;
        case "openStrategyPreset": {
            const payload = asRecord(action.value);
            const preset = payload && typeof payload.preset === "string" ? payload.preset : null;
            return preset ? `Add ${formatPresetLabel(preset)} To Legs` : "Add Strategy To Legs";
        }
        case "addLegToStrategy": {
            const payload = asRecord(action.value);
            if (!payload) return "Add Leg To Strategy";
            const side = parseExecutionIntent(payload.side);
            const right =
                parseOptionRight(payload.right) ??
                parseOptionRight(payload.optionType) ??
                parseOptionRight(payload.contractType) ??
                parseOptionRight(payload.side);
            const strike = parseNumeric(payload.strike);
            const parts = [side, right, strike != null ? `@ ${strike.toLocaleString()}` : null].filter(
                (part): part is string => Boolean(part)
            );
            return parts.length > 0 ? `Add ${parts.join(" ")} Leg` : "Add Leg To Strategy";
        }
        case "setExecutionSide":
            return `Set Execution: ${String(action.value)}`;
        default:
            return "Run Action";
    }
}

export function AssistantActionButtons({ actions, onRunAction, onActionExecuted, themeMode }: AssistantActionButtonsProps) {
    const [runningIndex, setRunningIndex] = useState<number | null>(null);
    const [lastResult, setLastResult] = useState<null | { index: number; ok: boolean }>(null);
    const uniqueActions = useMemo(() => {
        const seen = new Set<string>();
        return actions.filter((action) => {
            const key = actionKey(action);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [actions]);

    const renderActions = useMemo<RenderAction[]>(() => {
        if (uniqueActions.length === 0) return [];
        const hasPreset = uniqueActions.some((action) => action.type === "openStrategyPreset");
        const legActions = uniqueActions.filter((action) => action.type === "addLegToStrategy");
        const baseActions: RenderAction[] =
            hasPreset || legActions.length < 2
                ? uniqueActions
                : [
                    ...uniqueActions.filter((action) => action.type !== "addLegToStrategy"),
                    { type: "__addCustomStrategy", legs: legActions },
                ];

        if (!shouldOfferSequencedApply(uniqueActions)) {
            return baseActions;
        }
        const sequenced = buildSequencedSteps(uniqueActions);
        if (sequenced.length < 2) return baseActions;
        return [{ type: "__applySequencedActions", steps: sequenced }, ...baseActions];
    }, [uniqueActions]);

    if (renderActions.length === 0) return null;

    return (
        <div className="mt-2 flex flex-wrap gap-1.5 pointer-events-auto">
            {renderActions.map((action, index) => (
                <button
                    key={`${action.type}-${index}-${action.type === "__addCustomStrategy"
                        ? action.legs.length
                        : action.type === "__applySequencedActions"
                            ? action.steps.length
                            : "single"
                        }`}
                    type="button"
                    onClick={async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setRunningIndex(index);
                        try {
                            let result: { ok: boolean; focusTarget: FocusTarget } = { ok: true, focusTarget: null };
                            if (action.type === "__addCustomStrategy") {
                                let hasReplaced = false;
                                for (const leg of action.legs) {
                                    const nextLeg = withReplaceExistingFlag(leg, !hasReplaced);
                                    const legResult = normalizeActionResult(await onRunAction(nextLeg));
                                    if (legResult.focusTarget) {
                                        result.focusTarget = legResult.focusTarget;
                                    }
                                    if (!legResult.ok) {
                                        result = { ok: false, focusTarget: result.focusTarget };
                                        break;
                                    }
                                    hasReplaced = true;
                                }
                            } else if (action.type === "__applySequencedActions") {
                                let hasReplacedInSequence = false;
                                for (const step of action.steps) {
                                    const retryPlan = retryPlanForStep(step);
                                    const stepStartMs = Date.now();

                                    let stepOk = false;
                                    for (let attempt = 0; attempt < retryPlan.attempts; attempt += 1) {
                                        const preparedStep =
                                            step.type === "addLegToStrategy"
                                                ? withReplaceExistingFlag(step, !hasReplacedInSequence)
                                                : step;
                                        const stepResult = normalizeActionResult(await onRunAction(preparedStep));
                                        if (stepResult.focusTarget) {
                                            result.focusTarget = stepResult.focusTarget;
                                        }
                                        if (stepResult.ok) {
                                            if (step.type === "addLegToStrategy") {
                                                hasReplacedInSequence = true;
                                            }
                                            stepOk = true;
                                            break;
                                        }
                                        if (attempt < retryPlan.attempts - 1) {
                                            const nextDelay = Math.min(
                                                retryPlan.maxRetryDelayMs,
                                                retryPlan.firstRetryDelayMs + attempt * retryPlan.retryDelayGrowthMs
                                            );
                                            if (nextDelay > 0 && Date.now() - stepStartMs + nextDelay <= retryPlan.maxElapsedMs) {
                                                await wait(nextDelay);
                                            } else {
                                                break;
                                            }
                                        }
                                    }

                                    if (!stepOk) {
                                        result = { ok: false, focusTarget: result.focusTarget };
                                        break;
                                    }

                                    if (retryPlan.settleDelayMs > 0) {
                                        await wait(retryPlan.settleDelayMs);
                                    }
                                }
                            } else {
                                const preparedAction =
                                    action.type === "addLegToStrategy"
                                        ? withReplaceExistingFlag(action, true)
                                        : action;
                                result = normalizeActionResult(await onRunAction(preparedAction));
                            }
                            setLastResult({ index, ok: result.ok });
                            onActionExecuted?.(result);
                            setTimeout(() => {
                                setLastResult((prev) => (prev?.index === index ? null : prev));
                            }, 1800);
                        } finally {
                            setRunningIndex(null);
                        }
                    }}
                    className={`group relative overflow-hidden rounded-sm border px-2 py-1 text-[10px] font-mono transition-all cursor-pointer disabled:cursor-wait ${
                        themeMode === "light"
                            ? "border-[#78a6d1] bg-[#e8f2ff] text-[#1f4f80] shadow-[0_0_8px_rgba(63,118,177,0.18)] hover:border-[#3f7fbe] hover:text-[#163e68]"
                            : "border-[#2b4f7c] bg-[#0a1728] text-[#9dd4ff] shadow-[0_0_10px_rgba(56,130,206,0.18)] hover:border-[#47b5ff] hover:text-white"
                    }`}
                    aria-label={actionLabel(action)}
                    disabled={runningIndex === index}
                >
                    <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,181,255,0.25),_transparent_55%)] opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="relative">
                        {runningIndex === index ? "Running..." : actionLabel(action)}
                    </span>
                </button>
            ))}
            {lastResult && runningIndex == null && (
                <div className={`self-center text-[9px] font-mono ${
                    lastResult.ok
                        ? "text-[#00a765]"
                        : themeMode === "light"
                            ? "text-[#b45309]"
                            : "text-[#f5be6f]"
                }`}>
                    {lastResult.ok ? "Action executed." : "Action unavailable."}
                </div>
            )}
        </div>
    );
}
