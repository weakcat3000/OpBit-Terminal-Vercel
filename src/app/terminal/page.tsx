"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { ALL_VENUES, Venue } from "@/src/core/types/venues";
import { VenueStatus, NormalizedOption } from "@/src/core/types/options";
import { CompareRow } from "@/src/services/optionsService";
import { TopBar } from "@/components/terminal/TopBar";
import { OptionsChainGrid } from "@/components/terminal/OptionsChainGrid";
import { ContractInspector } from "@/components/terminal/ContractInspector";
import { LiveNewsPanel } from "@/components/terminal/LiveNewsPanel";
import { LoadingSkeleton } from "@/components/terminal/LoadingSkeleton";
import { ErrorToast } from "@/components/terminal/ErrorToast";
import { CryptoTickerBar } from "@/components/terminal/CryptoTickerBar";
import { BtcMiniChart, EthMiniChart } from "@/components/terminal/BtcMiniChart";
import { VolSurfaceWidget, TabKey } from "@/components/terminal/VolSurfaceWidget";
import { StrategyDrawer } from "@/components/terminal/StrategyDrawer";
import type { ArbUiContextSnapshot } from "@/components/terminal/ArbPanel";
import type { ArbContractNavigationTarget } from "@/components/terminal/ArbPanel";
import { AssistantPanel } from "@/components/terminal/AssistantPanel";
import { OnboardingTour, OnboardingStep } from "@/components/terminal/OnboardingTour";
import { streamRegistry } from "@/src/streaming/StreamRegistry";
import { makeQuoteKey } from "@/src/streaming/streamSelectors";
import { useMarketStreamStore } from "@/src/streaming/useMarketStreamStore";
import { VenueHealthSnapshot } from "@/src/streaming/types";
import { useStrategyBuilderStore } from "@/src/strategy/StrategyBuilderStore";
import { StrategyPresetKey } from "@/src/strategy/StrategyTypes";
import { buildPreset, rowToLeg } from "@/src/strategy/StrategyPresets";
import { buildAssistantContext } from "@/src/assistant/buildContext";
import { AssistantAction } from "@/src/assistant/validateAssistantJson";
import { MobileTerminal } from "@/components/terminal/mobile/MobileTerminal";

interface CompareApiResponse {
    underlying: string;
    expiry: string;
    venues: Venue[];
    benchmark: Venue;
    matchedCount: number;
    rows: CompareRow[];
    matched?: unknown[];
    panopticLiquidity?: NormalizedOption[];
    bestScopeLabel?: string;
    venueStatus: VenueStatus[];
    error?: string;
}

interface InstrumentsResponse {
    underlying: string;
    expiries: string[];
    venueStatus: VenueStatus[];
    error?: string;
}

interface FairBestResponse {
    rows: Array<{
        market: string;
        iv: number | null;
        m: number | null;
        expiry: string;
        warnings?: string[];
    }>;
    winner: string | null;
    explain: string;
    error?: string;
}

const STRATEGY_PRESET_ALIASES: Record<string, StrategyPresetKey> = {
    LONG_CALL: "LONG_CALL",
    LONG_PUT: "LONG_PUT",
    STRADDLE: "STRADDLE",
    STRANGLE: "STRANGLE",
    BULL_CALL_SPREAD: "BULL_CALL_SPREAD",
    BEAR_CALL_SPREAD: "BEAR_CALL_SPREAD",
    BULL_PUT_SPREAD: "BULL_PUT_SPREAD",
    BEAR_PUT_SPREAD: "BEAR_PUT_SPREAD",
    IRON_CONDOR: "IRON_CONDOR",
    COVERED_CALL: "COVERED_CALL",
    LONGCALL: "LONG_CALL",
    LONGPUT: "LONG_PUT",
    BULLCALLSPREAD: "BULL_CALL_SPREAD",
    BEARCALLSPREAD: "BEAR_CALL_SPREAD",
    BULLPUTSPREAD: "BULL_PUT_SPREAD",
    BEARPUTSPREAD: "BEAR_PUT_SPREAD",
    IRONCONDOR: "IRON_CONDOR",
    CALLCREDITSPREAD: "BEAR_CALL_SPREAD",
    PUTCREDITSPREAD: "BULL_PUT_SPREAD",
    CALLDEBITSPREAD: "BULL_CALL_SPREAD",
    PUTDEBITSPREAD: "BEAR_PUT_SPREAD",
};
type FocusTarget = "TOPBAR" | "CHAIN" | "ANALYSIS" | "STRATEGY" | "ASSISTANT";

interface OnboardingStepConfig extends OnboardingStep {
    focusTarget: FocusTarget | null;
    panel?: TabKey;
    openStrategy?: boolean;
    openArb?: boolean;
}

const ONBOARDING_COOKIE_NAME = "opbit_onboarding_seen";
const ONBOARDING_COOKIE_VERSION = "v1";
const ONBOARDING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const USER_PREFS_COOKIE_NAME = "opbit_user_prefs";
const USER_PREFS_COOKIE_VERSION = "v1";
const USER_PREFS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const SUPPORTED_UNDERLYINGS = ["BTC", "ETH", "IBIT"] as const;

type TerminalViewMode = "COMPARE" | "BEST";
type ThemeMode = "dark" | "light";
type ExecutionSide = "BUY" | "SELL";
interface UserPrefsCookie {
    version: typeof USER_PREFS_COOKIE_VERSION;
    themeMode: ThemeMode;
    underlying: string;
    venues: Venue[];
    viewMode: TerminalViewMode;
    executionSide: ExecutionSide;
}

function resolveQuoteVenues(underlying: string, activeVenues: Venue[]): Venue[] {
    const quoteVenues = activeVenues.filter((venue) => venue !== "PANOPTIC");
    if (quoteVenues.length > 0) return quoteVenues;
    return underlying === "IBIT" ? ["IBIT"] : ["DERIBIT"];
}
const BEST_PANOPTIC_QUOTE_VENUES: Venue[] = ["DERIBIT", "AEVO", "LYRA_V2"];

function buildPanopticChainRows(panopticRows: NormalizedOption[], selectedExpiry: string | null): CompareRow[] {
    const expiry = selectedExpiry ?? "-";
    const deduped = new Map<string, CompareRow>();

    for (const row of panopticRows) {
        const strike = Number.isFinite(row.strike) ? row.strike : 0;
        const key = `${strike.toFixed(2)}|${row.right}`;
        if (deduped.has(key)) continue;

        deduped.set(key, {
            contractKey: `PANOPTIC|${expiry}|${strike}|${row.right}`,
            underlying: row.underlying,
            expiry,
            strike,
            right: row.right,
            venues: {
                PANOPTIC: {
                    bid: null,
                    ask: null,
                    mid: null,
                    bidSize: null,
                    askSize: null,
                    markIv: row.markIv ?? null,
                    updatedAt: row.updatedAt ?? Date.now(),
                    quoteType: "LIQUIDITY_ONLY",
                    vsBenchmarkPct: null,
                },
            },
            bestVenue: null,
            bestMidUsed: null,
            bestSource: null,
            bestWarnings: row.warnings,
        });
    }

    return Array.from(deduped.values()).sort(
        (a, b) => a.strike - b.strike || a.right.localeCompare(b.right)
    );
}

function getCookieValue(name: string): string | null {
    if (typeof document === "undefined") return null;
    const rawCookie = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${name}=`));
    if (!rawCookie) return null;
    return decodeURIComponent(rawCookie.split("=").slice(1).join("="));
}

function setCookieValue(name: string, value: string, maxAgeSeconds: number) {
    if (typeof document === "undefined") return;
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function sanitizeUserPrefsCookie(raw: string | null): Partial<UserPrefsCookie> | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<UserPrefsCookie>;
        if (parsed.version !== USER_PREFS_COOKIE_VERSION) return null;

        const next: Partial<UserPrefsCookie> = {};
        if (parsed.themeMode === "dark" || parsed.themeMode === "light") {
            next.themeMode = parsed.themeMode;
        }
        if (
            typeof parsed.underlying === "string" &&
            (SUPPORTED_UNDERLYINGS as readonly string[]).includes(parsed.underlying)
        ) {
            next.underlying = parsed.underlying;
        }
        if (parsed.viewMode === "BEST" || parsed.viewMode === "COMPARE") {
            next.viewMode = parsed.viewMode;
        }
        if (parsed.executionSide === "BUY" || parsed.executionSide === "SELL") {
            next.executionSide = parsed.executionSide;
        }
        if (Array.isArray(parsed.venues)) {
            const sanitizedVenues = parsed.venues.filter((venue): venue is Venue =>
                (ALL_VENUES as readonly string[]).includes(String(venue))
            );
            if (sanitizedVenues.length > 0) {
                next.venues = Array.from(new Set(sanitizedVenues));
            }
        }
        return next;
    } catch {
        return null;
    }
}
const ONBOARDING_STEPS: OnboardingStepConfig[] = [
    {
        id: "welcome",
        title: "Welcome To OpBit",
        body: "OpBit is a cross-exchange options terminal built for DeFi traders and retail traders. Compare live quotes, liquidity, spreads, and implied volatility across options exchanges, inspect contracts, and build strategy setups. OpBit does not execute orders directly. After you choose a contract, use the venue links to place the trade on the external exchange.",
        focusTarget: null,
        cardPlacement: "center",
    },
    {
        id: "topbar",
        title: "Underlying + Venues",
        body: "Use the top bar to choose what you want to view, such as BTC or ETH. Select different exchanges to show their prices in separate columns so you can compare them side by side. **BEST** automatically surfaces the strongest available quote at each strike so you can scan faster without checking every venue first.",
        focusTarget: "TOPBAR",
        cardPlacement: "top-center-low",
    },
    {
        id: "chain",
        title: "Options Chain",
        body: "This table is where you browse contracts. First pick a date, then pick a price level. Click the highlighted at-the-money row to select a contract before moving to the next step.",
        focusTarget: "CHAIN",
        cardPlacement: "middle-right-inset",
        cardSize: "compact",
    },
    {
        id: "analysis",
        title: "Volatility Analysis",
        body: "Use these charts to understand market mood and price behavior. They help you see whether prices are stable or moving quickly, and whether a contract looks relatively expensive or cheap.",
        focusTarget: "ANALYSIS",
        panel: "VOL",
        cardPlacement: "middle-center",
        cardSize: "compact",
    },
    {
        id: "strategy",
        title: "Strategy Builder",
        body: "Use Strategy Builder to test ideas before risking money. Add one or more positions, adjust size, and use the charts to preview payoff and risk if the market moves up, down, or stays flat.",
        focusTarget: "STRATEGY",
        openStrategy: true,
        cardPlacement: "middle-center",
        cardSize: "compact",
    },
    {
        id: "arbitrage",
        title: "Arbitrage Scanner",
        body: "Use the Arbitrage Scanner to check option exchanges and expiries for potential mispricings, where the same contract is quoted differently across venues. The OpBit Arbitrage Scanner can take a while to load because it runs thousands of advanced calculations.",
        focusTarget: "STRATEGY",
        openArb: true,
        cardPlacement: "middle-center",
        cardSize: "compact",
    },
    {
        id: "assistant",
        title: "AI Navigation",
        body: "Need help? Ask OpBit AI in plain language, such as what to click next. It can guide you step by step, move the view to the right panel, and highlight the contract to select. Use the action buttons to apply each step quickly.",
        focusTarget: "ASSISTANT",
        cardPlacement: "top-right-low",
    },
];

export default function TerminalPage() {
    const refreshInterval = 5000;
    const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
    const [underlying, setUnderlying] = useState("BTC");
    const [venues, setVenues] = useState<Venue[]>(["DERIBIT", "AEVO", "LYRA_V2"]);
    const benchmark: Venue = "DERIBIT";
    const [expiries, setExpiries] = useState<string[]>([]);
    const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
    const [rows, setRows] = useState<CompareRow[]>([]);
    const [venueStatus, setVenueStatus] = useState<VenueStatus[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedSide, setSelectedSide] = useState<"C" | "P" | null>(null);
    const [arbHighlightedStrike, setArbHighlightedStrike] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [assistantHasSession, setAssistantHasSession] = useState(false);
    const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
    const [locked, setLocked] = useState(false);
    const [viewMode, setViewMode] = useState<TerminalViewMode>("BEST");
    const [analysisPanel, setAnalysisPanel] = useState<TabKey>("VOL");
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
    const [mobileWelcomePending, setMobileWelcomePending] = useState(false);
    const [panopticConfirmOpen, setPanopticConfirmOpen] = useState(false);
    const [prefsHydrated, setPrefsHydrated] = useState(false);
    const [arbDrawerOpen, setArbDrawerOpen] = useState(false);
    const [arbUiContext, setArbUiContext] = useState<ArbUiContextSnapshot | null>(null);
    const [arbTrackedContractKeys, setArbTrackedContractKeys] = useState<string[]>([]);
    const [assistantPresetRequest, setAssistantPresetRequest] = useState<{
        preset: StrategyPresetKey;
        nonce: number;
    } | null>(null);
    const [bestScopeLabel, setBestScopeLabel] = useState<string | null>(null);
    const [fairData, setFairData] = useState<FairBestResponse | null>(null);
    const [fairLoading, setFairLoading] = useState(false);
    const [panopticRows, setPanopticRows] = useState<NormalizedOption[]>([]);
    const [panopticLoading, setPanopticLoading] = useState(false);
    const executionSide = useMarketStreamStore((state) => state.executionSide);
    const setExecutionSide = useMarketStreamStore((state) => state.setExecutionSide);
    const streamVenueHealth = useMarketStreamStore((state) => state.venueHealth);
    const setQuotesBatch = useMarketStreamStore((state) => state.setQuotesBatch);

    const strategyToggle = useStrategyBuilderStore((s) => s.toggleDrawer);
    const strategyOpenDrawer = useStrategyBuilderStore((s) => s.openDrawer);
    const strategyDrawerOpen = useStrategyBuilderStore((s) => s.drawerOpen);
    const strategyAddLeg = useStrategyBuilderStore((s) => s.addLeg);
    const strategySetLegs = useStrategyBuilderStore((s) => s.setLegs);
    const strategyLegs = useStrategyBuilderStore((s) => s.legs);
    const strategyScenario = useStrategyBuilderStore((s) => s.scenario);
    const strategySpot = useStrategyBuilderStore((s) => s.spot);
    const strategySetSpot = useStrategyBuilderStore((s) => s.setSpot);
    const strategySetUnderlying = useStrategyBuilderStore((s) => s.setUnderlying);
    const strategyUpdateMark = useStrategyBuilderStore((s) => s.updateLegMark);
    const rightDrawerOpen = strategyDrawerOpen || arbDrawerOpen;
    const quoteVenues = useMemo(() => {
        if (viewMode === "BEST" && venues.includes("PANOPTIC")) {
            return BEST_PANOPTIC_QUOTE_VENUES;
        }
        return resolveQuoteVenues(underlying, venues);
    }, [underlying, venues, viewMode]);
    const isPanopticOnlySelection = useMemo(
        () => viewMode !== "BEST" && venues.length === 1 && venues[0] === "PANOPTIC",
        [venues, viewMode]
    );
    const hasPanopticVenue = useMemo(
        () => venues.includes("PANOPTIC"),
        [venues]
    );
    const panopticChainRows = useMemo(
        () => buildPanopticChainRows(panopticRows, selectedExpiry),
        [panopticRows, selectedExpiry]
    );
    const chainRows = useMemo(
        () => (isPanopticOnlySelection ? panopticChainRows : rows),
        [isPanopticOnlySelection, panopticChainRows, rows]
    );
    const chainVenues = useMemo(
        () => (isPanopticOnlySelection ? (["PANOPTIC"] as Venue[]) : quoteVenues),
        [isPanopticOnlySelection, quoteVenues]
    );
    const isQuoteFallbackActive = false;
    const isPanopticUnsupportedUnderlying = useMemo(
        () =>
            venues.includes("PANOPTIC") &&
            !underlying.toUpperCase().includes("ETH") &&
            !underlying.toUpperCase().includes("BTC"),
        [venues, underlying]
    );
    const quoteFallbackVenueLabel = quoteVenues.join(", ");

    const closeStrategyDrawer = useCallback(() => {
        useStrategyBuilderStore.setState({ drawerOpen: false });
    }, []);

    const [liveChartSpots, setLiveChartSpots] = useState<{ BTC: number | null; ETH: number | null; IBIT: number | null }>({
        BTC: null,
        ETH: null,
        IBIT: null,
    });
    const [ibitMarketState, setIbitMarketState] = useState<string | null>(null);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme-mode", themeMode);
        document.documentElement.style.colorScheme = themeMode;
    }, [themeMode]);

    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasFairLoadedRef = useRef(false);
    const hasPanopticLoadedRef = useRef(false);
    const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const arbHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const arbPendingSelectionRef = useRef<ArbContractNavigationTarget | null>(null);
    const fairSelectionKeyRef = useRef<string | null>(null);
    const fairSelectionAnchorRef = useRef<{ strike: number; expiry: string } | null>(null);
    const compareRequestSeqRef = useRef(0);

    const markOnboardingSeen = useCallback(() => {
        setCookieValue(ONBOARDING_COOKIE_NAME, ONBOARDING_COOKIE_VERSION, ONBOARDING_COOKIE_MAX_AGE_SECONDS);
    }, []);

    useEffect(() => {
        const cookieValue = getCookieValue(ONBOARDING_COOKIE_NAME) ?? "";
        if (cookieValue !== ONBOARDING_COOKIE_VERSION) {
            let shouldBlockOnMobile = false;
            try {
                const isMobileViewport = window.matchMedia("(max-width: 1023px)").matches;
                const seenMobileWelcome = window.sessionStorage.getItem("opbit_mobile_welcome_seen");
                shouldBlockOnMobile = isMobileViewport && !seenMobileWelcome;
            } catch {
                shouldBlockOnMobile = false;
            }

            setMobileWelcomePending(shouldBlockOnMobile);
            setOnboardingStepIndex(0);
            setOnboardingOpen(true);
        }
    }, []);

    useEffect(() => {
        const prefs = sanitizeUserPrefsCookie(getCookieValue(USER_PREFS_COOKIE_NAME));
        if (prefs?.themeMode) setThemeMode(prefs.themeMode);
        if (prefs?.underlying) setUnderlying(prefs.underlying);
        if (prefs?.venues) setVenues(prefs.venues);
        if (prefs?.viewMode) setViewMode(prefs.viewMode);
        if (prefs?.executionSide) setExecutionSide(prefs.executionSide);
        setPrefsHydrated(true);
    }, [setExecutionSide]);

    useEffect(() => {
        if (!prefsHydrated) return;
        const payload: UserPrefsCookie = {
            version: USER_PREFS_COOKIE_VERSION,
            themeMode,
            underlying,
            venues,
            viewMode,
            executionSide,
        };
        setCookieValue(USER_PREFS_COOKIE_NAME, JSON.stringify(payload), USER_PREFS_COOKIE_MAX_AGE_SECONDS);
    }, [prefsHydrated, themeMode, underlying, venues, viewMode, executionSide]);

    useEffect(() => {
        if (!strategyDrawerOpen || !arbDrawerOpen) return;
        setArbDrawerOpen(false);
    }, [strategyDrawerOpen, arbDrawerOpen]);

    useEffect(() => {
        if (viewMode !== "BEST" || !venues.includes("PANOPTIC")) return;
        if (underlying === "IBIT") {
            const ibitOnly = venues.length === 1 && venues[0] === "IBIT";
            if (!ibitOnly) {
                setVenues(["IBIT"]);
            }
            return;
        }
        const desired: Venue[] = [...BEST_PANOPTIC_QUOTE_VENUES, "PANOPTIC"];
        const alreadyAligned =
            venues.length === desired.length &&
            desired.every((venue) => venues.includes(venue));
        if (!alreadyAligned) {
            setVenues(desired);
        }
    }, [viewMode, venues, underlying]);

    useEffect(() => {
        if (isPanopticOnlySelection && analysisPanel !== "PANOPTIC") {
            setAnalysisPanel("PANOPTIC");
            return;
        }
        if (!hasPanopticVenue && analysisPanel === "PANOPTIC") {
            setAnalysisPanel("VOL");
        }
    }, [isPanopticOnlySelection, hasPanopticVenue, analysisPanel]);

    const closeOnboarding = useCallback(() => {
        setOnboardingOpen(false);
        setFocusTarget(null);
        markOnboardingSeen();
    }, [markOnboardingSeen]);

    const handleMobileWelcomeDismissed = useCallback(() => {
        setMobileWelcomePending(false);
    }, []);

    const handleOnboardingNext = useCallback(() => {
        setOnboardingStepIndex((prev) => {
            const step = ONBOARDING_STEPS[prev];
            if (step?.id === "chain" && (!selectedKey || !selectedSide)) {
                return prev;
            }
            if (step?.id === "strategy" && strategyLegs.length === 0) {
                return prev;
            }
            return Math.min(ONBOARDING_STEPS.length - 1, prev + 1);
        });
    }, [selectedKey, selectedSide, strategyLegs.length]);

    const handleOnboardingBack = useCallback(() => {
        setOnboardingStepIndex((prev) => Math.max(0, prev - 1));
    }, []);

    const onboardingCurrentStep = ONBOARDING_STEPS[onboardingStepIndex] ?? ONBOARDING_STEPS[0];
    const onboardingNeedsContractSelection =
        onboardingOpen &&
        onboardingCurrentStep.id === "chain" &&
        (!selectedKey || !selectedSide);
    const onboardingNeedsPresetSelection =
        onboardingOpen &&
        onboardingCurrentStep.id === "strategy" &&
        strategyLegs.length === 0;
    const onboardingNextDisabled =
        onboardingNeedsContractSelection || onboardingNeedsPresetSelection;

    useEffect(() => {
        if (!onboardingOpen) return;
        const step = ONBOARDING_STEPS[onboardingStepIndex] ?? ONBOARDING_STEPS[0];
        if (focusTimerRef.current) {
            clearTimeout(focusTimerRef.current);
            focusTimerRef.current = null;
        }
        setFocusTarget(step.focusTarget);
        if (step.panel) {
            setAnalysisPanel(step.panel);
        }
        if ((step.focusTarget === "ANALYSIS" || step.focusTarget === "ASSISTANT") && rightDrawerOpen) {
            closeStrategyDrawer();
            setArbDrawerOpen(false);
        }
        if (step.openArb) {
            if (strategyDrawerOpen) {
                closeStrategyDrawer();
            }
            if (!arbDrawerOpen) {
                setArbDrawerOpen(true);
            }
        }
        if (step.openStrategy && !strategyDrawerOpen && !arbDrawerOpen) {
            strategyOpenDrawer();
        }
    }, [
        onboardingOpen,
        onboardingStepIndex,
        strategyOpenDrawer,
        strategyDrawerOpen,
        arbDrawerOpen,
        rightDrawerOpen,
        closeStrategyDrawer,
    ]);

    const beginExpiryTransition = useCallback(() => {
        compareRequestSeqRef.current += 1;
        setLoading(true);
        setRows([]);
        setSelectedKey(null);
        setSelectedSide(null);
        setBestScopeLabel(null);
        setPanopticRows([]);
        setFairData(null);
    }, []);

    const fetchExpiries = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                underlying,
                venues: quoteVenues.join(","),
            });
            const res = await fetch(`/api/options/instruments?${params}`);
            const data: InstrumentsResponse = await res.json();

            if (data.error) setError(data.error);

            setExpiries(data.expiries || []);
            setVenueStatus(data.venueStatus || []);

            if (data.expiries.length > 0 && !data.expiries.includes(selectedExpiry || "")) {
                beginExpiryTransition();
                setSelectedExpiry(data.expiries[0]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch expiries");
        }
    }, [underlying, quoteVenues, selectedExpiry, beginExpiryTransition]);

    const fetchData = useCallback(async () => {
        if (!selectedExpiry) return;
        if (isPanopticOnlySelection) {
            setLoading(false);
            return;
        }
        const requestSeq = ++compareRequestSeqRef.current;
        const requestedUnderlying = underlying.toUpperCase();
        const requestedExpiry = selectedExpiry;

        try {
            const params = new URLSearchParams({
                underlying: requestedUnderlying,
                expiry: requestedExpiry,
                venues: quoteVenues.join(","),
                benchmark,
            });
            const res = await fetch(`/api/options/compare?${params}`);
            const data: CompareApiResponse = await res.json();

            if (requestSeq !== compareRequestSeqRef.current) {
                return;
            }

            const responseUnderlying = (data.underlying ?? "").toUpperCase();
            const responseExpiry = data.expiry ?? "";
            const responseMatchesSelection =
                responseUnderlying === requestedUnderlying &&
                responseExpiry === requestedExpiry;

            if (!responseMatchesSelection) {
                return;
            }

            if (data.error) setError(data.error);

            setRows(data.rows || []);
            setVenueStatus(data.venueStatus || []);
            setBestScopeLabel(data.bestScopeLabel ?? null);
            setPanopticRows(data.panopticLiquidity ?? []);
            setLastRefreshed(Date.now());
            setLoading(false);
        } catch (err) {
            if (requestSeq !== compareRequestSeqRef.current) {
                return;
            }
            setError(err instanceof Error ? err.message : "Failed to fetch data");
            setLoading(false);
        }
    }, [underlying, selectedExpiry, quoteVenues, benchmark, isPanopticOnlySelection]);

    const selectedRow =
        chainRows.find((r) => r.contractKey === selectedKey && r.right === selectedSide) || null;
    const selectedContractKey = selectedRow?.contractKey ?? null;
    const selectedContractRight = selectedRow?.right ?? null;
    const selectedContractStrike = selectedRow?.strike ?? null;
    const selectedContractExpiry = selectedRow?.expiry ?? null;

    const fetchFairData = useCallback(async (showLoading = false) => {
        if (showLoading || !hasFairLoadedRef.current) {
            setFairLoading(true);
        }
        try {
            const base = underlying === "IBIT" ? "BTC" : underlying;
            const params = new URLSearchParams({
                base,
                compare: "IBIT",
                tenor: "30D",
                bucket: "ATM",
            });

            const selectionAnchor = fairSelectionAnchorRef.current;
            if (selectionAnchor) {
                params.set("selectedStrike", String(selectionAnchor.strike));
                params.set("selectedExpiry", selectionAnchor.expiry);
            }

            const res = await fetch(`/api/options/fair-best?${params}`);
            const data: FairBestResponse = await res.json();
            setFairData(data);
            hasFairLoadedRef.current = true;
        } catch {
            setFairData(null);
            hasFairLoadedRef.current = false;
        } finally {
            setFairLoading(false);
        }
    }, [underlying]);

    const fetchPanoptic = useCallback(async (showLoading = false) => {
        if (!venues.includes("PANOPTIC")) {
            setPanopticRows([]);
            setPanopticLoading(false);
            hasPanopticLoadedRef.current = false;
            return;
        }

        if (showLoading || !hasPanopticLoadedRef.current) {
            setPanopticLoading(true);
        }
        try {
            const params = new URLSearchParams({ underlying });
            const res = await fetch(`/api/options/panoptic-liquidity?${params}`);
            const data = await res.json();
            setPanopticRows(data.rows || []);
            hasPanopticLoadedRef.current = true;
        } catch {
            setPanopticRows([]);
            hasPanopticLoadedRef.current = false;
        } finally {
            setPanopticLoading(false);
        }
    }, [underlying, venues]);

    useEffect(() => {
        fetchExpiries();
    }, [fetchExpiries]);

    useEffect(() => {
        if (!selectedExpiry) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (!isPanopticOnlySelection) {
                fetchData();
            }
            fetchFairData(true);
            fetchPanoptic(true);
        }, 250);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [selectedExpiry, underlying, venues, benchmark, fetchData, fetchFairData, fetchPanoptic, isPanopticOnlySelection]);

    useEffect(() => {
        const nextKey = selectedContractKey ? `${selectedContractKey}|${selectedContractRight}` : null;
        if (nextKey === fairSelectionKeyRef.current) return;
        fairSelectionKeyRef.current = nextKey;
        fairSelectionAnchorRef.current =
            selectedContractStrike != null && selectedContractExpiry
                ? { strike: selectedContractStrike, expiry: selectedContractExpiry }
                : null;
        fetchFairData(false);
    }, [
        selectedContractKey,
        selectedContractRight,
        selectedContractStrike,
        selectedContractExpiry,
        fetchFairData,
    ]);

    useEffect(() => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

        if (refreshInterval > 0 && selectedExpiry) {
            refreshTimerRef.current = setInterval(() => {
                if (!isPanopticOnlySelection) {
                    fetchData();
                }
                fetchFairData();
                fetchPanoptic();
            }, refreshInterval);
        }

        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [refreshInterval, fetchData, fetchFairData, fetchPanoptic, selectedExpiry, isPanopticOnlySelection]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (assistantOpen) {
                    e.preventDefault();
                    setAssistantHasSession(true);
                    setAssistantOpen(false);
                    return;
                }
                if (panopticConfirmOpen) {
                    e.preventDefault();
                    setPanopticConfirmOpen(false);
                    return;
                }
                if (!onboardingOpen) {
                    setLocked(false);
                }
                return;
            }

            if (assistantOpen) return;
            if (onboardingOpen) return;
            if (panopticConfirmOpen) return;

            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

            if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setAssistantHasSession(true);
                setAssistantOpen(true);
                return;
            }
            if (e.key === "r" || e.key === "R") {
                if (!isPanopticOnlySelection) {
                    fetchData();
                }
                fetchFairData();
                fetchPanoptic();
                return;
            }
            if (e.key === "s" || e.key === "S") {
                if (arbDrawerOpen) {
                    setArbDrawerOpen(false);
                }
                strategyToggle();
                return;
            }
            if (e.key === "Enter" && selectedKey) {
                setLocked(true);
                return;
            }

            if (locked) return;

            const currentRows = chainRows.filter((r) => r.right === (selectedSide || "C"));
            const currentIdx = currentRows.findIndex((r) => r.contractKey === selectedKey);

            if (e.key === "ArrowUp" && currentIdx > 0) {
                e.preventDefault();
                setSelectedKey(currentRows[currentIdx - 1].contractKey);
            } else if (e.key === "ArrowDown" && currentIdx < currentRows.length - 1) {
                e.preventDefault();
                setSelectedKey(currentRows[currentIdx + 1].contractKey);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setSelectedSide((prev) => (prev === "C" ? "P" : "C"));
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [
        assistantOpen,
        onboardingOpen,
        locked,
        chainRows,
        selectedKey,
        selectedSide,
        fetchData,
        fetchFairData,
        fetchPanoptic,
        arbDrawerOpen,
        strategyToggle,
        isPanopticOnlySelection,
        panopticConfirmOpen,
    ]);

    const handleVenueToggle = useCallback((venue: Venue) => {
        const venueWasEnabled = venues.includes(venue);
        const isCryptoVenue = venue === "DERIBIT" || venue === "AEVO" || venue === "LYRA_V2";
        if (venue === "PANOPTIC" && !venueWasEnabled) {
            setPanopticConfirmOpen(true);
            return;
        }
        if (venue === "IBIT") {
            if (venueWasEnabled && venues.length === 1) return;
            if (underlying !== "IBIT") {
                beginExpiryTransition();
                setUnderlying("IBIT");
            }
            setVenues(["IBIT"]);
            return;
        }
        if (underlying === "IBIT" && isCryptoVenue) {
            beginExpiryTransition();
            setUnderlying("BTC");
        }

        if (venueWasEnabled) {
            const nextVenues = venues.filter((v) => v !== venue);
            if (nextVenues.length > 0) {
                setVenues(nextVenues);
                return;
            }
            if (underlying === "IBIT") {
                setVenues(["IBIT"]);
                return;
            }
            setVenues(["DERIBIT"]);
            return;
        }

        const withoutIbit = venues.filter((v) => v !== "IBIT");
        setVenues(Array.from(new Set([...withoutIbit, venue])));

    }, [venues, underlying, beginExpiryTransition]);

    const handleConfirmPanopticVenue = useCallback(() => {
        setVenues((prev) => {
            const withoutIbit = prev.filter((v) => v !== "IBIT");
            return Array.from(new Set([...withoutIbit, "PANOPTIC"]));
        });
        setPanopticConfirmOpen(false);
    }, []);

    const handleCancelPanopticVenue = useCallback(() => {
        setPanopticConfirmOpen(false);
    }, []);

    function handleSelect(contractKey: string, side: "C" | "P") {
        setSelectedKey(contractKey);
        setSelectedSide(side);
    }

    const handleSelectExpiry = useCallback((expiry: string) => {
        if (expiry === selectedExpiry) return;
        beginExpiryTransition();
        setSelectedExpiry(expiry);
    }, [selectedExpiry, beginExpiryTransition]);

    const handleUnderlyingChange = useCallback((nextUnderlying: string) => {
        if (nextUnderlying === underlying) return;
        beginExpiryTransition();
        if (nextUnderlying === "IBIT") {
            setVenues(["IBIT"]);
        } else if (venues.length === 1 && venues[0] === "IBIT") {
            setVenues(["DERIBIT", "AEVO", "LYRA_V2"]);
        }
        setUnderlying(nextUnderlying);
    }, [underlying, beginExpiryTransition, venues]);

    const handleBtcChartPrice = useCallback((price: number | null) => {
        setLiveChartSpots((prev) => (prev.BTC === price ? prev : { ...prev, BTC: price }));
    }, []);

    const handleEthChartPrice = useCallback((price: number | null) => {
        setLiveChartSpots((prev) => (prev.ETH === price ? prev : { ...prev, ETH: price }));
    }, []);

    useEffect(() => {
        if (underlying !== "IBIT") return;
        let active = true;

        const fetchIbitSpot = async () => {
            try {
                const res = await fetch("/api/market/spot?symbols=IBIT", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                const raw = data?.spots?.IBIT;
                const nextSpot = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
                const rawMarketState = data?.marketStates?.IBIT;
                const nextMarketState = typeof rawMarketState === "string" ? rawMarketState.toUpperCase() : null;
                if (!active) return;
                setLiveChartSpots((prev) => (prev.IBIT === nextSpot ? prev : { ...prev, IBIT: nextSpot }));
                setIbitMarketState((prev) => (prev === nextMarketState ? prev : nextMarketState));
            } catch {
                // Ignore transient spot fetch failures.
            }
        };

        fetchIbitSpot();
        const timer = setInterval(fetchIbitSpot, 5000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [underlying]);

    useEffect(() => {
        if (underlying !== "IBIT") {
            setIbitMarketState(null);
        }
    }, [underlying]);

    useEffect(() => {
        return () => {
            streamRegistry.stop();
            if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
            if (arbHighlightTimerRef.current) clearTimeout(arbHighlightTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!selectedExpiry) return;
        if (isPanopticOnlySelection) {
            streamRegistry.stop();
            return;
        }
        const contractKeys = Array.from(new Set([
            ...rows.map((row) => row.contractKey),
            ...arbTrackedContractKeys,
        ]));
        streamRegistry.start({
            underlying,
            expiry: selectedExpiry,
            activeVenues: quoteVenues,
            contractKeys,
        });
    }, [underlying, selectedExpiry, quoteVenues, rows, arbTrackedContractKeys, isPanopticOnlySelection]);

    useEffect(() => {
        if (!isPanopticOnlySelection) return;
        setBestScopeLabel("PANOPTIC LIQUIDITY");
        setLoading(panopticLoading);
    }, [isPanopticOnlySelection, panopticLoading]);

    useEffect(() => {
        if (rows.length === 0) return;
        const now = Date.now();
        const updates = [];

        for (const row of rows) {
            for (const [venueKey, venueData] of Object.entries(row.venues)) {
                const venue = venueKey as Venue;
                if (!venueData) continue;

                updates.push({
                    key: makeQuoteKey(venue, row.contractKey),
                    patch: {
                        bid: venueData.bid ?? null,
                        ask: venueData.ask ?? null,
                        bidSize: venueData.bidSize ?? null,
                        askSize: venueData.askSize ?? null,
                        mark: venueData.mid ?? null,
                        mid: venueData.mid ?? null,
                        iv: venueData.markIv ?? null,
                        delta: venueData.delta ?? null,
                        gamma: venueData.gamma ?? null,
                        theta: venueData.theta ?? null,
                        vega: venueData.vega ?? null,
                        lastUpdateMs: venueData.updatedAt ?? now,
                        source: "poll" as const,
                    },
                });
            }
        }

        setQuotesBatch(updates);

        // Sync mark prices to strategy legs
        for (const row of rows) {
            const bestVenueData = row.bestVenue ? row.venues[row.bestVenue] : Object.values(row.venues)[0];
            const mid = bestVenueData?.mid ?? null;
            if (mid != null) {
                strategyUpdateMark(row.contractKey, mid);
            }
        }
    }, [rows, setQuotesBatch, strategyUpdateMark]);

    // Sync spot and underlying to strategy store
    useEffect(() => {
        strategySetUnderlying(underlying);
    }, [underlying, strategySetUnderlying]);

    useEffect(() => {
        const btcSpot = liveChartSpots.BTC;
        const ethSpot = liveChartSpots.ETH;
        const ibitSpot = liveChartSpots.IBIT;
        const spot = underlying === "ETH" ? ethSpot : underlying === "IBIT" ? ibitSpot : btcSpot;
        if (spot != null && spot > 0) {
            strategySetSpot(spot);
        }
    }, [liveChartSpots, underlying, strategySetSpot]);

    const effectiveVenueStatus = useMemo(() => {
        const byVenue = new Map<Venue, VenueStatus>();
        for (const status of venueStatus) {
            byVenue.set(status.venue, status);
        }

        function toStatus(health: VenueHealthSnapshot): VenueStatus["status"] {
            if (health.health === "LIVE") return "ok";
            if (health.health === "SLOW") return "degraded";
            if (health.health === "DELAYED") return "delayed";
            return "down";
        }

        for (const [venueKey, health] of Object.entries(streamVenueHealth)) {
            const venue = venueKey as Venue;
            if (!venues.includes(venue)) continue;

            const current = byVenue.get(venue);
            const ageLabel = health.ageMs != null ? `${Math.round(health.ageMs)}ms` : "n/a";
            const reasonPrefix = `${health.health} | age ${ageLabel}`;
            byVenue.set(venue, {
                venue,
                status: toStatus(health),
                reason: current?.reason ? `${reasonPrefix} | ${current.reason}` : reasonPrefix,
                lastUpdated: health.lastUpdateMs ?? current?.lastUpdated ?? Date.now(),
            });
        }

        return Array.from(byVenue.values());
    }, [streamVenueHealth, venueStatus, venues]);

    const assistantContext = useMemo(() => {
        const spot =
            underlying === "ETH"
                ? liveChartSpots.ETH
                : underlying === "IBIT"
                    ? liveChartSpots.IBIT
                    : liveChartSpots.BTC;

        return buildAssistantContext({
            underlying,
            spot,
            ibitMarketState,
            availableExpiries: expiries,
            selectedExpiry,
            selectedContractKey: selectedKey,
            selectedSide,
            selectedStrike: selectedRow?.strike ?? null,
            selectedContract: selectedRow,
            currentPanel: arbDrawerOpen
                ? "ARBITRAGE"
                : strategyDrawerOpen
                    ? "STRATEGY"
                    : analysisPanel === "PANOPTIC"
                        ? "FAIR"
                        : analysisPanel,
            viewMode,
            executionSide,
            venues: chainVenues,
            rows: chainRows,
            fairSummary: fairData
                ? {
                    winner: fairData.winner,
                    explain: fairData.explain,
                    rowCount: fairData.rows.length,
                }
                : null,
            strategy: {
                drawerOpen: strategyDrawerOpen,
                legs: strategyLegs,
                scenario: strategyScenario,
                spot: strategySpot,
            },
            arbitrage: arbUiContext,
        });
    }, [
        underlying,
        ibitMarketState,
        expiries,
        liveChartSpots.ETH,
        liveChartSpots.BTC,
        liveChartSpots.IBIT,
        selectedExpiry,
        selectedKey,
        selectedSide,
        selectedRow,
        strategyDrawerOpen,
        arbDrawerOpen,
        analysisPanel,
        viewMode,
        executionSide,
        chainVenues,
        chainRows,
        fairData,
        strategyLegs,
        strategyScenario,
        strategySpot,
        arbUiContext,
    ]);

    const triggerFocusTarget = useCallback((target: FocusTarget | null) => {
        if (!target) return;
        setFocusTarget(target);
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => {
            setFocusTarget((current) => (current === target ? null : current));
        }, 3500);
    }, []);

    const applyArbSelectionToChain = useCallback((target: ArbContractNavigationTarget): boolean => {
        const sideRows = rows.filter((row) => row.right === target.side);
        const source = sideRows.length > 0 ? sideRows : rows;
        if (source.length === 0) return false;

        const exactByContractKey = target.contractKey
            ? source.find((row) => row.contractKey === target.contractKey && row.right === target.side) ??
            source.find((row) => row.contractKey === target.contractKey) ??
            null
            : null;
        const nearestByStrike = source.reduce((best, row) => {
            if (!best) return row;
            return Math.abs(row.strike - target.strike) < Math.abs(best.strike - target.strike) ? row : best;
        }, null as CompareRow | null);
        const matched = exactByContractKey ?? nearestByStrike;
        if (!matched) return false;

        setSelectedKey(matched.contractKey);
        setSelectedSide(matched.right);
        setArbHighlightedStrike(matched.strike);
        if (arbHighlightTimerRef.current) clearTimeout(arbHighlightTimerRef.current);
        arbHighlightTimerRef.current = setTimeout(() => {
            setArbHighlightedStrike((current) => (current === matched.strike ? null : current));
        }, 4200);
        return true;
    }, [rows]);

    const handleArbNavigateToContract = useCallback((target: ArbContractNavigationTarget) => {
        arbPendingSelectionRef.current = target;
        triggerFocusTarget("CHAIN");

        if (target.expiry !== selectedExpiry) {
            handleSelectExpiry(target.expiry);
            return;
        }

        if (applyArbSelectionToChain(target)) {
            arbPendingSelectionRef.current = null;
        }
    }, [selectedExpiry, handleSelectExpiry, applyArbSelectionToChain, triggerFocusTarget]);

    useEffect(() => {
        const pending = arbPendingSelectionRef.current;
        if (!pending) return;
        if (selectedExpiry !== pending.expiry) return;
        if (applyArbSelectionToChain(pending)) {
            arbPendingSelectionRef.current = null;
        }
    }, [rows, selectedExpiry, applyArbSelectionToChain]);

    const handleAssistantAction = useCallback((action: AssistantAction): { ok: boolean; focusTarget?: FocusTarget | null } => {
        const unavailable = (message: string): { ok: boolean; focusTarget?: FocusTarget | null } => {
            setError(message);
            return { ok: false, focusTarget: null };
        };
        const parseExecutionIntent = (value: unknown): "BUY" | "SELL" | null => {
            if (typeof value !== "string") return null;
            const normalized = value.trim().toUpperCase();
            if (normalized === "BUY") return "BUY";
            if (normalized === "SELL") return "SELL";
            return null;
        };
        const parseOptionRight = (value: unknown): "C" | "P" | null => {
            if (typeof value !== "string") return null;
            const normalized = value.trim().toUpperCase();
            if (normalized === "C" || normalized === "CALL") return "C";
            if (normalized === "P" || normalized === "PUT") return "P";
            return null;
        };
        const parseNumeric = (value: unknown): number | null => {
            if (typeof value === "number") return Number.isFinite(value) ? value : null;
            if (typeof value === "string") {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        };

        if (action.type === "setUnderlying") {
            const value = String(action.value).toUpperCase();
            if (value !== "BTC" && value !== "ETH" && value !== "IBIT") {
                return unavailable("Action unavailable: unsupported underlying.");
            }
            handleUnderlyingChange(value);
            return { ok: true, focusTarget: "TOPBAR" };
        }

        if (action.type === "setExpiry") {
            const expiry = String(action.value);
            if (!expiries.includes(expiry)) {
                return unavailable("Action unavailable: expiry not loaded.");
            }
            handleSelectExpiry(expiry);
            return { ok: true, focusTarget: "CHAIN" };
        }

        if (action.type === "setExecutionSide") {
            const side = String(action.value).toUpperCase();
            if (side !== "BUY" && side !== "SELL") {
                return unavailable("Action unavailable: invalid execution side.");
            }
            setExecutionSide(side);
            return { ok: true, focusTarget: "CHAIN" };
        }

        if (action.type === "openPanel") {
            const rawPanel = String(action.value).toUpperCase();
            if (rawPanel === "STRATEGY") {
                setArbDrawerOpen(false);
                strategyOpenDrawer();
                return { ok: true, focusTarget: "STRATEGY" };
            }
            if (rawPanel === "ARBITRAGE") {
                closeStrategyDrawer();
                setArbDrawerOpen(true);
                return { ok: true, focusTarget: "STRATEGY" };
            }
            if (rawPanel === "CHAIN") {
                return { ok: true, focusTarget: "CHAIN" };
            }
            const mappedPanel: TabKey | null =
                rawPanel === "SMILE" ? "SMILE" :
                    rawPanel === "TERM" ? "TERM" :
                        rawPanel === "VOL" ? "VOL" :
                            rawPanel === "FAIR" ? "FAIR" :
                                null;
            if (!mappedPanel) {
                return unavailable("Action unavailable: unknown panel.");
            }
            setAnalysisPanel(mappedPanel);
            return { ok: true, focusTarget: "ANALYSIS" };
        }

        const pickNearestRowByStrike = (targetStrike: number, preferredSide: "C" | "P") => {
            const candidates = rows.filter((row) => row.right === preferredSide);
            const source = candidates.length > 0 ? candidates : rows;
            if (source.length === 0) return null;
            return source.reduce((best, row) => {
                if (!best) return row;
                return Math.abs(row.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? row : best;
            }, null as CompareRow | null);
        };
        const pickNearestRowAnyByStrike = (targetStrike: number) => {
            if (rows.length === 0) return null;
            return rows.reduce((best, row) => {
                if (!best) return row;
                return Math.abs(row.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? row : best;
            }, null as CompareRow | null);
        };

        if (action.type === "jumpToStrike") {
            const strike = parseNumeric(action.value);
            if (strike == null) {
                return unavailable("Action unavailable: invalid strike.");
            }
            const nearest = pickNearestRowByStrike(strike, selectedSide ?? "C");
            if (!nearest) {
                return unavailable("Action unavailable: strike not available.");
            }
            setSelectedKey(nearest.contractKey);
            setSelectedSide(nearest.right);
            return { ok: true, focusTarget: "CHAIN" };
        }

        if (action.type === "highlightContract") {
            if (typeof action.value !== "object" || action.value == null) {
                return unavailable("Action unavailable: invalid contract payload.");
            }

            const payload = action.value as Record<string, unknown>;
            const desiredRight =
                parseOptionRight(payload.side) ??
                parseOptionRight(payload.right) ??
                parseOptionRight(payload.optionType) ??
                parseOptionRight(payload.contractType);

            if (typeof payload.contractKey === "string") {
                const matches = rows.filter((row) => row.contractKey === payload.contractKey);
                if (matches.length === 0) return unavailable("Action unavailable: contract key not found.");
                const matched = desiredRight
                    ? matches.find((row) => row.right === desiredRight) ?? null
                    : matches.length === 1
                        ? matches[0]
                        : (selectedSide ? matches.find((row) => row.right === selectedSide) ?? null : null);
                if (!matched) {
                    return unavailable("Action unavailable: contract side is ambiguous. Please specify call or put.");
                }
                setSelectedKey(matched.contractKey);
                setSelectedSide(matched.right);
                return { ok: true, focusTarget: "CHAIN" };
            }

            const strike = parseNumeric(payload.strike);
            if (strike != null) {
                const nearest = desiredRight
                    ? pickNearestRowByStrike(strike, desiredRight)
                    : selectedSide
                        ? pickNearestRowByStrike(strike, selectedSide)
                        : pickNearestRowAnyByStrike(strike);
                if (!nearest) return unavailable("Action unavailable: strike not found.");
                setSelectedKey(nearest.contractKey);
                setSelectedSide(nearest.right);
                return { ok: true, focusTarget: "CHAIN" };
            }

            return unavailable("Action unavailable: missing contract identifier.");
        }

        if (action.type === "openStrategyPreset") {
            const raw = typeof action.value === "string"
                ? action.value
                : typeof action.value === "object" && action.value != null
                    ? (action.value as Record<string, unknown>).preset
                    : null;
            if (typeof raw !== "string") {
                return unavailable("Action unavailable: invalid preset payload.");
            }
            const normalized = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
            const preset = STRATEGY_PRESET_ALIASES[raw.toUpperCase()] ?? STRATEGY_PRESET_ALIASES[normalized];
            if (!preset) {
                return unavailable("Action unavailable: preset not supported.");
            }
            strategyOpenDrawer();
            const spotForPreset =
                strategySpot > 0
                    ? strategySpot
                    : (underlying === "ETH" ? liveChartSpots.ETH : underlying === "IBIT" ? liveChartSpots.IBIT : liveChartSpots.BTC) ?? 0;
            const presetLegs = buildPreset(preset, {
                rows,
                spot: spotForPreset,
                underlying,
                selectedExpiry,
            });
            if (presetLegs.length === 0) {
                return unavailable("Action unavailable: no matching contracts for this preset.");
            }
            strategySetLegs(presetLegs);
            setAssistantPresetRequest({ preset, nonce: Date.now() });
            return { ok: true, focusTarget: "STRATEGY" };
        }

        if (action.type === "addLegToStrategy") {
            if (typeof action.value !== "object" || action.value == null) {
                return unavailable("Action unavailable: invalid leg payload.");
            }
            const payload = action.value as Record<string, unknown>;
            const desiredExecutionSide = parseExecutionIntent(payload.side) ?? "BUY";
            const desiredRight =
                parseOptionRight(payload.right) ??
                parseOptionRight(payload.optionType) ??
                parseOptionRight(payload.contractType) ??
                parseOptionRight(payload.side);

            let rowForLeg: CompareRow | null = null;
            if (typeof payload.contractKey === "string") {
                const matches = rows.filter((row) => row.contractKey === payload.contractKey);
                if (matches.length > 0) {
                    rowForLeg = desiredRight
                        ? matches.find((row) => row.right === desiredRight) ?? null
                        : matches.length === 1
                            ? matches[0]
                            : (selectedSide ? matches.find((row) => row.right === selectedSide) ?? null : null);
                }
            } else {
                const strike = parseNumeric(payload.strike);
                if (strike != null) {
                    rowForLeg = desiredRight
                        ? pickNearestRowByStrike(strike, desiredRight)
                        : selectedSide
                            ? pickNearestRowByStrike(strike, selectedSide)
                            : pickNearestRowAnyByStrike(strike);
                }
            }

            if (!rowForLeg) {
                return unavailable("Action unavailable: no matching contract to add.");
            }

            strategyOpenDrawer();
            const replaceExisting = payload.replaceExisting === true;
            const nextLeg = rowToLeg(rowForLeg, desiredExecutionSide, underlying);
            if (replaceExisting) {
                strategySetLegs([nextLeg]);
            } else {
                strategyAddLeg(nextLeg);
            }
            return { ok: true, focusTarget: "STRATEGY" };
        }

        return unavailable("Action unavailable.");
    }, [
        expiries,
        handleSelectExpiry,
        handleUnderlyingChange,
        setExecutionSide,
        closeStrategyDrawer,
        strategyOpenDrawer,
        rows,
        selectedSide,
        strategyAddLeg,
        strategySetLegs,
        strategySpot,
        underlying,
        selectedExpiry,
        liveChartSpots.ETH,
        liveChartSpots.BTC,
        liveChartSpots.IBIT,
    ]);

    return (
        <div className={`terminal-shell flex flex-col bg-[#060a10] text-[#c0ccd8] h-[100dvh] overflow-hidden pb-0 lg:pb-[20px] ${themeMode === "light" ? "theme-light" : ""}`}>
            {/* Desktop UI */}
            <div className="hidden lg:flex flex-col h-full w-full overflow-hidden">
                <div
                    className={`relative transition-all ${focusTarget === "TOPBAR" || focusTarget === "ASSISTANT"
                        ? onboardingOpen
                            ? "ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border"
                            : "ring-2 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.45)]"
                        : ""
                        } ${onboardingOpen && (focusTarget === "TOPBAR" || focusTarget === "ASSISTANT") ? "z-[97]" : ""}`}
                >
                    <TopBar
                        underlying={underlying}
                        onUnderlyingChange={handleUnderlyingChange}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        venues={venues}
                        onVenueToggle={handleVenueToggle}
                        venueStatus={effectiveVenueStatus}
                        onAssistantToggle={() => {
                            setAssistantHasSession(true);
                            setAssistantOpen((prev) => !prev);
                        }}
                        assistantOpen={assistantOpen}
                        lastRefreshed={lastRefreshed}
                        themeMode={themeMode}
                        onThemeToggle={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                        assistantHighlighted={focusTarget === "ASSISTANT"}
                        pendingPanopticHighlight={panopticConfirmOpen}
                    />
                </div>
                {isQuoteFallbackActive && (
                    <div className={`mx-2 mt-1 rounded-sm border px-3 py-1 text-[10px] font-mono ${themeMode === "light"
                        ? "border-[#b8cee5] bg-[#edf5ff] text-[#315d86]"
                        : "border-[#2a3d57] bg-[#0b1524] text-[#9fc3e8]"
                        }`}>
                        Panoptic is selected. Panoptic provides liquidity-only data, so chain/inspector quotes are shown from {quoteFallbackVenueLabel} as a reference source.
                    </div>
                )}
                {isPanopticUnsupportedUnderlying && (
                    <div className={`mx-2 mt-1 rounded-sm border px-3 py-1 text-[10px] font-mono ${themeMode === "light"
                        ? "border-[#d9c69e] bg-[#fff7e8] text-[#8c5a16]"
                        : "border-[#5b4422] bg-[#1f160a] text-[#e2bb73]"
                        }`}>
                        Panoptic liquidity rows are currently available for BTC and ETH only.
                    </div>
                )}
                <div className="flex-1 min-h-0 px-2 pb-2 mt-1 flex gap-2 overflow-hidden">
                    <div className="flex flex-col gap-2 h-full min-h-0 w-[320px] shrink-0">
                        <BtcMiniChart onPriceUpdate={handleBtcChartPrice} />
                        <EthMiniChart onPriceUpdate={handleEthChartPrice} />
                        <LiveNewsPanel underlying={underlying} />
                    </div>

                    <div
                        className={`relative h-full min-h-0 bg-[#0d1117] border border-[#1e2a3a] overflow-hidden flex-1 min-w-0 transition-all ${focusTarget === "CHAIN"
                            ? onboardingOpen
                                ? "ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border"
                                : "ring-2 ring-[#47b5ff] shadow-[0_0_32px_rgba(71,181,255,0.45)]"
                            : ""
                            } ${onboardingOpen && focusTarget === "CHAIN" ? "z-[97]" : ""}`}
                    >
                        {loading ? (
                            <LoadingSkeleton selectedExpiry={selectedExpiry} />
                        ) : (
                            <OptionsChainGrid
                                rows={chainRows}
                                venues={chainVenues}
                                selectedKey={selectedKey}
                                selectedSide={selectedSide}
                                onSelect={handleSelect}
                                underlying={underlying}
                                viewMode={viewMode}
                                bestScopeLabel={bestScopeLabel}
                                executionSide={executionSide}
                                onExecutionSideChange={setExecutionSide}
                                expiries={expiries}
                                selectedExpiry={selectedExpiry}
                                onSelectExpiry={handleSelectExpiry}
                                spotPrice={underlying === "ETH" ? liveChartSpots.ETH : underlying === "IBIT" ? liveChartSpots.IBIT : liveChartSpots.BTC}
                                themeMode={themeMode}
                                highlightAtmStrikeRow={onboardingOpen && onboardingCurrentStep.id === "chain"}
                                highlightStrike={arbHighlightedStrike}
                                ibitMarketClosed={underlying === "IBIT" && ibitMarketState === "CLOSED"}
                            />
                        )}
                    </div>

                    <div
                        className={`relative flex flex-col gap-2 h-full min-h-0 shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${rightDrawerOpen ? "w-0 opacity-0 pointer-events-none" : "w-[360px] opacity-100"
                            } ${focusTarget === "ANALYSIS"
                                ? onboardingOpen
                                    ? "ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border"
                                    : "ring-2 ring-[#47b5ff] shadow-[0_0_32px_rgba(71,181,255,0.45)]"
                                : ""
                            } ${onboardingOpen && focusTarget === "ANALYSIS" ? "z-[97]" : ""}`}
                        aria-hidden={rightDrawerOpen}
                    >
                        <VolSurfaceWidget
                            fairData={fairData}
                            fairLoading={fairLoading}
                            panopticRows={panopticRows}
                            panopticLoading={panopticLoading}
                            rows={rows}
                            venues={quoteVenues}
                            underlying={underlying}
                            viewMode={viewMode}
                            selectedRow={selectedRow}
                            themeMode={themeMode}
                            activeTab={analysisPanel}
                            onActiveTabChange={setAnalysisPanel}
                        />
                        <ContractInspector
                            row={selectedRow}
                            underlying={underlying}
                            viewMode={viewMode}
                            executionSide={executionSide}
                            liveChartSpots={liveChartSpots}
                            themeMode={themeMode}
                        />
                    </div>

                    <div
                        className={`relative h-full min-h-0 shrink-0 transition-all ${focusTarget === "STRATEGY"
                            ? onboardingOpen
                                ? "ring-4 ring-[#47b5ff] shadow-[0_0_28px_rgba(71,181,255,0.52)] onboarding-halo-border"
                                : "ring-2 ring-[#47b5ff] shadow-[0_0_32px_rgba(71,181,255,0.45)]"
                            : ""
                            } ${onboardingOpen && focusTarget === "STRATEGY" ? "z-[97]" : ""}`}
                    >
                        <StrategyDrawer
                            rows={rows}
                            underlying={underlying}
                            selectedExpiry={selectedExpiry}
                            expiries={expiries}
                            onSelectExpiry={handleSelectExpiry}
                            assistantPreset={assistantPresetRequest}
                            themeMode={themeMode}
                            highlightPresets={onboardingOpen && onboardingCurrentStep.id === "strategy"}
                            highlightArbButton={onboardingOpen && onboardingCurrentStep.id === "arbitrage" && !arbDrawerOpen}
                            venues={venues}
                            arbOpen={arbDrawerOpen}
                            onOpenArb={() => setArbDrawerOpen(true)}
                            onCloseArb={() => setArbDrawerOpen(false)}
                            onNavigateArbContract={handleArbNavigateToContract}
                            onTrackedArbContractsChange={setArbTrackedContractKeys}
                            onArbContextChange={setArbUiContext}
                        />
                    </div>
                </div>
            </div>

            {/* Mobile UI */}
            <div className="flex lg:hidden flex-col flex-1 min-h-0 w-full overflow-hidden relative">
                <MobileTerminal
                    underlying={underlying}
                    onUnderlyingChange={handleUnderlyingChange}
                    venues={venues}
                    onVenueToggle={handleVenueToggle}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    expiries={expiries}
                    selectedExpiry={selectedExpiry}
                    onSelectExpiry={handleSelectExpiry}
                    chainRows={chainRows}
                    chainVenues={chainVenues}
                    chainLoading={loading}
                    selectedKey={selectedKey}
                    selectedSide={selectedSide}
                    onSelect={handleSelect}
                    themeMode={themeMode}
                    fairData={fairData}
                    fairLoading={fairLoading}
                    panopticRows={panopticRows}
                    panopticLoading={panopticLoading}
                    executionSide={executionSide}
                    liveChartSpots={liveChartSpots}
                    onAssistantToggle={() => {
                        setAssistantHasSession(true);
                        setAssistantOpen((prev) => !prev);
                    }}
                    assistantOpen={assistantOpen}
                    assistantPreset={assistantPresetRequest}
                    arbOpen={arbDrawerOpen}
                    onOpenArb={() => setArbDrawerOpen(true)}
                    onCloseArb={() => setArbDrawerOpen(false)}
                    mobileWelcomePending={mobileWelcomePending}
                    onMobileWelcomeDismissed={handleMobileWelcomeDismissed}
                    onboardingOpen={onboardingOpen}
                    highlightAtmStrikeRow={onboardingOpen && onboardingCurrentStep.id === "chain"}
                    focusTarget={focusTarget}
                    onFocusTargetChange={triggerFocusTarget}
                />
            </div>

            <ErrorToast message={error} onDismiss={() => setError(null)} />

            {!assistantOpen && assistantHasSession && (
                <button
                    type="button"
                    onClick={() => {
                        setAssistantHasSession(true);
                        setAssistantOpen(true);
                    }}
                    className={`continue-chat-pulse fixed top-1 right-1 z-[75] inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] ${themeMode === "light"
                        ? "border-[#80abd2] bg-[#e7f2ff] text-[#1f67ad] shadow-[0_0_10px_rgba(82,141,199,0.24)] hover:border-[#4a90d9] hover:text-[#0f528d]"
                        : "border-[#2f6ea9] bg-[#0c1b31]/95 text-[#b9ddff] shadow-[0_0_18px_rgba(71,181,255,0.35)] hover:border-[#47b5ff] hover:text-white"
                        }`}
                >
                    <Image
                        src="/ai-chat-icon.svg"
                        alt="OpBit bot"
                        width={16}
                        height={16}
                        className="h-4 w-4 shrink-0"
                    />
                    Continue chatting
                </button>
            )}

            <AssistantPanel
                isOpen={assistantOpen}
                onClose={() => {
                    setAssistantHasSession(true);
                    setAssistantOpen(false);
                }}
                uiContext={assistantContext}
                onRunAction={handleAssistantAction}
                themeMode={themeMode}
                onMinimizeRequest={(target) => {
                    setAssistantHasSession(true);
                    setAssistantOpen(false);
                    triggerFocusTarget(target ?? null);
                }}
            />

            <OnboardingTour
                isOpen={onboardingOpen && !mobileWelcomePending}
                steps={ONBOARDING_STEPS}
                currentIndex={onboardingStepIndex}
                themeMode={themeMode}
                nextDisabled={onboardingNextDisabled}
                nextHint={
                    onboardingNeedsContractSelection
                        ? "Select the highlighted contract row to continue."
                        : onboardingNeedsPresetSelection
                            ? "Select at least one preset to continue."
                            : undefined
                }
                onNext={handleOnboardingNext}
                onBack={handleOnboardingBack}
                onSkip={closeOnboarding}
                onFinish={closeOnboarding}
            />

            {panopticConfirmOpen && (
                <div className="fixed inset-x-0 top-[42px] bottom-0 z-[180]" onClick={handleCancelPanopticVenue}>
                    <div className="absolute inset-0 bg-[rgba(4,9,16,0.82)] backdrop-blur-[1px]" />
                    <div
                        onClick={(event) => event.stopPropagation()}
                        className={`relative z-[181] mx-auto mt-[8vh] w-[min(90vw,540px)] rounded-md border px-4 py-3 shadow-[0_0_34px_rgba(55,150,255,0.24)] ${themeMode === "light"
                            ? "border-[#8cb7df] bg-[#f2f8ff] text-[#1f4568]"
                            : "border-[#2f5275] bg-[#081428] text-[#bed8f2]"
                            }`}
                    >
                        <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#47b5ff]">
                            Panoptic Notice
                        </div>
                        <h3
                            className={`mt-1.5 text-[19px] font-semibold leading-tight ${themeMode === "light" ? "text-[#0c3b66]" : "text-[#e6f4ff]"
                                }`}
                        >
                            Panoptic is liquidity-only
                        </h3>
                        <p className="mt-2 text-[14px] leading-relaxed">
                            Panoptic currently provides on-chain liquidity and pool data, not centralized orderbook quotes.
                            Because it is built on Uniswap-style AMM liquidity, direct executable bid/ask quotes are often unavailable.
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed">
                            BEST mode does not work for Panoptic-only liquidity data. For quote comparison and execution-style pricing, keep Deribit, Aevo, or Lyra enabled.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleConfirmPanopticVenue}
                                className={`rounded border px-3.5 py-1.5 text-[12px] font-mono transition-colors ${themeMode === "light"
                                    ? "border-[#2d80c3] bg-[#d9edff] text-[#0d4f86] hover:bg-[#cae5ff]"
                                    : "border-[#2a6ea0] bg-[#0d2a45] text-[#b8e3ff] hover:bg-[#123354]"
                                    }`}
                            >
                                Continue to Panoptic
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelPanopticVenue}
                                className={`rounded border px-3.5 py-1.5 text-[12px] font-mono transition-colors ${themeMode === "light"
                                    ? "border-[#9bbad8] bg-[#eff6ff] text-[#2c5b83] hover:bg-[#e6f1ff]"
                                    : "border-[#35506d] bg-[#0b1828] text-[#95b8d7] hover:bg-[#102033]"
                                    }`}
                            >
                                Stay on current venues
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CryptoTickerBar />
        </div>
    );
}
