const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const BACKOFF_STEPS = [250, 500, 1000];
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface HttpRequestOptions {
    timeoutMs?: number;
    maxRetries?: number;
    headers?: Record<string, string>;
    throttleKey?: string;
    minIntervalMs?: number;
}

const throttleState = new Map<string, number>();

async function applyThrottle(throttleKey?: string, minIntervalMs = 0): Promise<void> {
    if (!throttleKey || minIntervalMs <= 0) return;

    const now = Date.now();
    const nextAllowedAt = throttleState.get(throttleKey) ?? 0;
    const waitMs = Math.max(0, nextAllowedAt - now);
    if (waitMs > 0) {
        await sleep(waitMs);
    }

    throttleState.set(throttleKey, Date.now() + minIntervalMs);
}

export async function fetchWithRetry(
    url: string,
    init: RequestInit,
    options: HttpRequestOptions = {}
): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? MAX_RETRIES;

    const headers = new Headers(init.headers ?? {});
    if (!headers.has("User-Agent")) {
        headers.set("User-Agent", "OpBit-OptionsTerminal/2.0");
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await applyThrottle(options.throttleKey, options.minIntervalMs);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...init,
                headers,
                signal: controller.signal,
            });

            if (RETRY_STATUS_CODES.has(response.status) && attempt < maxRetries) {
                await sleep(BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)]);
                continue;
            }

            return response;
        } catch (error: unknown) {
            if (attempt >= maxRetries) {
                const message = error instanceof Error ? error.message : "Unknown fetch error";
                throw new Error(`Request failed after ${maxRetries + 1} attempts: ${message}`);
            }
            await sleep(BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)]);
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error("Unreachable retry state");
}

export async function requestJSON<T>(
    url: string,
    init: RequestInit,
    options: HttpRequestOptions = {}
): Promise<T> {
    const response = await fetchWithRetry(url, init, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    return response.json() as Promise<T>;
}

export async function getJSON<T>(
    url: string,
    options: HttpRequestOptions = {}
): Promise<T> {
    return requestJSON<T>(
        url,
        {
            method: "GET",
            headers: options.headers,
        },
        options
    );
}

export async function postJSON<TResponse, TBody extends object | unknown[]>(
    url: string,
    body: TBody,
    options: HttpRequestOptions = {}
): Promise<TResponse> {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
    };

    return requestJSON<TResponse>(
        url,
        {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        },
        options
    );
}

// Backward compatibility for existing imports.
export async function fetchJSON<T>(
    url: string,
    options: HttpRequestOptions = {}
): Promise<T> {
    return getJSON<T>(url, options);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

