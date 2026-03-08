"use client";

import React from "react";
import Image from "next/image";

export interface OnboardingStep {
    id: string;
    title: string;
    body: string;
    cardPlacement?:
        | "top-left"
        | "top-right"
        | "top-right-low"
        | "bottom-left"
        | "bottom-right"
        | "center"
        | "top-center"
        | "top-center-low"
        | "bottom-center"
        | "middle-right"
        | "middle-right-inset"
        | "middle-left"
        | "middle-center";
    cardSize?: "compact" | "regular";
}

function resolveMobilePlacement(stepId: string, fallback: OnboardingStep["cardPlacement"]): OnboardingStep["cardPlacement"] {
    if (stepId === "welcome") return "center";
    if (stepId === "topbar") return "top-center-low";
    if (stepId === "chain") return "top-center";
    if (stepId === "assistant") return "top-center";
    return fallback ?? "bottom-center";
}

interface OnboardingTourProps {
    isOpen: boolean;
    steps: OnboardingStep[];
    currentIndex: number;
    themeMode: "dark" | "light";
    nextDisabled?: boolean;
    nextHint?: string;
    onNext: () => void;
    onBack: () => void;
    onSkip: () => void;
    onFinish: () => void;
}

function renderBrandMentions(text: string, themeMode: "dark" | "light", keyPrefix: string): React.ReactNode[] {
    const brandClass = themeMode === "light" ? "font-bold text-[#c25b00]" : "font-bold text-[#ff9f3f]";
    return text.split(/(\bOpBit\b)/gi).map((part, index) => {
        if (part.toLowerCase() === "opbit") {
            return (
                <span key={`${keyPrefix}-brand-${index}`} className={brandClass}>
                    {part}
                </span>
            );
        }
        return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;
    });
}

function renderOnboardingBody(text: string, themeMode: "dark" | "light"): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
                <strong key={`bold-${index}`} className={themeMode === "light" ? "text-[#0f172a]" : "text-[#e8f4ff]"}>
                    {renderBrandMentions(part.slice(2, -2), themeMode, `bold-${index}`)}
                </strong>
            );
        }
        return (
            <React.Fragment key={`text-${index}`}>
                {renderBrandMentions(part, themeMode, `plain-${index}`)}
            </React.Fragment>
        );
    });
}

export function OnboardingTour({
    isOpen,
    steps,
    currentIndex,
    themeMode,
    nextDisabled = false,
    nextHint,
    onNext,
    onBack,
    onSkip,
    onFinish,
}: OnboardingTourProps) {
    const [isMobileViewport, setIsMobileViewport] = React.useState<boolean>(
        typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false
    );
    React.useEffect(() => {
        if (typeof window === "undefined") return;
        const media = window.matchMedia("(max-width: 1023px)");
        const onChange = () => setIsMobileViewport(media.matches);
        onChange();
        if (typeof media.addEventListener === "function") {
            media.addEventListener("change", onChange);
            return () => media.removeEventListener("change", onChange);
        }
        media.addListener(onChange);
        return () => media.removeListener(onChange);
    }, []);
    if (!isOpen || steps.length === 0) return null;

    const current = steps[currentIndex] ?? steps[0];
    const isFirst = currentIndex === 0;
    const isLast = currentIndex >= steps.length - 1;
    const placement = isMobileViewport
        ? resolveMobilePlacement(current.id, current.cardPlacement)
        : current.cardPlacement ?? "bottom-left";
    const size = isMobileViewport ? "compact" : current.cardSize ?? "regular";
    const cardPlacementClass =
        placement === "center" || placement === "middle-center"
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            : placement === "top-center"
                ? "top-4 left-1/2 -translate-x-1/2"
                : placement === "top-center-low"
                    ? "top-[calc(env(safe-area-inset-top)+7rem)] left-1/2 -translate-x-1/2"
                : placement === "bottom-center"
                    ? "bottom-[max(28px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2"
                : placement === "middle-right"
                    ? "top-1/2 right-4 -translate-y-1/2"
                    : placement === "middle-right-inset"
                        ? "top-1/2 right-16 -translate-y-1/2"
                    : placement === "middle-left"
                        ? "top-1/2 left-4 -translate-y-1/2"
                : placement === "top-left"
                    ? "top-4 left-4"
                    : placement === "top-right"
                        ? "top-4 right-4"
                        : placement === "top-right-low"
                            ? "top-12 right-4"
                        : placement === "bottom-right"
                            ? "bottom-4 right-4"
                            : "bottom-4 left-4";
    const cardSizeClass = size === "compact" ? "w-[min(92vw,420px)]" : "w-[min(86vw,360px)]";
    const bodyTextClass = size === "compact" ? "text-[10px] leading-relaxed" : "text-[12px] leading-relaxed";
    const cardAnimation = isFirst
        ? "opbit-onboarding-enter 420ms cubic-bezier(0.22,1,0.36,1) both, opbit-onboarding-float 4.2s ease-in-out 450ms infinite"
        : "opbit-onboarding-enter 260ms cubic-bezier(0.22,1,0.36,1) both";
    const strategyFocusStep = current.id === "strategy";

    return (
        <>
            <div className="fixed inset-0 z-[96] pointer-events-none">
                <div
                    className={`absolute inset-0 ${
                        themeMode === "light"
                            ? strategyFocusStep
                                ? "bg-[rgba(18,41,71,0.56)]"
                                : "bg-[rgba(18,41,71,0.44)]"
                            : strategyFocusStep
                                ? "bg-[rgba(2,7,14,0.74)]"
                                : "bg-[rgba(2,7,14,0.66)]"
                    }`}
                />
            </div>
            <aside
                key={current.id}
                style={{ animation: cardAnimation }}
                className={`pointer-events-auto fixed z-[110] ${cardPlacementClass} ${cardSizeClass} rounded-sm border px-4 py-3 max-h-[min(62dvh,520px)] overflow-y-auto ${
                    themeMode === "light"
                        ? "border-[#7ea8cf] bg-[#f4f8ff]/96 text-[#0f172a] shadow-[0_10px_40px_rgba(76,127,179,0.28)]"
                        : "border-[#2b4f7c] bg-[#071428]/94 text-[#d6e7f7] shadow-[0_10px_40px_rgba(28,88,153,0.36)]"
                }`}
            >
                <div className={`text-[10px] font-mono uppercase tracking-[0.14em] ${themeMode === "light" ? "text-[#1f67ad]" : "text-[#6bb8ff]"}`}>
                    First-Time Walkthrough
                </div>
                <div className="mt-1 text-[15px] font-semibold leading-tight">
                    {renderBrandMentions(current.title, themeMode, "title")}
                </div>
                {current.id === "welcome" && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5">
                        <Image
                            src="/opbit_icon_transparent.png"
                            alt="OpBit logo"
                            width={20}
                            height={16}
                            className="no-theme-invert h-4 w-auto"
                            suppressHydrationWarning
                        />
                        <span className={`text-[10px] font-mono font-bold ${themeMode === "light" ? "text-[#c25b00]" : "text-[#ff9f3f]"}`}>
                            OpBit
                        </span>
                    </div>
                )}
                <div className={`mt-1.5 ${bodyTextClass} ${themeMode === "light" ? "text-[#1e293b]" : "text-[#b8cae0]"}`}>
                    {renderOnboardingBody(current.body, themeMode)}
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                    {steps.map((step, idx) => (
                        <span
                            key={step.id}
                            className={`h-1.5 rounded-full transition-all ${
                                idx === currentIndex
                                    ? themeMode === "light"
                                        ? "w-5 bg-[#1f67ad]"
                                        : "w-5 bg-[#47b5ff]"
                                    : themeMode === "light"
                                        ? "w-2.5 bg-[#93b8dc]"
                                        : "w-2.5 bg-[#2d4e72]"
                            }`}
                        />
                    ))}
                    <span className={`ml-1 text-[10px] font-mono ${themeMode === "light" ? "text-[#406486]" : "text-[#6d8fb3]"}`}>
                        {currentIndex + 1}/{steps.length}
                    </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={onSkip}
                        className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono ${
                            themeMode === "light"
                                ? "border-[#7ea8cf] bg-[#eef5ff] text-[#1f67ad] hover:border-[#3f7fbe]"
                                : "border-[#2b4f7c] bg-[#0a1728] text-[#9dd4ff] hover:border-[#47b5ff] hover:text-white"
                        }`}
                    >
                        Skip Tour
                    </button>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={onBack}
                            disabled={isFirst}
                            className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono disabled:opacity-40 ${
                                themeMode === "light"
                                    ? "border-[#7ea8cf] bg-[#eef5ff] text-[#1f67ad] hover:border-[#3f7fbe]"
                                    : "border-[#2b4f7c] bg-[#0a1728] text-[#9dd4ff] hover:border-[#47b5ff] hover:text-white"
                            }`}
                        >
                            Back
                        </button>
                        {isLast ? (
                            <button
                                type="button"
                                onClick={onFinish}
                                className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono ${
                                    themeMode === "light"
                                        ? "border-[#3f7fbe] bg-[#dbeafe] text-[#124d85]"
                                        : "border-[#2f6ea9] bg-[#10355f] text-[#cde8ff]"
                                }`}
                            >
                                Finish
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onNext}
                                disabled={nextDisabled}
                                className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono disabled:opacity-45 disabled:cursor-not-allowed ${
                                    themeMode === "light"
                                        ? "border-[#3f7fbe] bg-[#dbeafe] text-[#124d85]"
                                        : "border-[#2f6ea9] bg-[#10355f] text-[#cde8ff]"
                                }`}
                            >
                                Next
                            </button>
                        )}
                    </div>
                </div>
                {!isLast && nextDisabled && nextHint && (
                    <div className={`mt-2 text-[10px] font-mono ${themeMode === "light" ? "text-[#b45309]" : "text-[#f5be6f]"}`}>
                        {nextHint}
                    </div>
                )}
            </aside>
        </>
    );
}
