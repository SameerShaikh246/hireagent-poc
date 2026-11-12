interface GroqOptions {
  apiKey: string;
  /** Optional fallback keys, tried in order if apiKey is cooling down or fails with a retryable error. */
  apiKeys?: string[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  responseFormat?: {
    type: "text" | "json_object";
  };
  reasoningFormat?: "hidden" | "raw" | "parsed";
}

// ── Tunables ─────────────────────────────────────────────────────────────
// Conservative defaults — check console.groq.com/settings/limits for your
// actual plan and adjust. Too high: legitimate bursts get 429s straight
// from Groq instead of being smoothed here. Too low: we throttle ourselves
// for no reason.
// Per-key budgets. These are OUR throttle, not Groq's — set them to your plan's
// real per-key limits (console.groq.com/settings/limits) via env. Too high and
// Groq returns 429s; too low and we make searches wait for no reason.
const RPM_LIMIT = Number(process.env.GROQ_RPM_LIMIT) || 28;
const TPM_LIMIT = Number(process.env.GROQ_TPM_LIMIT) || 18000;
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 20000;
const DEFAULT_COOLDOWN_MS = 15000;
// A key that returns 401/402/403 is invalid or out of quota — retrying it
// in a few seconds won't help, so it goes to the back of the queue for hours.
const DISABLED_KEY_MS = 6 * 60 * 60 * 1000;
// A 429 that says "per day" but carries no retry-after: park the key for an
// hour instead of retrying it every 15 seconds.
const DAILY_LIMIT_FALLBACK_MS = 60 * 60 * 1000;
// Never sleep longer than this waiting for a key. A key that is rate-limited
// for longer (e.g. a daily limit) fails FAST so the caller can use another key
// or degrade, instead of hanging a request for hours.
const MAX_CAPACITY_WAIT_MS = 30_000;

// ── Per-key state ────────────────────────────────────────────────────────
interface KeyState {
  requestTimestamps: number[];
  tokenUsage: { timestamp: number; tokens: number }[];
  cooldownUntil: number; // epoch ms; 0 = not cooling down (short — rate limited, 429)
  disabledUntil: number; // epoch ms; 0 = healthy (long — invalid / out-of-quota key, 401/402/403)
  rejectedTokens: number; // smallest request size (est. tokens) this key answered 413 to; 0 = never
  queue: Promise<void>;  // tail of this key's serialized call chain
}

const keyStates = new Map<string, KeyState>();

function getKeyState(key: string): KeyState {
  let state = keyStates.get(key);
  if (!state) {
    state = { requestTimestamps: [], tokenUsage: [], cooldownUntil: 0, disabledUntil: 0, rejectedTokens: 0, queue: Promise.resolve() };
    keyStates.set(key, state);
  }
  return state;
}

function redact(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "***";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ~4 chars/token — Groq gives no pre-flight token count, so this is an
// approximation for TPM throttling only, not for billing accuracy.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function pruneWindow<T extends { timestamp?: number }>(items: T[], windowMs: number, now: number): T[] {
  const cutoff = now - windowMs;
  return items.filter((item) => (typeof item === "number" ? item : (item as any).timestamp) > cutoff);
}

// Blocks until this key has RPM/TPM headroom for a request of roughly
// `estimatedRequestTokens`, waiting out any active cooldown first.
async function waitForCapacity(key: string, estimatedRequestTokens: number): Promise<void> {
  const state = getKeyState(key);
  // A request larger than the entire per-minute budget could never fit, even in
  // an empty window — without this cap it would wait forever.
  estimatedRequestTokens = Math.min(estimatedRequestTokens, TPM_LIMIT);

  while (true) {
    const now = Date.now();

    if (state.cooldownUntil > now) {
      const remaining = state.cooldownUntil - now;
      if (remaining > MAX_CAPACITY_WAIT_MS) {
        throw new GroqRequestError(
          `Groq key ${redact(key)} is rate-limited for another ${Math.round(remaining / 1000)}s`,
          429,
          true,
        );
      }
      await sleep(Math.min(remaining, 5000));
      continue;
    }

    state.requestTimestamps = state.requestTimestamps.filter((t) => t > now - 60_000);
    state.tokenUsage = state.tokenUsage.filter((u) => u.timestamp > now - 60_000);
    const tokensInWindow = state.tokenUsage.reduce((sum, u) => sum + u.tokens, 0);

    const underRPM = state.requestTimestamps.length < RPM_LIMIT;
    const underTPM = tokensInWindow + estimatedRequestTokens <= TPM_LIMIT;
    if (underRPM && underTPM) return;

    const oldestRequest = state.requestTimestamps[0];
    const oldestToken = state.tokenUsage[0]?.timestamp;
    const nextFree = Math.min(
      oldestRequest !== undefined ? oldestRequest + 60_000 : Infinity,
      oldestToken !== undefined ? oldestToken + 60_000 : Infinity,
    );
    await sleep(Math.max(250, Math.min(nextFree - now, 5000)));
  }
}

// Can this key take a request of ~`estimatedTokens` RIGHT NOW without waiting?
// Read-only (never mutates the usage windows).
function hasHeadroom(key: string, estimatedTokens: number, now: number = Date.now()): boolean {
  const state = getKeyState(key);
  const requests = state.requestTimestamps.filter((t) => t > now - 60_000).length;
  const tokens = state.tokenUsage.filter((u) => u.timestamp > now - 60_000).reduce((sum, u) => sum + u.tokens, 0);
  return requests < RPM_LIMIT && tokens + Math.min(estimatedTokens, TPM_LIMIT) <= TPM_LIMIT;
}

function recordUsage(key: string, tokens: number): void {
  const state = getKeyState(key);
  const now = Date.now();
  state.requestTimestamps.push(now);
  state.tokenUsage.push({ timestamp: now, tokens });
}

function startCooldown(key: string, ms: number): void {
  const state = getKeyState(key);
  state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + ms);
  console.warn(`Groq key ${redact(key)} cooling down for ${Math.round(ms / 1000)}s after a 429.`);
}

function startDisable(key: string, status: number): void {
  const state = getKeyState(key);
  state.disabledUntil = Date.now() + DISABLED_KEY_MS;
  console.warn(`Groq key ${redact(key)} disabled for 6h (HTTP ${status}) — falling back to the next key.`);
}

// Every call against the SAME key is chained onto a promise tail, so two
// calls sharing a key never fire literally concurrently — this is the
// "request queueing" piece. Different keys run fully independently. A
// failure in one queued call never wedges the rest of the chain.
function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const state = getKeyState(key);
  const result = state.queue.then(task, task);
  state.queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

class GroqRequestError extends Error {
  status?: number;
  /** Retrying THIS key cannot help (its limit won't clear for a long time). The NEXT key may still work. */
  noRetry?: boolean;
  constructor(message: string, status?: number, noRetry = false) {
    super(message);
    this.status = status;
    this.noRetry = noRetry;
  }
}

// Worth retrying the SAME key after a short backoff? (transient 429 / 5xx)
function isRetryable(error: unknown): boolean {
  if ((error as GroqRequestError)?.noRetry) return false;
  const status = (error as GroqRequestError)?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

// Should the NEXT key be tried? Yes for anything that is the KEY's fault
// (invalid 401, out of quota 402/403, rate limited 429, upstream 5xx).
// 413 = "request too large" for THIS key's per-minute token limit, which differs
// by plan — another key may accept the very same request.
// No for a bad request (400, 422...) — those fail identically on every
// key, so trying more keys would just burn quota and hide the real error.
//
// Previously a 401 was treated as "surface immediately", which was right for
// a single recruiter-typed key but wrong for a server-side pool: one bad key
// at the front of GROQ_API_KEYS killed every call before the good key ran.
function shouldFailOver(error: unknown): boolean {
  const status = (error as GroqRequestError)?.status;
  return (
    status === 401 || status === 402 || status === 403 || status === 413 || status === 429 ||
    (typeof status === "number" && status >= 500)
  );
}

async function callGroqOnce(
  prompt: string,
  key: string,
  opts: Omit<GroqOptions, "apiKey" | "apiKeys">,
): Promise<string> {
  const {
    maxTokens = 1000,
    temperature = 0.1,
    model = "openai/gpt-oss-20b",
    responseFormat,
    reasoningFormat,
  } = opts;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(reasoningFormat ? { reasoning_format: reasoningFormat } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (res.status === 429) {
    const err = await res.json().catch(() => ({}));
    const message = JSON.stringify(err);
    const daily = /per day|tokens per day|requests per day|\bTPD\b|\bRPD\b/i.test(message);
    const retryAfterHeader = res.headers.get("retry-after");
    let retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    if (!Number.isFinite(retryAfterMs)) retryAfterMs = daily ? DAILY_LIMIT_FALLBACK_MS : DEFAULT_COOLDOWN_MS;
    startCooldown(key, retryAfterMs);
    throw new GroqRequestError(
      `Groq rate limit (429${daily ? ", daily limit" : ""}): ${message}`,
      429,
      retryAfterMs > MAX_CAPACITY_WAIT_MS, // won't clear within our wait budget — don't retry this key
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 402 || res.status === 403) startDisable(key, res.status);
    if (res.status === 413) {
      // This key's per-minute ceiling is below our request. Remember how big,
      // so requests that large try other keys FIRST, while smaller requests
      // can still use this key.
      const st = getKeyState(key);
      // 10% margin: near-identical requests (e.g. the next batch, a few tokens
      // smaller) would be rejected too, so don't retry this key for them.
      const est = Math.floor((estimateTokens(prompt) + maxTokens) * 0.9);
      st.rejectedTokens = st.rejectedTokens ? Math.min(st.rejectedTokens, est) : est;
    }
    throw new GroqRequestError(`Groq API error ${res.status}: ${JSON.stringify(err)}`, res.status);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callWithRetry(
  prompt: string,
  key: string,
  opts: Omit<GroqOptions, "apiKey" | "apiKeys">,
  maxRetries: number = MAX_RETRIES,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
      const jitter = Math.random() * 250;
      console.warn(
        `Retrying Groq call on key ${redact(key)} — attempt ${attempt + 1}/${maxRetries + 1} after ${Math.round(backoff)}ms.`,
      );
      await sleep(backoff + jitter);
    }

    try {
      const estimatedTokens = estimateTokens(prompt) + (opts.maxTokens ?? 1000);
      await waitForCapacity(key, estimatedTokens);
      const result = await callGroqOnce(prompt, key, opts);
      recordUsage(key, estimatedTokens);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error; // 401/400/etc: retrying the SAME key can't help (groqGenerate decides about the NEXT key)
    }
  }

  console.error(`Groq call on key ${redact(key)} exhausted all ${maxRetries + 1} attempts.`);
  throw lastError instanceof Error ? lastError : new Error("Groq request failed after retries");
}

export async function groqGenerate(prompt: string, options: GroqOptions): Promise<string> {
  const { apiKey, apiKeys, ...rest } = options;
  const keys = [...new Set([apiKey, ...(apiKeys ?? [])].filter((k): k is string => Boolean(k?.trim())).map((k) => k.trim()))];

  if (keys.length === 0) {
    throw new Error("No Groq API key provided.");
  }

  // Healthy keys first (in the order they were configured), then keys that
  // are only rate-limited for a moment, then keys that are disabled. Nothing
  // is ever skipped outright, so if every key is unhealthy we still try them
  // rather than failing without making a single call.
  // Order: usable right now -> at its per-minute budget -> rate-limited
  // (cooling down) -> disabled. A key at its budget is skipped in favour of
  // one with headroom instead of making the caller sleep; we only wait when
  // EVERY key is at its limit.
  const now = Date.now();
  const estimated = estimateTokens(prompt) + (rest.maxTokens ?? 1000);
  const rank = (k: string) => {
    const st = getKeyState(k);
    if (st.disabledUntil > now) return 3;
    if (st.cooldownUntil > now) return 2;
    if (st.rejectedTokens && estimated >= st.rejectedTokens) return 1; // known too small for a request this big
    return hasHeadroom(k, estimated, now) ? 0 : 1;
  };
  const ordered = [...keys].sort((a, b) => rank(a) - rank(b)); // stable: keeps env order inside each group

  let lastError: unknown;
  const failures: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const key = ordered[i];
    const hasFallback = i < ordered.length - 1;
    try {
      // With another key to fall back to, don't sit through backoff on this
      // one — move on immediately. Only the LAST key gets the full retry budget.
      return await enqueue(key, () => callWithRetry(prompt, key, rest, hasFallback ? 0 : MAX_RETRIES));
    } catch (error) {
      lastError = error;
      const status = (error as GroqRequestError)?.status;
      const reason = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      failures.push(`${redact(key)} -> ${status ?? "network"}: ${reason}`);
      if (!shouldFailOver(error)) throw error; // bad request — identical on every key, surface it
      if (hasFallback) console.warn(`Groq key ${redact(key)} failed (${status}); trying next key.`);
    }
  }

  // Every key failed. Say WHY for each one — "Groq failed" is undiagnosable,
  // "key A -> 429 daily limit | key B -> 413 request too large" is not.
  throw new GroqRequestError(
    `All ${ordered.length} Groq key(s) failed — ${failures.join(" | ")}`,
    (lastError as GroqRequestError)?.status,
  );
}

// ── Observability ───────────────────────────────────────────────────────
// Optional: for a debug/admin endpoint, or just console-logging during
// development, to see current load per key without exposing the key itself.
export function getGroqKeyStats(key: string): {
  requestsInLastMinute: number;
  tokensInLastMinute: number;
  coolingDown: boolean;
  disabled: boolean;
  cooldownRemainingMs: number;
} {
  const state = getKeyState(key.trim());
  const now = Date.now();
  const requests = state.requestTimestamps.filter((t) => t > now - 60_000).length;
  const tokens = state.tokenUsage.filter((u) => u.timestamp > now - 60_000).reduce((s, u) => s + u.tokens, 0);
  return {
    requestsInLastMinute: requests,
    tokensInLastMinute: tokens,
    coolingDown: state.cooldownUntil > now,
    disabled: state.disabledUntil > now,
    cooldownRemainingMs: Math.max(0, state.cooldownUntil - now),
  };
}