import { NextRequest, NextResponse } from "next/server";
import { fetchWithRetry, getJSON } from "@/src/core/utils/http";
import { TTLCache } from "@/src/core/utils/cache";
import { env } from "@/src/core/config/env";

export const dynamic = "force-dynamic";

const newsCache = new TTLCache();
const NEWSAPI_COOLDOWN_MS = 15 * 60 * 1000;
let newsApiBackoffUntilMs = 0;

type Underlying = "BTC" | "ETH" | "IBIT";

interface NewsApiArticle {
    source?: { id?: string | null; name?: string | null };
    author?: string | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    urlToImage?: string | null;
    publishedAt?: string | null;
    content?: string | null;
}

interface NewsApiResponse {
    status: "ok" | "error";
    totalResults?: number;
    articles?: NewsApiArticle[];
    code?: string;
    message?: string;
}

interface FreeCryptoArticle {
    title?: string;
    link?: string;
    description?: string;
    pubDate?: string;
    source?: string;
    sourceKey?: string;
}

interface FreeCryptoResponse {
    articles?: FreeCryptoArticle[];
}

interface LiveNewsItem {
    id: string;
    title: string;
    description: string;
    publishedAt: string;
    sourceName: string;
    sourceUrl: string | null;
    imageUrl: string | null;
    symbols: string[];
    isBreaking?: boolean;
}

const LOW_SIGNAL_PHRASES = [
    "song",
    "songs",
    "tribute",
    "meme",
    "airdrop",
    "giveaway",
    "prediction contest",
    "weekly roundup",
    "podcast",
    "opinion",
    "idea:",
    "satire",
];

const LOW_SIGNAL_SOURCES = [
    "stacker news",
    "tradingview crypto ideas",
    "opinion",
];

const CRYPTO_TERMS = [
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "crypto",
    "cryptocurrency",
    "ibit",
    "etf",
    "defi",
];

const BTC_FOCUS_TERMS = ["bitcoin", "btc", "ibit", "spot bitcoin etf", "strategy", "microstrategy"];
const ETH_FOCUS_TERMS = ["ethereum", "eth", "defi", "staking", "layer 2", "rollup", "etf"];
const IBIT_FOCUS_TERMS = ["ibit", "ishares", "blackrock", "spot bitcoin etf", "bitcoin etf"];

const MAJOR_POLITICAL_TERMS = [
    "election",
    "president",
    "congress",
    "senate",
    "parliament",
    "white house",
    "federal reserve",
    "fed",
    "fomc",
    "cpi",
    "inflation",
    "interest rate",
    "treasury",
    "sanction",
    "war",
    "ceasefire",
    "geopolitical",
    "sec",
];

const MAJOR_POLITICAL_SOURCES = [
    "reuters",
    "bloomberg",
    "associated press",
    "ap news",
    "financial times",
    "wall street journal",
    "new york times",
    "washington post",
    "bbc",
    "cnn",
];

const MAJOR_POLITICAL_DOMAINS = [
    "reuters.com",
    "bloomberg.com",
    "apnews.com",
    "ft.com",
    "wsj.com",
    "nytimes.com",
    "washingtonpost.com",
    "bbc.com",
    "cnn.com",
];

const PREFERRED_CRYPTO_SOURCES = [
    "bloomberg",
    "investing.com",
    "reuters",
    "coindesk",
    "cointelegraph",
];

const PREFERRED_CRYPTO_DOMAINS = [
    "bloomberg.com",
    "investing.com",
    "reuters.com",
    "coindesk.com",
    "cointelegraph.com",
];

const BREAKING_IMPACT_TERMS = [
    "breaking",
    "surge",
    "plunge",
    "crash",
    "approval",
    "ban",
    "sanction",
    "fomc",
    "fed",
    "cpi",
    "interest rate",
    "war",
    "ceasefire",
    "hack",
    "exploit",
    "etf inflow",
    "etf outflow",
];

const RSS_ACCEPT_HEADER = "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5";

interface RssSourceConfig {
    key: string;
    sourceName: string;
    sourceUrl: string;
    url: string;
}

function normalizeUnderlying(raw: string | null): Underlying {
    const value = (raw ?? "BTC").trim().toUpperCase();
    if (value === "ETH") return "ETH";
    if (value === "IBIT") return "IBIT";
    return "BTC";
}

function clampLimit(raw: string | null): number {
    const parsed = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.max(10, Math.min(parsed, 100));
}

function toIsoHoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function containsAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
}

function getDomain(url: string | null): string {
    if (!url) return "";
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

function sourceIsMajor(item: LiveNewsItem): boolean {
    const source = item.sourceName.toLowerCase();
    if (containsAny(source, MAJOR_POLITICAL_SOURCES)) return true;
    const domain = getDomain(item.sourceUrl);
    return MAJOR_POLITICAL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function sourceIsPreferredCrypto(item: LiveNewsItem): boolean {
    const source = item.sourceName.toLowerCase();
    if (containsAny(source, PREFERRED_CRYPTO_SOURCES)) return true;
    const domain = getDomain(item.sourceUrl);
    return PREFERRED_CRYPTO_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function isMajorPolitical(item: LiveNewsItem): boolean {
    const text = `${item.title} ${item.description}`.toLowerCase();
    return containsAny(text, MAJOR_POLITICAL_TERMS) && sourceIsMajor(item);
}

function isLowSignal(item: LiveNewsItem): boolean {
    const source = item.sourceName.toLowerCase();
    const text = `${item.title} ${item.description}`.toLowerCase();
    return containsAny(source, LOW_SIGNAL_SOURCES) || containsAny(text, LOW_SIGNAL_PHRASES);
}

function isCryptoRelevant(item: LiveNewsItem): boolean {
    const text = `${item.title} ${item.description}`.toLowerCase();
    const symbols = item.symbols.map((s) => s.toUpperCase());
    return containsAny(text, CRYPTO_TERMS) || symbols.some((s) => s === "BTC" || s === "ETH" || s === "IBIT");
}

function focusTermsForUnderlying(underlying: Underlying): string[] {
    if (underlying === "ETH") return ETH_FOCUS_TERMS;
    if (underlying === "IBIT") return IBIT_FOCUS_TERMS;
    return BTC_FOCUS_TERMS;
}

function focusSymbolsForUnderlying(underlying: Underlying): string[] {
    if (underlying === "ETH") return ["ETH"];
    if (underlying === "IBIT") return ["IBIT", "BTC"];
    return ["BTC", "IBIT"];
}

function hasUnderlyingFocus(underlying: Underlying, item: LiveNewsItem): boolean {
    const text = `${item.title} ${item.description}`.toLowerCase();
    if (containsAny(text, focusTermsForUnderlying(underlying))) return true;
    const symbols = new Set(item.symbols.map((s) => s.toUpperCase()));
    return focusSymbolsForUnderlying(underlying).some((symbol) => symbols.has(symbol));
}

function scoreItem(underlying: Underlying, item: LiveNewsItem): number {
    const text = `${item.title} ${item.description}`.toLowerCase();
    const publishedMs = Date.parse(item.publishedAt);
    const ageMinutes = Number.isFinite(publishedMs)
        ? Math.max(0, (Date.now() - publishedMs) / 60000)
        : 1_000_000;

    let score = 0;
    if (ageMinutes <= 10) score += 7;
    else if (ageMinutes <= 30) score += 5;
    else if (ageMinutes <= 120) score += 3;
    else if (ageMinutes <= 360) score += 1;

    if (containsAny(text, focusTermsForUnderlying(underlying))) score += 5;
    if (isCryptoRelevant(item)) score += 3;
    if (isMajorPolitical(item)) score += 4;
    if (sourceIsPreferredCrypto(item)) score += 4;
    if (sourceIsMajor(item)) score += 1;

    return score;
}

function normalizeNewsApiArticle(article: NewsApiArticle, index: number, sourcePrefix: string): LiveNewsItem | null {
    const title = article.title?.trim();
    const publishedAt = article.publishedAt?.trim();
    if (!title || !publishedAt) return null;

    const parsedMs = Date.parse(publishedAt);
    if (!Number.isFinite(parsedMs)) return null;

    const description = (article.description ?? article.content ?? "").trim();
    const sourceName = article.source?.name?.trim() || "Newswire";
    const sourceUrl = article.url?.trim() || null;
    const text = `${title} ${description}`.toLowerCase();
    const symbols: string[] = [];

    if (/\bbitcoin\b|\bbtc\b/.test(text)) symbols.push("BTC");
    if (/\bethereum\b|\beth\b/.test(text)) symbols.push("ETH");
    if (/\bibit\b|\bblackrock\b|\bishares\b/.test(text)) symbols.push("IBIT");

    return {
        id: `${sourcePrefix}-${index}-${parsedMs}-${sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title,
        description,
        publishedAt: new Date(parsedMs).toISOString(),
        sourceName,
        sourceUrl,
        imageUrl: article.urlToImage?.trim() || null,
        symbols,
    };
}

function normalizeFreeArticle(article: FreeCryptoArticle, index: number): LiveNewsItem | null {
    if (!article.title || !article.pubDate) return null;
    const parsed = Date.parse(article.pubDate);
    if (!Number.isFinite(parsed)) return null;

    const description = article.description?.trim() ?? "";
    const sourceName = article.source?.trim() || "Crypto Wire";
    const text = `${article.title} ${description}`.toLowerCase();
    const symbols: string[] = [];
    if (/\bbitcoin\b|\bbtc\b/.test(text)) symbols.push("BTC");
    if (/\bethereum\b|\beth\b/.test(text)) symbols.push("ETH");
    if (/\bibit\b/.test(text)) symbols.push("IBIT");

    return {
        id: `free-${article.sourceKey ?? "src"}-${index}-${parsed}`,
        title: article.title.trim(),
        description,
        publishedAt: new Date(parsed).toISOString(),
        sourceName,
        sourceUrl: article.link?.trim() || null,
        imageUrl: null,
        symbols,
    };
}

function decodeXmlEntities(raw: string): string {
    return raw
        .replace(/<!\[CDATA\[/g, "")
        .replace(/\]\]>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(raw: string): string {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractXmlTag(block: string, tagName: string): string | null {
    const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const match = block.match(pattern);
    if (!match?.[1]) return null;
    return decodeXmlEntities(match[1]).trim();
}

function normalizeRssArticle(itemBlock: string, index: number, sourcePrefix: string, fallbackSourceName: string): LiveNewsItem | null {
    const title = stripHtmlTags(extractXmlTag(itemBlock, "title") ?? "");
    const publishedAtRaw = extractXmlTag(itemBlock, "pubDate") ?? extractXmlTag(itemBlock, "published") ?? "";
    if (!title || !publishedAtRaw) return null;

    const parsedMs = Date.parse(publishedAtRaw);
    if (!Number.isFinite(parsedMs)) return null;

    const description = stripHtmlTags(extractXmlTag(itemBlock, "description") ?? extractXmlTag(itemBlock, "content:encoded") ?? "");
    const sourceUrl = (extractXmlTag(itemBlock, "link") ?? "").trim() || null;
    const sourceName = stripHtmlTags(extractXmlTag(itemBlock, "source") ?? fallbackSourceName).trim() || fallbackSourceName;
    const text = `${title} ${description}`.toLowerCase();
    const symbols: string[] = [];
    if (/\bbitcoin\b|\bbtc\b/.test(text)) symbols.push("BTC");
    if (/\bethereum\b|\beth\b/.test(text)) symbols.push("ETH");
    if (/\bibit\b|\bblackrock\b|\bishares\b/.test(text)) symbols.push("IBIT");

    return {
        id: `${sourcePrefix}-${index}-${parsedMs}`,
        title,
        description,
        publishedAt: new Date(parsedMs).toISOString(),
        sourceName,
        sourceUrl,
        imageUrl: null,
        symbols,
    };
}

function canonicalTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function dedupe(items: LiveNewsItem[]): LiveNewsItem[] {
    const seen = new Set<string>();
    const out: LiveNewsItem[] = [];
    for (const item of items) {
        const key = `${canonicalTitle(item.title)}|${getDomain(item.sourceUrl)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function applyBreakingFlags(items: LiveNewsItem[]): LiveNewsItem[] {
    const scored = items.map((item, idx) => {
        const text = `${item.title} ${item.description}`.toLowerCase();
        const publishedMs = Date.parse(item.publishedAt);
        const ageMin = Number.isFinite(publishedMs) ? Math.max(0, (Date.now() - publishedMs) / 60000) : 1_000_000;
        const impact = containsAny(text, BREAKING_IMPACT_TERMS);
        const major = sourceIsMajor(item);

        let score = 0;
        if (impact) score += 5;
        if (major) score += 2;
        if (ageMin <= 10) score += 4;
        else if (ageMin <= 30) score += 3;
        else if (ageMin <= 60) score += 2;

        const candidate = ageMin <= 90 && impact && (major || /\b(etf|fed|fomc|cpi|sec|war|sanction|election)\b/.test(text));
        return { idx, score, candidate };
    });

    const top = scored
        .filter((row) => row.candidate)
        .sort((a, b) => b.score - a.score || a.idx - b.idx)
        .slice(0, 3);
    const allowed = new Set(top.map((row) => row.idx));

    return items.map((item, idx) => ({
        ...item,
        isBreaking: allowed.has(idx),
    }));
}

function cryptoQueryFor(underlying: Underlying): string {
    if (underlying === "ETH") {
        return "(ethereum OR ETH OR crypto OR cryptocurrency OR staking OR defi OR \"ethereum etf\")";
    }
    if (underlying === "IBIT") {
        return "(IBIT OR \"iShares Bitcoin Trust\" OR BlackRock OR \"spot bitcoin etf\" OR \"bitcoin etf\")";
    }
    return "(bitcoin OR BTC OR crypto OR cryptocurrency OR \"spot bitcoin etf\" OR IBIT)";
}

function googleNewsQueryFor(underlying: Underlying): string {
    if (underlying === "ETH") {
        return "ethereum OR ETH OR defi OR staking when:2d";
    }
    if (underlying === "IBIT") {
        return "IBIT OR iShares Bitcoin Trust OR BlackRock OR spot bitcoin etf when:3d";
    }
    return "bitcoin OR BTC OR IBIT OR spot bitcoin etf when:2d";
}

function rssSourcesFor(underlying: Underlying): RssSourceConfig[] {
    const googleQuery = encodeURIComponent(googleNewsQueryFor(underlying));
    return [
        {
            key: `google-news-rss:${underlying}`,
            sourceName: "Google News",
            sourceUrl: "https://news.google.com",
            url: `https://news.google.com/rss/search?q=${googleQuery}&hl=en-US&gl=US&ceid=US:en`,
        },
        {
            key: "cointelegraph-rss",
            sourceName: "Cointelegraph",
            sourceUrl: "https://cointelegraph.com",
            url: "https://cointelegraph.com/rss",
        },
    ];
}

async function fetchRssFallbackNews(underlying: Underlying, limit: number): Promise<LiveNewsItem[]> {
    const feeds = rssSourcesFor(underlying);
    const settled = await Promise.allSettled(
        feeds.map(async (feed) => {
            const response = await fetchWithRetry(
                feed.url,
                {
                    method: "GET",
                    headers: {
                        Accept: RSS_ACCEPT_HEADER,
                    },
                },
                {
                    throttleKey: feed.key,
                    minIntervalMs: 250,
                    timeoutMs: 5000,
                    maxRetries: 1,
                }
            );

            if (!response.ok) {
                throw new Error(`RSS HTTP ${response.status}: ${feed.url}`);
            }

            const xml = await response.text();
            const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

            return itemBlocks
                .map((block, index) => normalizeRssArticle(block, index, feed.key, feed.sourceName))
                .filter((item): item is LiveNewsItem => item != null);
        })
    );

    return settled
        .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
        .slice(0, Math.max(30, limit * 2));
}

async function fetchNewsApiCrypto(underlying: Underlying, limit: number): Promise<LiveNewsItem[]> {
    if (!env.newsApiKey) return [];
    if (Date.now() < newsApiBackoffUntilMs) return [];

    const from = encodeURIComponent(toIsoHoursAgo(18));
    const pageSize = Math.max(30, Math.min(100, limit * 2));
    const q = encodeURIComponent(cryptoQueryFor(underlying));
    const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=${pageSize}&from=${from}`;

    try {
        const response = await getJSON<NewsApiResponse>(
            url,
            {
                headers: { "X-Api-Key": env.newsApiKey },
                throttleKey: `newsapi:crypto:${underlying}`,
                minIntervalMs: 350,
                timeoutMs: 6000,
                maxRetries: 1,
            }
        );

        if (response.status !== "ok") {
            return [];
        }

        return (response.articles ?? [])
            .map((article, index) => normalizeNewsApiArticle(article, index, `newsapi-crypto-${underlying.toLowerCase()}`))
            .filter((article): article is LiveNewsItem => article != null);
    } catch (error) {
        if (error instanceof Error && error.message.includes("HTTP 429")) {
            newsApiBackoffUntilMs = Date.now() + NEWSAPI_COOLDOWN_MS;
        }
        return [];
    }
}

async function fetchNewsApiMajorPolitical(limit: number): Promise<LiveNewsItem[]> {
    if (!env.newsApiKey) return [];
    if (Date.now() < newsApiBackoffUntilMs) return [];

    const from = encodeURIComponent(toIsoHoursAgo(24));
    const pageSize = Math.max(20, Math.min(60, limit));
    const domains = encodeURIComponent(MAJOR_POLITICAL_DOMAINS.join(","));
    const q = encodeURIComponent(
        "(election OR president OR congress OR parliament OR \"white house\" OR \"federal reserve\" OR FOMC OR CPI OR \"interest rate\" OR sanctions OR war OR ceasefire OR treasury)"
    );
    const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=${pageSize}&from=${from}&domains=${domains}`;

    try {
        const response = await getJSON<NewsApiResponse>(
            url,
            {
                headers: { "X-Api-Key": env.newsApiKey },
                throttleKey: "newsapi:politics",
                minIntervalMs: 450,
                timeoutMs: 6000,
                maxRetries: 1,
            }
        );

        if (response.status !== "ok") {
            return [];
        }

        return (response.articles ?? [])
            .map((article, index) => normalizeNewsApiArticle(article, index, "newsapi-politics"))
            .filter((article): article is LiveNewsItem => article != null)
            .filter((article) => isMajorPolitical(article));
    } catch (error) {
        if (error instanceof Error && error.message.includes("HTTP 429")) {
            newsApiBackoffUntilMs = Date.now() + NEWSAPI_COOLDOWN_MS;
        }
        return [];
    }
}

function freeCategoryForUnderlying(underlying: Underlying): "bitcoin" | "ethereum" | "etf" {
    if (underlying === "ETH") return "ethereum";
    if (underlying === "IBIT") return "etf";
    return "bitcoin";
}

async function fetchFreeCryptoNews(underlying: Underlying, limit: number): Promise<LiveNewsItem[]> {
    const category = freeCategoryForUnderlying(underlying);
    const apiLimit = Math.max(40, Math.min(100, limit * 3));
    const url = `https://cryptocurrency.cv/api/news?limit=${apiLimit}&category=${category}&lang=en`;

    const response = await getJSON<FreeCryptoResponse>(
        url,
        {
            throttleKey: `free-crypto-news:${underlying}`,
            minIntervalMs: 250,
            timeoutMs: 5000,
            maxRetries: 1,
        }
    );

    return (response.articles ?? [])
        .map((article, index) => normalizeFreeArticle(article, index))
        .filter((article): article is LiveNewsItem => article != null);
}

export async function GET(request: NextRequest) {
    const underlying = normalizeUnderlying(request.nextUrl.searchParams.get("underlying"));
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const cacheKey = `news:${underlying}:${limit}`;

    try {
        const cached = newsCache.get<LiveNewsItem[]>(cacheKey);
        if (cached) {
            return NextResponse.json({
                updatedAt: Date.now(),
                underlying,
                items: cached,
                status: "ok",
            });
        }

        const sources = await Promise.allSettled([
            fetchNewsApiCrypto(underlying, limit),
            fetchNewsApiMajorPolitical(limit),
            fetchFreeCryptoNews(underlying, limit),
            fetchRssFallbackNews(underlying, limit),
        ]);

        const cryptoApiItems = sources[0].status === "fulfilled" ? sources[0].value : [];
        const politicsItems = sources[1].status === "fulfilled" ? sources[1].value : [];
        const freeCryptoItems = sources[2].status === "fulfilled" ? sources[2].value : [];
        const rssFallbackItems = sources[3].status === "fulfilled" ? sources[3].value : [];

        let status: "ok" | "down" = "ok";
        let reason: string | undefined;

        const anyFeedAvailable =
            cryptoApiItems.length > 0 ||
            politicsItems.length > 0 ||
            freeCryptoItems.length > 0 ||
            rssFallbackItems.length > 0;

        if (!anyFeedAvailable) {
            status = "down";
            reason = "All news feeds unavailable";
        }

        const basePool = dedupe([...cryptoApiItems, ...politicsItems, ...freeCryptoItems, ...rssFallbackItems])
            .filter((item) => !isLowSignal(item))
            .filter((item) => isCryptoRelevant(item) || isMajorPolitical(item));

        const focusedPool = basePool.filter((item) => isMajorPolitical(item) || hasUnderlyingFocus(underlying, item));
        const rankingPool = focusedPool.length >= Math.min(8, limit) ? focusedPool : basePool;

        const merged = rankingPool
            .map((item) => ({ item, score: scoreItem(underlying, item) }))
            .sort((a, b) => b.score - a.score || Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt))
            .map((entry) => entry.item)
            .slice(0, limit);

        const items = applyBreakingFlags(merged);
        newsCache.set(cacheKey, items, env.newsCacheTtlMs);

        return NextResponse.json({
            updatedAt: Date.now(),
            underlying,
            items,
            status,
            reason,
        });
    } catch (error) {
        console.error("News API error:", error);
        return NextResponse.json(
            {
                updatedAt: Date.now(),
                underlying,
                items: [],
                status: "down",
                reason: "Failed to fetch live headlines",
            },
            { status: 200 }
        );
    }
}
