import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import type {
  SuggestSkillsResponse,
  SkillSuggestion,
} from "@/app/api/suggest-skills/route";
export type { SkillSuggestion, SuggestSkillsResponse };

// In-memory cache keyed by "title|department|roleType"
const cache = new Map<string, SuggestSkillsResponse>();

function cacheKey(title: string, dept: string, roleType: string) {
  return `${title.trim().toLowerCase()}|${dept.trim().toLowerCase()}|${roleType}`;
}

// Types
export type FetchStatus = "idle" | "loading" | "success" | "error";

type FetchState = {
  suggestions: SuggestSkillsResponse | null;
  status: FetchStatus;
  error: string | null;
};

type FetchAction =
  | { type: "RESET" }
  | { type: "LOADING" }
  | { type: "SUCCESS"; payload: SuggestSkillsResponse }
  | { type: "ERROR"; payload: string };

function fetchReducer(_state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "RESET":
      return { suggestions: null, status: "idle", error: null };
    case "LOADING":
      return { suggestions: null, status: "loading", error: null };
    case "SUCCESS":
      return { suggestions: action.payload, status: "success", error: null };
    case "ERROR":
      return { suggestions: null, status: "error", error: action.payload };
  }
}

export type UseSkillSuggestionsResult = {
  suggestions: SuggestSkillsResponse | null;
  status: FetchStatus;
  error: string | null;
  resolvedOccupation: string | null;
  source: "groq" | "esco" | "fallback" | null;
  // Manually re-fetch (clears cache for current key)
  refresh: () => void;
  // True when title is long enough but fetch hasn't fired yet
  pending: boolean;
};

const SETTLE_DELAY = 2000; // ms idle after BOTH fields stop changing → fire
const MIN_TITLE_LEN = 3;   // minimum chars before we bother

export function useSkillSuggestions(
  title: string,
  department: string,
  roleType: string,
  apiKey: string,
): UseSkillSuggestionsResult {
  // committedRef holds the latest settled values — stored in a ref so
  // updating it never triggers a re-render on its own.
  const committedRef = useRef<{
    title: string;
    dept: string;
    roleType: string;
  } | null>(null);

  // fetchTick increments when we want the fetch effect to run.
  // This is the only piece of state the settle timer touches.
  const [fetchTick, setFetchTick] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [{ suggestions, status, error }, dispatch] = useReducer(fetchReducer, {
    suggestions: null,
    status: "idle",
    error: null,
  });

  const settleTimer = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Step 1: settle timer
  // Waits for all three inputs to stop changing for SETTLE_DELAY ms, then
  // writes into the ref and bumps fetchTick (one setState, no cascade).
  useEffect(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);

    if (title.trim().length < MIN_TITLE_LEN) {
      // Reset ref so stale committed values aren't used after the title is cleared
      committedRef.current = null;
      // Single setState — no cascade
      setFetchTick(0);
      return;
    }

    settleTimer.current = setTimeout(() => {
      committedRef.current = {
        title: title.trim(),
        dept: department.trim(),
        roleType,
      };
      // Single setState to signal the fetch effect
      setFetchTick((t) => t + 1);
    }, SETTLE_DELAY);

    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [title, department, roleType]);

  // Step 2: sync RESET when committed is cleared
  // fetchTick === 0 means the title was too short / cleared — reset fetch state.
  useEffect(() => {
    if (fetchTick === 0) {
      dispatch({ type: "RESET" });
    }
  }, [fetchTick]);

  // Step 3: fetch — fires when fetchTick or refreshKey changes
  useEffect(() => {
    if (fetchTick === 0 || !committedRef.current) return;

    const committed = committedRef.current;
    const ck = cacheKey(committed.title, committed.dept, committed.roleType);

    // Serve from cache — zero network calls
    const cached = cache.get(ck);
    if (cached && refreshKey === 0) {
      dispatch({ type: "SUCCESS", payload: cached });
      return;
    }

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    dispatch({ type: "LOADING" });

    fetch("/api/suggest-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: committed.title,
        department: committed.dept,
        roleType: committed.roleType,
        apiKey,
      }),
      signal: abortRef.current.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        return res.json() as Promise<SuggestSkillsResponse>;
      })
      .then((data) => {
        cache.set(ck, data);
        dispatch({ type: "SUCCESS", payload: data });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        dispatch({ type: "ERROR", payload: err.message });
      });

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchTick, refreshKey, apiKey]);

  const refresh = useCallback(() => {
    if (!committedRef.current) return;
    const ck = cacheKey(
      committedRef.current.title,
      committedRef.current.dept,
      committedRef.current.roleType,
    );
    cache.delete(ck);
    setRefreshKey((k) => k + 1);
  }, []);

  // pending = title is long enough but settle timer hasn't fired yet
  const pending =
    title.trim().length >= MIN_TITLE_LEN &&
    status === "idle" &&
    committedRef.current === null;

  return {
    suggestions,
    status,
    error,
    resolvedOccupation: suggestions?.occupation ?? null,
    source: suggestions?.source ?? null,
    refresh,
    pending,
  };
}

// Helper used by TagInputs
export function filterSuggestions(
  items: SkillSuggestion[],
  alreadyAdded: string[],
  query: string,
): SkillSuggestion[] {
  const added = new Set(alreadyAdded.map((s) => s.toLowerCase().trim()));
  const q = query.toLowerCase().trim();
  return items.filter(
    (s) =>
      !added.has(s.skill.toLowerCase().trim()) &&
      (q === "" ||
        s.skill.toLowerCase().includes(q) ||
        s.reason.toLowerCase().includes(q)),
  );
}
