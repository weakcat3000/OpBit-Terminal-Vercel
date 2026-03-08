export type AssistantActionType =
    | "setUnderlying"
    | "setExpiry"
    | "jumpToStrike"
    | "highlightContract"
    | "openPanel"
    | "openStrategyPreset"
    | "addLegToStrategy"
    | "setExecutionSide";

export interface AssistantAction {
    type: AssistantActionType;
    value: string | number | Record<string, unknown>;
}

export interface AssistantJson {
    reply: string;
    actions: AssistantAction[];
    warnings?: string[];
}

const ACTION_TYPES = new Set<AssistantActionType>([
    "setUnderlying",
    "setExpiry",
    "jumpToStrike",
    "highlightContract",
    "openPanel",
    "openStrategyPreset",
    "addLegToStrategy",
    "setExecutionSide",
]);
const TOP_LEVEL_KEYS = new Set(["reply", "actions", "warnings"]);
const ACTION_KEYS = new Set(["type", "value"]);

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAction(value: unknown): value is AssistantAction {
    if (!isObject(value)) return false;
    const keys = Object.keys(value);
    if (keys.some((key) => !ACTION_KEYS.has(key))) return false;
    if (typeof value.type !== "string") return false;
    if (!ACTION_TYPES.has(value.type as AssistantActionType)) return false;

    const actionValue = value.value;
    if (typeof actionValue === "string") return true;
    if (typeof actionValue === "number" && Number.isFinite(actionValue)) return true;
    if (isObject(actionValue)) return true;
    return false;
}

export function extractFirstJsonObject(text: string): unknown | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
        return JSON.parse(trimmed);
    } catch {
        // Try to salvage first top-level JSON object.
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}

export function validateAssistantJson(raw: unknown):
    | { ok: true; data: AssistantJson }
    | { ok: false; error: string } {
    if (!isObject(raw)) {
        return { ok: false, error: "Response is not an object." };
    }
    const topKeys = Object.keys(raw);
    if (topKeys.some((key) => !TOP_LEVEL_KEYS.has(key))) {
        return { ok: false, error: "Unexpected top-level key in assistant response." };
    }

    if (typeof raw.reply !== "string" || raw.reply.trim().length === 0) {
        return { ok: false, error: "Missing non-empty reply string." };
    }

    if (!Array.isArray(raw.actions)) {
        return { ok: false, error: "Missing actions array." };
    }

    const actions: AssistantAction[] = [];
    for (const action of raw.actions) {
        if (!isAction(action)) {
            return { ok: false, error: "Invalid action object in actions array." };
        }
        actions.push(action);
    }

    const warnings = raw.warnings;
    if (warnings != null) {
        if (!Array.isArray(warnings) || warnings.some((w) => typeof w !== "string")) {
            return { ok: false, error: "warnings must be an array of strings when provided." };
        }
    }

    return {
        ok: true,
        data: {
            reply: raw.reply,
            actions,
            warnings: warnings as string[] | undefined,
        },
    };
}
