import { create } from "zustand";
import { StrategyLeg, StrategyScenario } from "./StrategyTypes";

interface StrategyBuilderState {
    legs: StrategyLeg[];
    underlying: string;
    spot: number;
    executionMode: "BEST" | "MID" | "CUSTOM";
    scenario: StrategyScenario;
    drawerOpen: boolean;

    // Actions
    addLeg: (leg: StrategyLeg) => void;
    addLegs: (legs: StrategyLeg[]) => void;
    setLegs: (legs: StrategyLeg[]) => void;
    removeLeg: (id: string) => void;
    updateLeg: (id: string, patch: Partial<StrategyLeg>) => void;
    updateLegMark: (contractKey: string, mark: number) => void;
    clearAll: () => void;
    setScenario: (patch: Partial<StrategyScenario>) => void;
    setSpot: (spot: number) => void;
    setUnderlying: (underlying: string) => void;
    toggleDrawer: () => void;
    openDrawer: () => void;
}

const DEFAULT_SCENARIO: StrategyScenario = {
    spotShiftPct: 0,
    volShiftPct: 0,
    daysForward: 0,
};

function normalizeLoadedLegPricing(legs: StrategyLeg[]): { legs: StrategyLeg[]; changed: boolean } {
    let changed = false;
    const normalized = legs.map((leg) => {
        const validEntry = Number.isFinite(leg.entryPrice) && leg.entryPrice >= 0;
        const validMark = leg.currentMark != null && Number.isFinite(leg.currentMark) && leg.currentMark >= 0;

        if (validEntry && (leg.entryPrice > 0 || !validMark || leg.currentMark === 0)) {
            return leg;
        }

        if (validMark) {
            changed = true;
            return { ...leg, entryPrice: leg.currentMark as number };
        }

        return leg;
    });

    return { legs: normalized, changed };
}

function loadLegsFromStorage(): StrategyLeg[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem("opbit-strategy-legs");
        if (raw) {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const normalized = normalizeLoadedLegPricing(parsed as StrategyLeg[]);
            if (normalized.changed) {
                localStorage.setItem("opbit-strategy-legs", JSON.stringify(normalized.legs));
            }
            return normalized.legs;
        }
    } catch { /* ignore */ }
    return [];
}

function persistLegs(legs: StrategyLeg[]): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem("opbit-strategy-legs", JSON.stringify(legs));
    } catch { /* ignore */ }
}

export const useStrategyBuilderStore = create<StrategyBuilderState>((set) => ({
    legs: loadLegsFromStorage(),
    underlying: "BTC",
    spot: 0,
    executionMode: "BEST",
    scenario: { ...DEFAULT_SCENARIO },
    drawerOpen: false,

    addLeg: (leg) =>
        set((state) => {
            const next = [...state.legs, leg];
            persistLegs(next);
            return { legs: next, drawerOpen: true };
        }),

    addLegs: (newLegs) =>
        set((state) => {
            const next = [...state.legs, ...newLegs];
            persistLegs(next);
            return { legs: next, drawerOpen: true };
        }),

    setLegs: (newLegs) => {
        persistLegs(newLegs);
        set({ legs: newLegs, drawerOpen: true });
    },

    removeLeg: (id) =>
        set((state) => {
            const next = state.legs.filter((l) => l.id !== id);
            persistLegs(next);
            return { legs: next };
        }),

    updateLeg: (id, patch) =>
        set((state) => {
            const next = state.legs.map((l) =>
                l.id === id ? { ...l, ...patch } : l
            );
            persistLegs(next);
            return { legs: next };
        }),

    updateLegMark: (contractKey, mark) =>
        set((state) => {
            let changed = false;
            const next = state.legs.map((l) => {
                if (l.contractKey === contractKey && l.currentMark !== mark) {
                    changed = true;
                    return { ...l, currentMark: mark };
                }
                return l;
            });
            if (!changed) return state;
            return { legs: next };
        }),

    clearAll: () => {
        persistLegs([]);
        set({ legs: [], scenario: { ...DEFAULT_SCENARIO } });
    },

    setScenario: (patch) =>
        set((state) => ({
            scenario: { ...state.scenario, ...patch },
        })),

    setSpot: (spot) => set({ spot }),
    setUnderlying: (underlying) => set({ underlying }),

    toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
    openDrawer: () => set({ drawerOpen: true }),
}));
