"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AssistantUiContext } from "@/src/assistant/buildContext";
import { AssistantAction, AssistantJson } from "@/src/assistant/validateAssistantJson";
import { AssistantActionButtons } from "./AssistantActionButtons";

type FocusTarget = "TOPBAR" | "CHAIN" | "ANALYSIS" | "STRATEGY" | "ASSISTANT" | null;

interface AssistantPanelProps {
    isOpen: boolean;
    onClose: () => void;
    uiContext: AssistantUiContext;
    onRunAction: (
        action: AssistantAction
    ) =>
        | boolean
        | { ok: boolean; focusTarget?: FocusTarget }
        | Promise<boolean | { ok: boolean; focusTarget?: FocusTarget }>;
    onMinimizeRequest?: (focusTarget?: FocusTarget) => void;
    themeMode: "dark" | "light";
}

interface TranscriptMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    actions: AssistantAction[];
    warnings: string[];
}

const QUICK_CHIPS = ["/help", "/onboard", "/strategy"];
const ASSISTANT_ACTION_HINT_SEEN_KEY_PREFIX = "opbit_assistant_action_hint_seen_v3";

function renderInlineMarkdown(line: string, themeMode: "dark" | "light"): React.ReactNode[] {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
                <strong key={`bold-${index}`} className={`font-bold ${themeMode === "light" ? "text-[#0f172a]" : "text-[#e8f4ff]"}`}>
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith("__") && part.endsWith("__") && part.length > 4) {
            return (
                <strong key={`bold-underscore-${index}`} className={`font-bold ${themeMode === "light" ? "text-[#0f172a]" : "text-[#e8f4ff]"}`}>
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
            return (
                <em key={`italic-${index}`} className={`italic ${themeMode === "light" ? "text-[#1e293b]" : "text-[#d9e8f7]"}`}>
                    {part.slice(1, -1)}
                </em>
            );
        }
        if (part.startsWith("_") && part.endsWith("_") && part.length > 2 && !part.startsWith("__")) {
            return (
                <em key={`italic-underscore-${index}`} className={`italic ${themeMode === "light" ? "text-[#1e293b]" : "text-[#d9e8f7]"}`}>
                    {part.slice(1, -1)}
                </em>
            );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
            return (
                <code
                    key={`code-${index}`}
                    className={`rounded px-1 py-[1px] font-mono text-[11px] ${themeMode === "light"
                        ? "bg-[#dbeafe] text-[#1e3a5f]"
                        : "bg-[#12243b] text-[#9fd6ff]"
                        }`}
                >
                    {part.slice(1, -1)}
                </code>
            );
        }
        return <React.Fragment key={`txt-${index}`}>{part}</React.Fragment>;
    });
}

function renderMessageMarkdown(text: string, themeMode: "dark" | "light"): React.ReactNode {
    const lines = text.split("\n");
    return (
        <div className="space-y-1.5">
            {lines.map((line, index) => (
                <div key={`line-${index}`} className="whitespace-pre-wrap">
                    {renderInlineMarkdown(line, themeMode)}
                </div>
            ))}
        </div>
    );
}

function makeId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toApiMessages(messages: TranscriptMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
    return messages.map((message) => ({
        role: message.role,
        content: message.text,
    }));
}

export function AssistantPanel({
    isOpen,
    onClose,
    uiContext,
    onRunAction,
    onMinimizeRequest,
    themeMode,
}: AssistantPanelProps) {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showInitialActionHint, setShowInitialActionHint] = useState(false);
    const [messages, setMessages] = useState<TranscriptMessage[]>(() => [
        {
            id: makeId("assistant"),
            role: "assistant",
            text: "OpBit Assistant ready. Use /onboard for guided setup or /strategy for educational strategy help.",
            actions: [
                { type: "openPanel", value: "CHAIN" },
                { type: "openPanel", value: "SMILE" },
                { type: "openPanel", value: "TERM" },
                { type: "openPanel", value: "VOL" },
                { type: "openPanel", value: "FAIR" },
                { type: "openPanel", value: "STRATEGY" },
                { type: "openPanel", value: "ARBITRAGE" },
            ],
            warnings: ["Educational only. Not investment advice."],
        },
    ]);

    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const firstOpenHintHandledRef = useRef(false);

    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || firstOpenHintHandledRef.current) return;

        const isMobileViewport = window.matchMedia("(max-width: 1023px)").matches;
        const seenKey = `${ASSISTANT_ACTION_HINT_SEEN_KEY_PREFIX}_${isMobileViewport ? "mobile" : "desktop"}`;
        let shouldAnimate = true;
        try {
            shouldAnimate = window.localStorage.getItem(seenKey) !== "1";
            window.localStorage.setItem(seenKey, "1");
        } catch {
            // Ignore storage issues; still animate once per mount.
        }

        firstOpenHintHandledRef.current = true;
        if (!shouldAnimate) return;

        const startTimer = window.setTimeout(() => setShowInitialActionHint(true), 180);
        const stopTimer = window.setTimeout(() => setShowInitialActionHint(false), 2700);
        return () => {
            window.clearTimeout(startTimer);
            window.clearTimeout(stopTimer);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) return;
        setShowInitialActionHint(false);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = window.requestAnimationFrame(() => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            scroller.scrollTop = scroller.scrollHeight;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const scroller = scrollerRef.current;
        if (!scroller) return;
        scroller.scrollTop = scroller.scrollHeight;
    }, [isOpen, messages, loading]);

    const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

    async function sendMessage(text: string) {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        const userMessage: TranscriptMessage = {
            id: makeId("user"),
            role: "user",
            text: trimmed,
            actions: [],
            warnings: [],
        };

        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: toApiMessages(nextMessages),
                    uiContext,
                }),
            });

            const data = (await res.json()) as AssistantJson;

            const assistantMessage: TranscriptMessage = {
                id: makeId("assistant"),
                role: "assistant",
                text: data.reply ?? "No response.",
                actions: Array.isArray(data.actions) ? data.actions : [],
                warnings: Array.isArray(data.warnings) ? data.warnings : [],
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: makeId("assistant"),
                    role: "assistant",
                    text: "Assistant request failed. Please retry.",
                    actions: [],
                    warnings: ["Network/server error."],
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canSend) return;
        await sendMessage(input);
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex justify-end">
            <div
                className={`absolute inset-0 z-[1] ${themeMode === "light"
                        ? "bg-[radial-gradient(circle_at_18%_18%,rgba(120,179,238,0.25),rgba(238,245,255,0.86)_42%)]"
                        : "bg-[radial-gradient(circle_at_18%_18%,rgba(70,165,255,0.32),rgba(6,10,18,0.86)_42%)]"
                    }`}
                onClick={onClose}
            />

            <aside className={`relative z-[2] h-full w-full max-w-[440px] border-l backdrop-blur-md pointer-events-auto ${themeMode === "light"
                    ? "border-[#7ea8cf] bg-[#f4f8ff]/96 shadow-[0_0_40px_rgba(97,145,194,0.28)]"
                    : "border-[#2f5f91] bg-[#060d18]/95 shadow-[0_0_55px_rgba(53,138,225,0.32)]"
                }`}>
                <div className={`pointer-events-none absolute inset-0 ${themeMode === "light"
                        ? "bg-[linear-gradient(120deg,rgba(96,149,207,0.10)_0%,transparent_32%,rgba(72,167,124,0.04)_100%)]"
                        : "bg-[linear-gradient(120deg,rgba(56,130,206,0.12)_0%,transparent_32%,rgba(74,222,128,0.06)_100%)]"
                    }`} />
                <div className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(130,200,255,0.08)_1px,transparent_1px)] bg-[length:100%_3px] ${themeMode === "light" ? "opacity-10" : "opacity-20"
                    }`} />

                <header className={`relative z-[3] border-b px-4 py-3 ${themeMode === "light" ? "border-[#8eb2d4]" : "border-[#24476f]"}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className={`text-[12px] uppercase tracking-[0.22em] ${themeMode === "light" ? "text-[#1f67ad]" : "text-[#6bb8ff] drop-shadow-[0_0_8px_rgba(107,184,255,0.7)]"}`}>OpBit AI</div>
                            <div className={`text-[11px] font-mono ${themeMode === "light" ? "text-[#0f172a]" : "text-[#8aa9c7]"}`}>Neural Terminal Assistant</div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className={`rounded-sm border px-2 py-1 text-[11px] font-mono ${themeMode === "light"
                                    ? "border-[#7ea8cf] bg-[#e9f3ff] text-[#1f67ad] hover:border-[#3f7fbe] hover:text-[#124d85]"
                                    : "border-[#2b4f7c] bg-[#091427] text-[#8ebee6] hover:border-[#47b5ff] hover:text-white"
                                }`}
                        >
                            Close
                        </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {QUICK_CHIPS.map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => void sendMessage(chip)}
                                className={`rounded-sm border px-2 py-1 text-[11px] font-mono ${themeMode === "light"
                                        ? "border-[#7ea8cf] bg-[#e9f3ff] text-[#1f67ad] shadow-[0_0_8px_rgba(97,145,194,0.2)] hover:border-[#3f7fbe] hover:text-[#124d85]"
                                        : "border-[#2b4f7c] bg-[#0c1b31] text-[#9fd6ff] shadow-[0_0_10px_rgba(71,181,255,0.14)] hover:border-[#47b5ff]"
                                    }`}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                </header>

                <div
                    ref={scrollerRef}
                    className="relative z-[3] h-[calc(100%-145px)] overflow-y-auto px-3 py-3"
                >
                    <div className="space-y-3">
                        {messages.map((message) => (
                            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div
                                    className={`mx-1 max-w-[92%] rounded-sm border px-2.5 py-2 text-[12px] leading-relaxed ${message.role === "user"
                                            ? themeMode === "light"
                                                ? "border-[#6f9fca] bg-[#dbeafe] text-[#0f172a] shadow-[0_0_10px_rgba(97,145,194,0.16)]"
                                                : "border-[#2f6ea9] bg-[#123158] text-[#e6f4ff] shadow-[0_0_12px_rgba(47,110,169,0.2)]"
                                            : themeMode === "light"
                                                ? "relative overflow-visible border-[#6f9fca] bg-[#eef4ff] text-[#0f172a] shadow-[0_0_10px_rgba(97,145,194,0.16)]"
                                                : "relative overflow-visible border-[#24476f] bg-[#0a1628] text-[#c7d9ec] shadow-[0_0_14px_rgba(22,75,128,0.18)]"
                                        }`}
                                >
                                    {message.role === "assistant" && (
                                        <Image
                                            src="/ai-chat-icon.svg"
                                            alt="AI assistant icon"
                                            width={24}
                                            height={24}
                                            className="absolute -left-3 -top-3 h-6 w-6"
                                        />
                                    )}
                                    {message.role === "assistant" && (
                                        <div className={`mb-1.5 text-[10px] uppercase tracking-[0.12em] ${themeMode === "light" ? "text-[#1f67ad]" : "text-[#86c8ff]"}`}>
                                            <span>OpBit AI</span>
                                        </div>
                                    )}
                                    {renderMessageMarkdown(message.text, themeMode)}

                                    {message.role === "assistant" && message.actions.length > 0 && (
                                        <AssistantActionButtons
                                            actions={message.actions}
                                            onRunAction={onRunAction}
                                            themeMode={themeMode}
                                            attentionPulse={showInitialActionHint && message.id === messages[0]?.id}
                                            onActionExecuted={(result) => {
                                                if (result.ok) {
                                                    onMinimizeRequest?.(result.focusTarget ?? null);
                                                }
                                            }}
                                        />
                                    )}

                                    {message.warnings.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {message.warnings.map((warning, index) => (
                                                <div key={`${message.id}-warn-${index}`} className={`text-[10px] ${themeMode === "light" ? "text-[#b45309]" : "text-[#f5be6f]"}`}>
                                                    Warning: {warning}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className={`rounded-sm border px-2.5 py-2 text-[11px] font-mono min-w-[140px] ${themeMode === "light"
                                        ? "border-[#6f9fca] bg-[#eef4ff] text-[#1f4f80]"
                                        : "border-[#24476f] bg-[#0a1628] text-[#7fa5ca]"
                                    }`}>
                                    <div className="flex items-center gap-2">
                                        <Image
                                            src="/ai-chat-icon.svg"
                                            alt="AI assistant icon"
                                            width={20}
                                            height={20}
                                            className="h-5 w-5"
                                        />
                                        <div className="flex items-center gap-1">
                                            <span className={`h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s] ${themeMode === "light" ? "bg-[#1f67ad]" : "bg-[#6bb8ff]"}`} />
                                            <span className={`h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s] ${themeMode === "light" ? "bg-[#1f67ad]" : "bg-[#6bb8ff]"}`} />
                                            <span className={`h-1.5 w-1.5 rounded-full animate-bounce ${themeMode === "light" ? "bg-[#1f67ad]" : "bg-[#6bb8ff]"}`} />
                                        </div>
                                        <span className={`tracking-[0.08em] ${themeMode === "light" ? "text-[#0f172a]" : "text-[#9ec9ef]"}`}>Thinking</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-1">
                                        <span className={`h-[2px] w-8 rounded animate-pulse ${themeMode === "light" ? "bg-[#3f7fbe]" : "bg-[#285173]"}`} />
                                        <span className={`h-[2px] w-8 rounded animate-pulse [animation-delay:120ms] ${themeMode === "light" ? "bg-[#1f67ad]" : "bg-[#2f6ea9]"}`} />
                                        <span className={`h-[2px] w-8 rounded animate-pulse [animation-delay:240ms] ${themeMode === "light" ? "bg-[#3f7fbe]" : "bg-[#285173]"}`} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className={`relative z-[3] border-t px-3 py-3 ${themeMode === "light" ? "border-[#8eb2d4]" : "border-[#24476f]"}`}>
                    <div className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${themeMode === "light" ? "border-[#7ea8cf] bg-[#eef5ff]" : "border-[#2b4f7c] bg-[#091427]"
                        }`}>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder="Ask about OpBit, IV, Greeks, or /strategy..."
                            className={`w-full bg-transparent text-[12px] outline-none ${themeMode === "light" ? "text-[#0f172a] placeholder:text-[#1f67ad]" : "text-[#d6e7f7] placeholder:text-[#53708c]"
                                }`}
                        />
                        <button
                            type="submit"
                            disabled={!canSend}
                            className={`rounded-sm border px-2 py-1 text-[11px] font-mono disabled:opacity-50 ${themeMode === "light"
                                    ? "border-[#3f7fbe] bg-[#dbeafe] text-[#124d85]"
                                    : "border-[#2f6ea9] bg-[#10355f] text-[#cde8ff]"
                                }`}
                        >
                            Send
                        </button>
                    </div>
                </form>
            </aside>
        </div>
    );
}
