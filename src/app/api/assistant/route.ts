import { NextRequest, NextResponse } from "next/server";
import { OPBIT_ASSISTANT_SYSTEM_PROMPT } from "@/src/assistant/systemPrompt";
import {
    AssistantJson,
    extractFirstJsonObject,
    validateAssistantJson,
} from "@/src/assistant/validateAssistantJson";

export const dynamic = "force-dynamic";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface AssistantRequestBody {
    messages: ChatMessage[];
    uiContext: unknown;
}

interface GeminiPart {
    text?: string;
}

interface GeminiCandidate {
    content?: {
        parts?: GeminiPart[];
    };
}

interface GeminiResponse {
    candidates?: GeminiCandidate[];
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

const PRIMARY_MODEL = "gemini-3-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const ALL_MODELS = [PRIMARY_MODEL, ...FALLBACK_MODELS];
const OPENROUTER_MODEL = "google/gemini-3-flash";
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const USER_SAFE_WARNING = "Educational only. Not investment advice. Paper trade before live execution.";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const modelCache = new Map<string, { models: string[]; expiresAt: number }>();

interface GeminiModelEntry {
    name?: string;
    supportedGenerationMethods?: string[];
}

interface GeminiListModelsResponse {
    models?: GeminiModelEntry[];
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

interface OpenRouterChoice {
    message?: {
        content?: string | Array<{ type?: string; text?: string }>;
    };
}

interface OpenRouterResponse {
    choices?: OpenRouterChoice[];
    error?: {
        code?: number;
        message?: string;
        metadata?: unknown;
    };
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

function dedupeActions(actions: AssistantJson["actions"]): AssistantJson["actions"] {
    const seen = new Set<string>();
    return actions.filter((action) => {
        const key = `${action.type}|${stableValueKey(action.value)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

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

function parseOptionRight(value: unknown): "C" | "P" | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === "C" || normalized === "CALL") return "C";
    if (normalized === "P" || normalized === "PUT") return "P";
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

function collapseLegActionsToPreset(actions: AssistantJson["actions"]): AssistantJson["actions"] {
    if (actions.some((action) => action.type === "openStrategyPreset")) return actions;

    const legActions = actions.filter((action) => action.type === "addLegToStrategy");
    if (legActions.length < 2) return actions;

    let hasBuyPut = false;
    let hasSellPut = false;
    let hasBuyCall = false;
    let hasSellCall = false;
    const buyPutStrikes: number[] = [];
    const sellPutStrikes: number[] = [];
    const buyCallStrikes: number[] = [];
    const sellCallStrikes: number[] = [];

    for (const action of legActions) {
        const payload = asRecord(action.value);
        if (!payload) continue;
        const side = parseExecutionIntent(payload.side);
        const right =
            parseOptionRight(payload.right) ??
            parseOptionRight(payload.optionType) ??
            parseOptionRight(payload.contractType) ??
            parseOptionRight(payload.side);
        if (!side || !right) continue;
        if (right === "P" && side === "BUY") hasBuyPut = true;
        if (right === "P" && side === "SELL") hasSellPut = true;
        if (right === "C" && side === "BUY") hasBuyCall = true;
        if (right === "C" && side === "SELL") hasSellCall = true;
        const strike = parseNumeric(payload.strike);
        if (strike != null && right === "P") {
            if (side === "BUY") buyPutStrikes.push(strike);
            if (side === "SELL") sellPutStrikes.push(strike);
        }
        if (strike != null && right === "C") {
            if (side === "BUY") buyCallStrikes.push(strike);
            if (side === "SELL") sellCallStrikes.push(strike);
        }
    }

    let preset:
        | "IRON_CONDOR"
        | "BEAR_PUT_SPREAD"
        | "BULL_PUT_SPREAD"
        | "BULL_CALL_SPREAD"
        | "BEAR_CALL_SPREAD"
        | null = null;
    if (hasBuyPut && hasSellPut && hasBuyCall && hasSellCall) {
        preset = "IRON_CONDOR";
    } else if (hasBuyPut && hasSellPut) {
        if (buyPutStrikes.length > 0 && sellPutStrikes.length > 0) {
            const maxBuyStrike = Math.max(...buyPutStrikes);
            const maxSellStrike = Math.max(...sellPutStrikes);
            preset = maxSellStrike > maxBuyStrike ? "BULL_PUT_SPREAD" : "BEAR_PUT_SPREAD";
        } else {
            preset = "BEAR_PUT_SPREAD";
        }
    } else if (hasBuyCall && hasSellCall) {
        if (buyCallStrikes.length > 0 && sellCallStrikes.length > 0) {
            const maxBuyStrike = Math.max(...buyCallStrikes);
            const maxSellStrike = Math.max(...sellCallStrikes);
            preset = maxSellStrike > maxBuyStrike ? "BULL_CALL_SPREAD" : "BEAR_CALL_SPREAD";
        } else {
            preset = "BULL_CALL_SPREAD";
        }
    }
    if (!preset) return actions;

    const next: AssistantJson["actions"] = [];
    let injected = false;
    for (const action of actions) {
        if (action.type === "addLegToStrategy") {
            if (!injected) {
                next.push({ type: "openStrategyPreset", value: { preset } });
                injected = true;
            }
            continue;
        }
        next.push(action);
    }

    return next;
}

function safeAssistantError(reply: string): AssistantJson {
    return {
        reply,
        actions: [{ type: "openPanel", value: "CHAIN" }],
        warnings: [],
    };
}

function toUserSafeWarnings(warnings: string[] | undefined): string[] {
    if (!Array.isArray(warnings) || warnings.length === 0) return [];
    return [USER_SAFE_WARNING];
}

function toUserSafeResponse(response: AssistantJson): AssistantJson {
    return {
        ...response,
        warnings: toUserSafeWarnings(response.warnings),
    };
}

function extractLatestUserMessage(messages: ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === "user") {
            return messages[i].content.trim();
        }
    }
    return "";
}

function extractUiUnderlying(uiContext: unknown): string | null {
    if (typeof uiContext !== "object" || uiContext == null) return null;
    const root = uiContext as Record<string, unknown>;
    const market = root.market;
    if (typeof market !== "object" || market == null) return null;
    const underlying = (market as Record<string, unknown>).underlying;
    if (typeof underlying !== "string") return null;
    const normalized = underlying.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
}

function extractUiIbitMarketState(uiContext: unknown): string | null {
    if (typeof uiContext !== "object" || uiContext == null) return null;
    const root = uiContext as Record<string, unknown>;
    const market = root.market;
    if (typeof market !== "object" || market == null) return null;
    const state = (market as Record<string, unknown>).ibitMarketState;
    if (typeof state !== "string") return null;
    const normalized = state.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
}

function isMispricingVenueQuestion(text: string): boolean {
    const hasMispricingIntent = /\b(mispric|arbitrage|arb)\w*/.test(text);
    const hasVenueIntent = /\b(which exchange|which venue|exchange|venue|higher chance|best)\b/.test(text);
    return hasMispricingIntent && hasVenueIntent;
}

function maybeHandleMispricingVenueQuestion(messages: ChatMessage[], uiContext: unknown): AssistantJson | null {
    const latest = extractLatestUserMessage(messages).toLowerCase();
    if (!latest || !isMispricingVenueQuestion(latest)) return null;

    const underlying = extractUiUnderlying(uiContext);
    const actions: AssistantJson["actions"] = [{ type: "openPanel", value: "ARBITRAGE" }];

    if (underlying === "IBIT") {
        actions.unshift({ type: "setUnderlying", value: "BTC" });
        return {
            reply:
                "Use cross-venue scan instead of guessing one exchange. For IBIT, switch to BTC (or ETH), keep Deribit + Aevo + Lyra v2 enabled in BEST view, then open ARBITRAGE and press Rescan to see where mispricings are currently appearing.",
            actions,
            warnings: [],
        };
    }

    return {
        reply:
            "Use cross-venue scan instead of guessing one exchange. Keep Deribit + Aevo + Lyra v2 enabled in BEST view, then open ARBITRAGE and press Rescan to see where mispricings are currently appearing.",
        actions,
        warnings: [],
    };
}

function isMarketSessionQuestion(text: string): boolean {
    const asksOpenClosed = /\b(open|opened|close|closed|closing)\b/.test(text);
    const asksHours = /\b(hours|session)\b/.test(text);
    const mentionsMarket = /\b(stock market|market|trading)\b/.test(text);
    return (mentionsMarket && (asksOpenClosed || asksHours)) || /\bis (the )?(stock )?market (open|closed)\b/.test(text);
}

function maybeHandleMarketSessionQuestion(messages: ChatMessage[], uiContext: unknown): AssistantJson | null {
    const latest = extractLatestUserMessage(messages).toLowerCase();
    if (!latest) return null;

    const mentionsIbit = /\bibit\b/.test(latest);
    if (!isMarketSessionQuestion(latest) && !(mentionsIbit && /\b(open|closed|hours|session)\b/.test(latest))) {
        return null;
    }

    const underlying = extractUiUnderlying(uiContext);
    const ibitMarketState = extractUiIbitMarketState(uiContext);

    if (underlying === "IBIT" || mentionsIbit) {
        if (ibitMarketState === "REGULAR") {
            return {
                reply: "IBIT is currently in the regular U.S. market session (open).",
                actions: [],
                warnings: [],
            };
        }
        if (ibitMarketState === "PRE") {
            return {
                reply: "IBIT is currently in pre-market. Liquidity can be thinner than regular hours.",
                actions: [],
                warnings: [],
            };
        }
        if (ibitMarketState === "POST") {
            return {
                reply: "IBIT is currently in after-hours. Liquidity can be thinner than regular hours.",
                actions: [],
                warnings: [],
            };
        }
        if (ibitMarketState === "CLOSED" || ibitMarketState === "PREPRE" || ibitMarketState === "POSTPOST") {
            return {
                reply: "IBIT is currently outside active U.S. stock market trading hours (closed session).",
                actions: [],
                warnings: [],
            };
        }

        return {
            reply: "I can’t confirm the IBIT session state from the current feed right now. Try again in a moment.",
            actions: [],
            warnings: [],
        };
    }

    if (underlying === "BTC" || underlying === "ETH") {
        return {
            reply: `${underlying} trades 24/7, so there is no stock-market close for this selected underlying.`,
            actions: [],
            warnings: [],
        };
    }

    return {
        reply: "I can help check session status for IBIT in this terminal. If you mean the broader stock market, confirm the market or symbol and I’ll guide you.",
        actions: [],
        warnings: [],
    };
}

function extractAllowedExpiries(uiContext: unknown): string[] {
    if (typeof uiContext !== "object" || uiContext == null) return [];
    const root = uiContext as Record<string, unknown>;
    const market = root.market;
    if (typeof market !== "object" || market == null) return [];
    const expiries = (market as Record<string, unknown>).availableExpiries;
    if (!Array.isArray(expiries)) return [];
    return expiries.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function extractSelectedExpiry(uiContext: unknown): string | null {
    if (typeof uiContext !== "object" || uiContext == null) return null;
    const root = uiContext as Record<string, unknown>;
    const selection = root.selection;
    if (typeof selection !== "object" || selection == null) return null;
    const selectedExpiry = (selection as Record<string, unknown>).selectedExpiry;
    return typeof selectedExpiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(selectedExpiry)
        ? selectedExpiry
        : null;
}

function sanitizeAssistantExpiries(response: AssistantJson, uiContext: unknown): AssistantJson {
    const allowedExpiries = extractAllowedExpiries(uiContext);
    if (allowedExpiries.length === 0) {
        const collapsedActions = collapseLegActionsToPreset(response.actions);
        const dedupedActions = dedupeActions(collapsedActions);
        if (dedupedActions.length === response.actions.length) return response;
        return { ...response, actions: dedupedActions };
    }
    const selectedExpiry = extractSelectedExpiry(uiContext);

    let changed = false;
    let removedInvalidSetExpiry = false;
    let replacedInvalidDateText = false;
    const actions = response.actions
        .map((action) => {
            if (action.type !== "setExpiry") return action;
            const requested = String(action.value);
            if (allowedExpiries.includes(requested)) return action;
            changed = true;
            removedInvalidSetExpiry = true;
            return null;
        })
        .filter((action): action is AssistantJson["actions"][number] => action != null);
    const collapsedActions = collapseLegActionsToPreset(actions);
    if (collapsedActions.length !== actions.length) {
        changed = true;
    }
    const dedupedActions = dedupeActions(collapsedActions);
    if (dedupedActions.length !== collapsedActions.length) {
        changed = true;
    }

    const reply = response.reply.replace(DATE_RE, (dateText) => {
        if (allowedExpiries.includes(dateText)) return dateText;
        changed = true;
        replacedInvalidDateText = true;
        return "an available expiry";
    });
    const cleanedReply = replacedInvalidDateText
        ? reply.replace(/[^.\n]*an available expiry[^.\n]*\.\s*/gi, "").trim()
        : reply;
    const finalReply = replacedInvalidDateText
        ? `${cleanedReply || "Use only currently loaded expiries for this market."}\n\nAvailable expiries: ${allowedExpiries
            .slice(0, 8)
            .join(", ")}.`
        : cleanedReply;

    const hasSetExpiryAction = dedupedActions.some((action) => action.type === "setExpiry");
    if (removedInvalidSetExpiry && !hasSetExpiryAction) {
        const fallbackExpiry =
            selectedExpiry && allowedExpiries.includes(selectedExpiry)
                ? selectedExpiry
                : allowedExpiries[0] ?? null;
        if (fallbackExpiry) {
            dedupedActions.push({ type: "setExpiry", value: fallbackExpiry });
            changed = true;
        }
    }

    if (!changed) return response;
    return {
        ...response,
        reply: finalReply,
        actions: dedupedActions,
        warnings: response.warnings,
    };
}

function detectViewAndRisk(messages: ChatMessage[]): { hasView: boolean; hasRisk: boolean } {
    const userText = messages
        .filter((message) => message.role === "user")
        .map((message) => message.content.toLowerCase())
        .join("\n");

    const hasView = /\b(bullish|bearish|sideways|volatile|volatility|neutral|consolidat(?:e|ing|ion)|range[-\s]?bound|choppy|flat)\b/.test(
        userText
    );
    const hasRisk =
        /\b(low\s*risk|medium\s*risk|med\s*risk|high\s*risk|risk\s*tolerance\s*:\s*(low|med|medium|high))\b/.test(userText) ||
        /\b(low|med|medium|high)\s*(risk|risk tolerance|tolerance|risk appetite)\b/.test(userText) ||
        /\b(conservative|cautious|balanced|moderate|aggressive|speculative|risk-averse)\b/.test(userText);

    return { hasView, hasRisk };
}

function maybeHandleQuickCommand(messages: ChatMessage[]): AssistantJson | null {
    const latest = extractLatestUserMessage(messages).toLowerCase();

    if (latest.startsWith("/help")) {
        return {
            reply:
                "I can explain OpBit, walk you through onboarding, and suggest educational strategies linked to clickable actions.",
            actions: [
                { type: "openPanel", value: "CHAIN" },
                { type: "openPanel", value: "SMILE" },
                { type: "openPanel", value: "STRATEGY" },
                { type: "openPanel", value: "ARBITRAGE" },
            ],
            warnings: ["Educational use only. Paper trade before live execution."],
        };
    }

    if (latest.startsWith("/onboard")) {
        return {
            reply:
                "Onboarding (7 steps):\n1) Terminal overview\n2) Underlying + venue controls\n3) Options chain basics\n4) Volatility panel basics\n5) Strategy Builder presets\n6) Arbitrage Scanner button\n7) OpBit AI controls",
            actions: [
                { type: "openPanel", value: "CHAIN" },
                { type: "openPanel", value: "CHAIN" },
                { type: "setExecutionSide", value: "BUY" },
                { type: "openPanel", value: "SMILE" },
                { type: "openPanel", value: "STRATEGY" },
                { type: "openPanel", value: "ARBITRAGE" },
            ],
            warnings: ["Educational only. No profit guarantees."],
        };
    }

    if (latest.startsWith("/strategy") || latest.includes("strategy")) {
        const profile = detectViewAndRisk(messages);
        if (!profile.hasView || !profile.hasRisk) {
            const missing: string[] = [];
            if (!profile.hasView) {
                missing.push("Market view (bullish, bearish, sideways/consolidating, or volatile)");
            }
            if (!profile.hasRisk) {
                missing.push("Risk tolerance (low/med/high or conservative/balanced/aggressive)");
            }
            return {
                reply: `Before I suggest strategies, answer quick question${missing.length > 1 ? "s" : ""}:\n${missing
                    .map((item, index) => `${index + 1}) ${item}`)
                    .join("\n")}`,
                actions: [{ type: "openPanel", value: "CHAIN" }],
                warnings: ["Educational only. Not investment advice."],
            };
        }
    }

    return null;
}

function compactHistory(messages: ChatMessage[], maxMessages = 12): ChatMessage[] {
    if (messages.length <= maxMessages) return messages;
    return messages.slice(messages.length - maxMessages);
}

function makeUserPrompt(messages: ChatMessage[], uiContext: unknown): string {
    const transcript = compactHistory(messages)
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join("\n");

    const contextText = JSON.stringify(uiContext);

    return [
        "Conversation:",
        transcript,
        "",
        "Current OpBit UI context (JSON):",
        contextText,
        "",
        "Platform rule: OpBit does NOT execute orders directly. It is a terminal for cross-exchange comparison, and execution happens on external exchange links.",
        "",
        "Return valid JSON only with keys: reply, actions, warnings.",
        "Do not include code fences.",
    ].join("\n");
}

function extractTextFromGemini(response: GeminiResponse): string {
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) return "";
    return parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();
}

function extractTextFromOpenRouter(response: OpenRouterResponse): string {
    const content = response.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("")
            .trim();
    }
    return "";
}

async function callGemini(model: string, apiKey: string, prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            system_instruction: {
                parts: [{ text: OPBIT_ASSISTANT_SYSTEM_PROMPT }],
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ],
            generationConfig: {
                temperature: 0.4,
                responseMimeType: "application/json",
            },
        }),
    });

    const json = (await res.json()) as GeminiResponse;

    if (!res.ok || json.error) {
        const message = json.error?.message ?? `Gemini request failed (${res.status})`;
        throw new Error(message);
    }

    const text = extractTextFromGemini(json);
    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    return text;
}

async function callOpenRouter(model: string, apiKey: string, prompt: string): Promise<string> {
    const url = "https://openrouter.ai/api/v1/chat/completions";

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: OPBIT_ASSISTANT_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.4,
            response_format: { type: "json_object" },
        }),
    });

    const json = (await res.json()) as OpenRouterResponse;
    if (!res.ok || json.error) {
        const message = json.error?.message ?? `OpenRouter request failed (${res.status})`;
        throw new Error(message);
    }

    const text = extractTextFromOpenRouter(json);
    if (!text) {
        throw new Error("OpenRouter returned an empty response.");
    }

    return text;
}

function sanitizeModelName(name: string): string {
    return name.startsWith("models/") ? name.slice("models/".length) : name;
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
    const now = Date.now();
    const cached = modelCache.get(apiKey);
    if (cached && cached.expiresAt > now) {
        return cached.models;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { method: "GET" });
    const json = (await res.json()) as GeminiListModelsResponse;
    if (!res.ok || json.error) {
        const message = json.error?.message ?? `ListModels failed (${res.status})`;
        throw new Error(message);
    }

    const models = Array.from(
        new Set(
            (json.models ?? [])
                .filter((entry) => {
                    if (!entry.name) return false;
                    return (entry.supportedGenerationMethods ?? []).includes("generateContent");
                })
                .map((entry) => sanitizeModelName(entry.name as string))
        )
    );

    modelCache.set(apiKey, { models, expiresAt: now + MODEL_CACHE_TTL_MS });
    return models;
}

async function resolveModelsForKey(apiKey: string): Promise<string[]> {
    try {
        const available = await listGenerateContentModels(apiKey);
        if (available.length === 0) return ALL_MODELS;

        const preferred = ALL_MODELS.filter((model) => available.includes(model));
        if (preferred.length > 0) return preferred;

        const flash = available.filter((model) => model.includes("flash"));
        if (flash.length > 0) return flash.slice(0, 3);

        return available.slice(0, 3);
    } catch {
        return ALL_MODELS;
    }
}

function getGeminiApiKeys(): string[] {
    const primary = process.env.GEMINI_API_KEY?.trim() ?? "";
    const backup = process.env.GEMINI_API_KEY_BACKUP?.trim() ?? "";
    const keys = [primary, backup].filter((key) => key.length > 0);
    return Array.from(new Set(keys));
}

function getOpenRouterApiKey(): string {
    return (
        process.env.OPENROUTER_API_KEY_BACKUP?.trim() ??
        process.env.OPENROUTER_API_KEY?.trim() ??
        ""
    );
}

async function generateAssistantJson(
    messages: ChatMessage[],
    uiContext: unknown,
    apiKeys: string[],
    openRouterApiKey: string
): Promise<AssistantJson> {
    const prompt = makeUserPrompt(messages, uiContext);
    let lastError = "Unknown Gemini error";

    for (const apiKey of apiKeys) {
        const modelsForKey = await resolveModelsForKey(apiKey);
        let lastRawText = "";
        for (const model of modelsForKey) {
            try {
                const rawText = await callGemini(model, apiKey, prompt);
                lastRawText = rawText;

                const maybeJson = extractFirstJsonObject(rawText);
                const validation = validateAssistantJson(maybeJson);
                if (validation.ok) {
                    return validation.data;
                }

                lastError = `${model}: ${validation.error}`;
            } catch (error) {
                lastError = `${model}: ${error instanceof Error ? error.message : "Request failed"}`;
            }
        }

        // One repair attempt max per key.
        if (lastRawText) {
            try {
                const repairPrompt = [
                    "Repair this into valid JSON only with keys: reply, actions, warnings.",
                    "Do not add extra text.",
                    "Input:",
                    lastRawText,
                ].join("\n");

                const repairModel = modelsForKey[0] ?? PRIMARY_MODEL;
                const repairedText = await callGemini(repairModel, apiKey, repairPrompt);
                const repairedJson = extractFirstJsonObject(repairedText);
                const repairedValidation = validateAssistantJson(repairedJson);
                if (repairedValidation.ok) {
                    return repairedValidation.data;
                }

                lastError = `repair: ${repairedValidation.error}`;
            } catch (error) {
                lastError = `repair: ${error instanceof Error ? error.message : "Repair failed"}`;
            }
        }
    }

    if (openRouterApiKey) {
        let lastRawText = "";
        try {
            const rawText = await callOpenRouter(OPENROUTER_MODEL, openRouterApiKey, prompt);
            lastRawText = rawText;
            const maybeJson = extractFirstJsonObject(rawText);
            const validation = validateAssistantJson(maybeJson);
            if (validation.ok) {
                return validation.data;
            }
            lastError = `${OPENROUTER_MODEL}: ${validation.error}`;
        } catch (error) {
            lastError = `${OPENROUTER_MODEL}: ${error instanceof Error ? error.message : "Request failed"}`;
        }

        if (lastRawText) {
            try {
                const repairPrompt = [
                    "Repair this into valid JSON only with keys: reply, actions, warnings.",
                    "Do not add extra text.",
                    "Input:",
                    lastRawText,
                ].join("\n");

                const repairedText = await callOpenRouter(OPENROUTER_MODEL, openRouterApiKey, repairPrompt);
                const repairedJson = extractFirstJsonObject(repairedText);
                const repairedValidation = validateAssistantJson(repairedJson);
                if (repairedValidation.ok) {
                    return repairedValidation.data;
                }
                lastError = `openrouter-repair: ${repairedValidation.error}`;
            } catch (error) {
                lastError = `openrouter-repair: ${error instanceof Error ? error.message : "Repair failed"}`;
            }
        }
    }

    throw new Error(lastError);
}

export async function POST(request: NextRequest) {
    let body: AssistantRequestBody;
    try {
        body = (await request.json()) as AssistantRequestBody;
    } catch {
        return NextResponse.json(
            safeAssistantError("Invalid assistant request payload."),
            { status: 400 }
        );
    }

    const messages = Array.isArray(body.messages)
        ? body.messages.filter(
            (message): message is ChatMessage =>
                (message.role === "user" || message.role === "assistant") && typeof message.content === "string"
        )
        : [];

    if (messages.length === 0) {
        return NextResponse.json(
            safeAssistantError("Send a message to start the assistant."),
            { status: 400 }
        );
    }

    const quick = maybeHandleQuickCommand(messages);
    if (quick) {
        return NextResponse.json(toUserSafeResponse(quick));
    }

    const mispricingVenueReply = maybeHandleMispricingVenueQuestion(messages, body.uiContext ?? {});
    if (mispricingVenueReply) {
        return NextResponse.json(toUserSafeResponse(mispricingVenueReply));
    }

    const marketSessionReply = maybeHandleMarketSessionQuestion(messages, body.uiContext ?? {});
    if (marketSessionReply) {
        return NextResponse.json(toUserSafeResponse(marketSessionReply));
    }

    const apiKeys = getGeminiApiKeys();
    const openRouterApiKey = getOpenRouterApiKey();
    if (apiKeys.length === 0 && !openRouterApiKey) {
        return NextResponse.json(
            safeAssistantError(
                "Assistant is unavailable because AI API keys are not configured on the server."
            ),
            { status: 500 }
        );
    }

    try {
        const response = await generateAssistantJson(messages, body.uiContext ?? {}, apiKeys, openRouterApiKey);
        const sanitized = sanitizeAssistantExpiries(response, body.uiContext ?? {});
        return NextResponse.json(toUserSafeResponse(sanitized));
    } catch {
        return NextResponse.json(
            safeAssistantError(
                "I could not generate a structured assistant response right now. Try again in a moment."
            ),
            { status: 502 }
        );
    }
}
