"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { StructuredJD, JDMode } from "@/types";
import type { Provider, WebCandidate, ExtractedJD } from "@/lib/webSearchTypes";

interface RunSearchArgs {
    structuredJD: StructuredJD;
    jdMode: JDMode;
    jdText: string;
    groqApiKey: string;
    apiKey: string;
}


interface WebSearchContextValue {
    provider: Provider;
    setProvider: (p: Provider) => void;
    apiKey: string;
    setApiKey: (v: string) => void;
    loading: boolean;
    error: string;
    results: WebCandidate[] | null;
    totalFound: number;
    searchedAt: string;
    creditsUsed?: number;
    extractedJD: ExtractedJD | null;
    warning: string;
    runSearch: (args: RunSearchArgs) => Promise<boolean>;
    reset: () => void;
}

const WebSearchContext = createContext<WebSearchContextValue | null>(null);

export function WebSearchProvider({ children }: { children: ReactNode }) {
    const [provider, setProvider] = useState<Provider>("pdl");
    const [apiKey, setApiKey] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [results, setResults] = useState<WebCandidate[] | null>(null);
    const [totalFound, setTotalFound] = useState(0);
    const [searchedAt, setSearchedAt] = useState("");
    const [creditsUsed, setCreditsUsed] = useState<number | undefined>();
    const [extractedJD, setExtractedJD] = useState<ExtractedJD | null>(null);
    const [warning, setWarning] = useState("");

    const runSearch = async ({
        structuredJD,
        jdMode,
        jdText,
        groqApiKey,
        apiKey: searchApiKey,
    }: RunSearchArgs) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/search-candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    apiKey: searchApiKey.trim(),
                    jobTitle: structuredJD.title,
                    mustHaveSkills: structuredJD.mustHaveSkills,
                    mandatorySkills: structuredJD.mandatorySkills,
                    niceToHaveSkills: structuredJD.niceToHaveSkills,
                    roleType: structuredJD.roleType,
                    jdMode,
                    jdText,
                    groqApiKey: groqApiKey.trim(),
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
    };

    return (
        <WebSearchContext.Provider
            value={{
                provider,
                setProvider,
                apiKey,
                setApiKey,
                loading,
                error,
                results,
                totalFound,
                searchedAt,
                creditsUsed,
                extractedJD,
                warning,
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