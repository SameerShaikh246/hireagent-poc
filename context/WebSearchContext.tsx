"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { StructuredJD, JDMode } from "@/types";
import type { Provider, WebCandidate, ExtractedJD, CandidateFilters } from "@/lib/webSearchTypes";

interface RunSearchArgs {
    structuredJD: StructuredJD;
    jdMode: JDMode;
    jdText: string;
    filters?: CandidateFilters;
    freshSearch?: boolean;
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
    runSearch: (args: RunSearchArgs) => Promise<boolean>;
    reset: () => void;
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

    const runSearch = async ({
        structuredJD,
        jdMode,
        jdText,
        filters,
        freshSearch,
    }: RunSearchArgs) => {
        setLoading(true);
        setError("");
        try {
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
                    filters,
                    freshSearch: Boolean(freshSearch),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Search failed");
            setResults(data.candidates);
            setTotalFound(data.totalFound);
            setSearchedAt(data.searchedAt);
            setCreditsUsed(data.creditsUsed);
            setExtractedJD(data.extractedJD ?? null);
            setWarning(data.warning ?? "");
            setSuppressedByFreshness(data.suppressedByFreshness ?? 0);
            setFilteredOutByFilters(data.filteredOutByFilters ?? 0);
            setLastFilters(filters);
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
                runSearch,
                reset,
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