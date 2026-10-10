// ─────────────────────────────────────────────────────────────────────────
// Centralized API Key Manager (PDL / GitHub / Tavily / Exa / Serper / Groq)
//
// Replaces per-request, recruiter-supplied keys with a server-side pool
// read from environment variables. Each provider can have multiple
// comma-separated keys; when the active key hits a rate limit or an
// exhausted-quota error, withKeyFailover() automatically retries with the
// next key in the pool, and puts the failed key into cooldown so future
// requests skip it until the cooldown expires.
//
// Env vars (comma-separated for multiple keys), set in .env / .env.local:
//   PDL_API_KEYS=key1,key2
//   GITHUB_API_KEYS=ghp_xxx,ghp_yyy      (optional — GitHub still works
//                                          unauthenticated with none set)
//   TAVILY_API_KEYS=tvly-xxx
//   EXA_API_KEYS=exa-xxx
//   SERPER_API_KEYS=key1,key2
//   GROQ_API_KEYS=gsk_xxx,gsk_yyy
//
// To add a key: append it to the relevant env var (comma-separated) and
// restart the server — there's no code change and nothing to redeploy
// beyond the env var itself. Keys are read fresh from process.env on every
// call, so no caching/restart race to worry about beyond however your
// hosting platform applies env var changes.
// ─────────────────────────────────────────────────────────────────────────

export type KeyedProvider = "pdl" | "github" | "tavily" | "exa" | "serper" | "groq";

const ENV_VARS: Record<KeyedProvider, string> = {
    pdl: "PDL_API_KEYS",
    github: "GITHUB_API_KEYS",
    tavily: "TAVILY_API_KEYS",
    exa: "EXA_API_KEYS",
    serper: "SERPER_API_KEYS",
    groq: "GROQ_API_KEYS",
};

// How long a key sits out after a given kind of failure, before it's tried
// again. A 429 is usually transient (per-minute limit) — short cooldown. A
// 401/402/403 usually means the key is invalid or its quota is actually
// exhausted (daily/monthly) — not worth retrying for hours.
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const QUOTA_EXHAUSTED_COOLDOWN_MS = 6 * 60 * 60 * 1000;

interface KeyState {
    cooldownUntil: number; // epoch ms; 0 = not cooling down
}

const keyStates = new Map<string, KeyState>();

function stateId(provider: KeyedProvider, key: string): string {
    return `${provider}:${key}`;
}

function getState(provider: KeyedProvider, key: string): KeyState {
    const id = stateId(provider, key);
    let state = keyStates.get(id);
    if (!state) {
        state = { cooldownUntil: 0 };
        keyStates.set(id, state);
    }
    return state;
}

export function getProviderKeys(provider: KeyedProvider): string[] {
    const raw = process.env[ENV_VARS[provider]] ?? "";
    return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

export function hasProviderKeys(provider: KeyedProvider): boolean {
    return getProviderKeys(provider).length > 0;
}

function cooldownForStatus(status: number): number {
    if (status === 429) return RATE_LIMIT_COOLDOWN_MS;
    if (status === 401 || status === 402 || status === 403) return QUOTA_EXHAUSTED_COOLDOWN_MS;
    return 0; // not a key problem — e.g. a 400 bad request or 5xx server error
}

// Thrown by provider fetch wrappers so withKeyFailover can classify the
// failure. `status` MUST be set for failover to work — an error without a
// status is treated as "not a key problem" and is never retried on another key.
export class ProviderKeyError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

/**
 * Runs `fn` against each available key for `provider`, in order, skipping
 * keys currently in cooldown (unless ALL keys are cooling down, in which
 * case cooldown is treated as a courtesy, not a hard block, and they're all
 * tried anyway). On a failover-eligible failure (see cooldownForStatus),
 * the key is cooled down and the next one is tried. Any other error is NOT
 * a key problem and is thrown immediately without burning through the rest
 * of the pool.
 */
export async function withKeyFailover<T>(
    provider: KeyedProvider,
    fn: (key: string) => Promise<T>,
): Promise<T> {
    const allKeys = getProviderKeys(provider);
    if (allKeys.length === 0) {
        throw new Error(
            `No ${provider.toUpperCase()} API key configured on the server. Set ${ENV_VARS[provider]} in your environment.`,
        );
    }

    const now = Date.now();
    const available = allKeys.filter((k) => getState(provider, k).cooldownUntil <= now);
    const tryOrder = available.length > 0 ? available : allKeys;

    let lastError: unknown;
    for (const key of tryOrder) {
        try {
            return await fn(key);
        } catch (error) {
            lastError = error;
            const status = (error as ProviderKeyError)?.status;
            const cooldown = status !== undefined ? cooldownForStatus(status) : 0;
            if (cooldown > 0 && tryOrder.length > 1) {
                getState(provider, key).cooldownUntil = Date.now() + cooldown;
                console.warn(
                    `${provider} key ending in ...${key.slice(-4)} cooling down for ${Math.round(cooldown / 1000)}s (status ${status}). Trying next key.`,
                );
                continue;
            }
            throw error; // not a key problem, or no other key to fall back to
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`All ${provider} API keys failed.`);
}

// Returns {apiKey, apiKeys} shaped for groqGenerate()'s existing fallback
// support (lib/groq.ts) — Groq already does its own per-key RPM/TPM
// tracking and retry, so for Groq specifically we feed the env pool into
// that existing mechanism rather than double-wrapping with withKeyFailover.
export function getCentralGroqKeys(): { apiKey: string; apiKeys: string[] } {
    const keys = getProviderKeys("groq");
    if (keys.length === 0) {
        throw new Error("No Groq API key configured on the server. Set GROQ_API_KEYS in your environment.");
    }
    return { apiKey: keys[0], apiKeys: keys.slice(1) };
}

// Optional observability — e.g. for a debug/admin endpoint.
export function getProviderKeyStats(
    provider: KeyedProvider,
): { key: string; coolingDown: boolean; cooldownRemainingMs: number }[] {
    const now = Date.now();
    return getProviderKeys(provider).map((key) => {
        const state = getState(provider, key);
        return {
            key: `...${key.slice(-4)}`,
            coolingDown: state.cooldownUntil > now,
            cooldownRemainingMs: Math.max(0, state.cooldownUntil - now),
        };
    });
}