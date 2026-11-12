"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { StructuredJD, JDMode } from "@/types";
import type { Provider, WebCandidate, ExtractedJD, CandidateFilters } from "@/lib/webSearchTypes";

interface RunSearchArgs {
    structuredJD: StructuredJD;
    jdMode: JDMode;
    jdText: string;
    /** Phase 8 — recruiter-selected filters. Omit/undefined = no filtering. */
    filters?: CandidateFilters;
    /** Phase 5 — bypass the 30-day "already seen" exclusion for this run. */
    freshSearch?: boolean;
    /** "Load more": add this batch to the list already on screen instead of replacing it. */
    append?: boolean;
    locations?: string[];
}


interface WebSearchContextValue {
    provider: Provider;
    setProvider: (p: Provider) => void;
    loading: boolean;
    error: string;
    results: WebCandidate[] | null;
    totalFound: number;
    searchedAt: string;
    creditsUsed?: number;
    extractedJD: ExtractedJD | null;
    warning: string;
    /** Candidates hidden because they were already shown for this same JD within the last 30 days. */
    suppressedByFreshness: number;
    /** Candidates hidden by the currently-applied recruiter filters. */
    filteredOutByFilters: number;
    /** The filters used for the most recent search — lets the filter panel restore its own state, and lets "Fresh search" re-run with the same filters. */
    lastFilters: CandidateFilters | undefined;
    freshMode: boolean;
    setFreshMode: (value: boolean) => void;
    exhausted: boolean;
    lastAddedCount: number | null;
    runSearch: (args: RunSearchArgs) => Promise<boolean>;
    reset: () => void;
    searchLocations: string[];
    setSearchLocations: (locations: string[]) => void;
}

const WebSearchContext = createContext<WebSearchContextValue | null>(null);

export function WebSearchProvider({ children }: { children: ReactNode }) {
    const [provider, setProvider] = useState<Provider>("pdl");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [results, setResults] = useState<WebCandidate[] | null>(null);
    const [totalFound, setTotalFound] = useState(0);
    const [searchedAt, setSearchedAt] = useState("");
    const [creditsUsed, setCreditsUsed] = useState<number | undefined>();
    const [extractedJD, setExtractedJD] = useState<ExtractedJD | null>(null);
    const [warning, setWarning] = useState("");
    const [suppressedByFreshness, setSuppressedByFreshness] = useState(0);
    const [filteredOutByFilters, setFilteredOutByFilters] = useState(0);
    const [lastFilters, setLastFilters] = useState<CandidateFilters | undefined>(undefined);
    const [lastAddedCount, setLastAddedCount] = useState<number | null>(null);
    const [freshMode, setFreshMode] = useState(false);
    const [lastRunFresh, setLastRunFresh] = useState(false);
    const [nextPage, setNextPage] = useState(0);
    const [exhausted, setExhausted] = useState(false);
    const [searchLocations, setSearchLocations] = useState<string[]>([]);

    const runSearch = async ({
        structuredJD,
        jdMode,
        jdText,
        filters,
        freshSearch,
        append,
        locations
    }: RunSearchArgs) => {
        setLoading(true);
        setError("");
        try {
            // Priority: explicit arg > filters.locations > what's saved from the first page.
            const effectiveLocations = (locations ?? filters?.locations ?? searchLocations)
                .map((l) => l.trim())
                .filter(Boolean);

            const effectiveFilters: CandidateFilters | undefined =
                effectiveLocations.length || filters
                    ? { ...filters, locations: effectiveLocations.length ? effectiveLocations : undefined }
                    : undefined;
            const useFresh = Boolean(freshSearch);
            // Only continue the cursor if the mode hasn't changed since the last request;
            // excludeKeys already prevents duplicates either way.
            const startPage = append && useFresh === lastRunFresh ? nextPage : 0;
            const excludeKeys = append
                ? (results ?? []).flatMap((c) => [c.candidateId, c.url, c.id].filter((k): k is string => Boolean(k)))
                : [];

            const res = await fetch("/api/search-candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    // No API keys are sent from the browser any more — the
                    // server reads them from its environment (providerKeys.ts).
                    jobTitle: structuredJD.title,
                    mustHaveSkills: structuredJD.mustHaveSkills,
                    mandatorySkills: structuredJD.mandatorySkills,
                    niceToHaveSkills: structuredJD.niceToHaveSkills,
                    roleType: structuredJD.roleType,
                    jdMode,
                    jdText,
                    filters: effectiveFilters,
                    freshSearch: useFresh,
                    startPage,
                    excludeKeys,
                }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Search failed");
            const incoming: WebCandidate[] = data.candidates ?? [];
            if (append) {
                // Keep what's on screen, add only people not already in the list.
                // (`results` is current here: the Load more button is disabled
                // while a search is running, so nothing else can change it mid-flight.)
                const have = new Set((results ?? []).map((c) => c.id));
                const fresh = incoming.filter((c) => !have.has(c.id));
                setResults([...(results ?? []), ...fresh]);
                setLastAddedCount(fresh.length);
            } else {
                setResults(incoming);
                setLastAddedCount(incoming.length);
            }

            setTotalFound(data.totalFound);
            setSearchedAt(data.searchedAt);
            setCreditsUsed(data.creditsUsed);
            setExtractedJD(data.extractedJD ?? null);
            setWarning(data.warning ?? "");
            setSuppressedByFreshness(data.suppressedByFreshness ?? 0);
            setFilteredOutByFilters(data.filteredOutByFilters ?? 0);
            setLastFilters(effectiveFilters);
            setSearchLocations(effectiveLocations);
            setLastRunFresh(useFresh);
            if (!append) setFreshMode(useFresh);   // keep the toggle in sync with Fresh search / Apply filters
            setNextPage(data.nextPage ?? 0);
            setExhausted(Boolean(data.exhausted));
            return true;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setResults(null);
        setError("");
        setWarning("");
        setExtractedJD(null);
        setSuppressedByFreshness(0);
        setFilteredOutByFilters(0);
        setLastFilters(undefined);
        setLastAddedCount(null);
        setNextPage(0);
        setExhausted(false);
        setFreshMode(false);
        setLastRunFresh(false);
        setSearchLocations([]);
    };

    return (
        <WebSearchContext.Provider
            value={{
                provider,
                setProvider,
                loading,
                error,
                results,
                totalFound,
                searchedAt,
                creditsUsed,
                extractedJD,
                warning,
                suppressedByFreshness,
                filteredOutByFilters,
                lastFilters,
                lastAddedCount,
                runSearch,
                reset,
                freshMode,
                setFreshMode,
                exhausted,
                searchLocations,
                setSearchLocations,
            }}
        >
            {children}
        </WebSearchContext.Provider>
    );
}

export function useWebSearch() {
    const ctx = useContext(WebSearchContext);
    if (!ctx) throw new Error("useWebSearch must be used within a WebSearchProvider");
    return ctx;
}