"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, CheckCircle, BarChart3, Database, History, AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import { useWebSearch } from "@/context/WebSearchContext";
import { useJD } from "@/context/JDContext";
import { PROVIDERS } from "@/lib/searchProviders";
import { buildJDText } from "@/components/JobDescriptionForm";
import type { WebCandidate, CandidateFilters } from "@/lib/webSearchTypes";
import WebCandidateCard from "./WebCandidateCard";
import CandidateFiltersPanel from "./CandidateFiltersPanel";

export default function SearchResultsView() {
    const router = useRouter();
    const { jdMode, structuredJD, freeTextJD } = useJD();
    const {
        provider,
        results,
        totalFound,
        searchedAt,
        creditsUsed,
        extractedJD,
        warning,
        suppressedByFreshness,
        filteredOutByFilters,
        lastFilters,
        loading,
        runSearch,
        reset,
    } = useWebSearch();

    const [filterSource, setFilterSource] = useState<WebCandidate["source"] | "all">("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const meta = PROVIDERS[provider];
    const isFreeText = jdMode === "freetext";
    const jdText = isFreeText ? freeTextJD : buildJDText(structuredJD);

    // extractedJD is ONLY populated by the backend in free-text JD mode (it's
    // what Groq extracted from the pasted text). In structured mode it's
    // always null — the skills were already known, nothing to extract. Using
    // extractedJD alone here meant structured-mode searches always got an
    // empty effectiveSkills array: a 0 max on the "Skills matched" bar (so it
    // never filled, regardless of how many skills actually matched), and no
    // skill chips in the filter panel at all. Falling back to structuredJD's
    // own lists fixes both.
    const effectiveSkills = extractedJD
        ? [...new Set([...extractedJD.mandatorySkills, ...extractedJD.mustHaveSkills, ...extractedJD.niceToHaveSkills])]
        : [...new Set([...structuredJD.mandatorySkills, ...structuredJD.mustHaveSkills, ...structuredJD.niceToHaveSkills])];

    const list = results ?? [];
    const filtered = list.filter((c) => filterSource === "all" || c.source === filterSource);
    const shortlisted = list.filter((c) => c.relevanceScore >= 55);
    const avgScore = list.length
        ? Math.round(list.reduce((s, c) => s + c.relevanceScore, 0) / list.length)
        : 0;

    const sourceCounts = (["linkedin", "github", "portfolio", "other"] as WebCandidate["source"][]).reduce(
        (acc, s) => {
            acc[s] = list.filter((c) => c.source === s).length;
            return acc;
        },
        {} as Record<WebCandidate["source"], number>,
    );

    const startNewSearch = () => {
        reset();
        router.push("/search");
    };

    // Re-runs the same search (same provider, same JD) with a new set of
    // Phase 8 filters. Server-side, so it hits the DB/provider again rather
    // than filtering the already-fetched list client-side.
    //
    // freshSearch MUST be true here. The freshness hash is built from
    // jobTitle + skills only — filters don't factor into it — so refining
    // filters on a search you just ran is, from the backend's point of
    // view, an identical search context to the one a few seconds ago. With
    // freshSearch: false, every candidate you just saw gets suppressed as
    // "already seen" before your filters ever run on anything, and you get
    // zero results regardless of how loose the filters are.
    const applyFilters = async (filters: CandidateFilters | undefined) => {
        await runSearch({ structuredJD, jdMode, jdText, filters, freshSearch: true });
    };

    // Phase 5 — bypass the 30-day "already seen" exclusion, keeping whatever
    // filters are currently active.
    const runFreshSearch = async () => {
        await runSearch({ structuredJD, jdMode, jdText, filters: lastFilters, freshSearch: true });
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-5">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <h1 className="font-display text-[22px] font-semibold text-(--text-primary)">
                    Search results
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={runFreshSearch}
                        disabled={loading}
                        title="Bypass the 30-day 'already seen' rule and search again"
                        className="flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-3 py-1.5 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--surface)" }}
                    >
                        <RefreshCw size={13} strokeWidth={2.25} className={loading ? "animate-spin" : ""} />
                        {loading ? "Searching…" : "Fresh search"}
                    </button>
                    <button
                        onClick={startNewSearch}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-3 py-1.5 border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ borderColor: "var(--border)", color: "var(--accent)", background: "var(--surface)" }}
                    >
                        <RotateCcw size={13} strokeWidth={2.25} />
                        New search
                    </button>
                </div>
            </div>

            {warning && (
                <div
                    className="flex items-start gap-2.5 px-4 py-3 mb-4 rounded-lg text-[12px]"
                    style={{ background: "var(--warning-light)", color: "var(--text-secondary)" }}
                >
                    <AlertTriangle size={15} strokeWidth={2} className="shrink-0 mt-0.5" color="var(--warning)" />
                    <div>
                        <div className="font-semibold mb-0.5" style={{ color: "var(--warning)" }}>
                            Warning
                        </div>
                        {warning}
                    </div>
                </div>
            )}

            {/* stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                    { label: "Profiles Found", value: list.length, icon: Globe },
                    { label: "Strong Matches", value: shortlisted.length, icon: CheckCircle },
                    { label: "Avg Score", value: avgScore, icon: BarChart3 },
                    {
                        label: creditsUsed !== undefined ? `${creditsUsed} credits used` : "Via",
                        value: meta.label,
                        icon: provider === "pdl" ? Database : provider === "db" ? History : Globe,
                    },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-(--radius-lg) p-[14px_16px] shadow-(--shadow-sm) border"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                        <stat.icon size={16} strokeWidth={2} color="var(--secondary)" className="mb-1.5" />
                        <div className="text-[20px] font-bold text-(--text-primary) font-data truncate">{stat.value}</div>
                        <div className="text-[11px] text-(--text-muted) mt-0.5">{stat.label}</div>
                    </div>
                ))}
            </div>

            {isFreeText && extractedJD && (
                <div
                    className="px-3 py-2.5 mb-5 rounded-lg text-[12px]"
                    style={{ background: "var(--accent-light)", color: "var(--text-secondary)" }}
                >
                    <span className="font-semibold text-(--text-primary)">{extractedJD.jobTitle || "Untitled role"}</span>
                    {effectiveSkills.length > 0 && (
                        <>
                            {" "}
                            · {effectiveSkills.slice(0, 6).join(", ")}
                            {effectiveSkills.length > 6 ? " …" : ""}
                        </>
                    )}
                    {" "}— auto-detected from your JD by Groq.
                </div>
            )}

            {provider === "pdl" && (
                <div
                    className="flex items-center gap-2 px-4 py-2.5 mb-5 rounded-lg text-[12px]"
                    style={{ background: "var(--warning-light)", color: "var(--text-secondary)" }}
                >
                    <Database size={14} strokeWidth={2} color="var(--warning)" className="shrink-0" />
                    Structured verified data from People Data Labs · {creditsUsed ?? 0} credits consumed ·{" "}
                    {totalFound} total matching profiles in database
                </div>
            )}

            {provider === "db" && (
                <div
                    className="flex items-center gap-2 px-4 py-2.5 mb-5 rounded-lg text-[12px]"
                    style={{ background: "var(--surface-hover)", color: "var(--text-secondary)" }}
                >
                    <History size={14} strokeWidth={2} className="shrink-0" color="var(--text-secondary)" />
                    Searching candidates already saved from previous searches — no API cost, no external calls.
                </div>
            )}

            {/* Phase 5/8 — counts for what's NOT shown, so a shorter-than-expected
               list doesn't look like a bug */}
            {(suppressedByFreshness > 0 || filteredOutByFilters > 0) && (
                <div className="flex items-center gap-3 flex-wrap text-[12px] text-(--text-muted) mb-4 px-1">
                    {suppressedByFreshness > 0 && (
                        <span>{suppressedByFreshness} hidden as already seen in the last 30 days</span>
                    )}
                    {filteredOutByFilters > 0 && (
                        <span>{filteredOutByFilters} hidden by filters</span>
                    )}
                    {suppressedByFreshness > 0 && (
                        <button
                            onClick={runFreshSearch}
                            disabled={loading}
                            className="text-(--accent) underline bg-transparent border-none cursor-pointer p-0 disabled:opacity-60"
                        >
                            Show fresh results instead
                        </button>
                    )}
                </div>
            )}

            {/* Phase 8 — filter panel */}
            <CandidateFiltersPanel
                availableSkills={effectiveSkills}
                initialFilters={lastFilters}
                onApply={applyFilters}
                loading={loading}
            />

            {/* filter row */}
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <span className="text-[12px] text-(--text-muted)">
                    {list.length} profiles · {searchedAt ? new Date(searchedAt).toLocaleTimeString("en-IN") : ""}
                </span>
                <div className="flex gap-1 flex-wrap">
                    {(
                        [
                            ["all", "All", list.length],
                            ["linkedin", "LinkedIn", sourceCounts.linkedin],
                            ["github", "GitHub", sourceCounts.github],
                            ["portfolio", "Portfolio", sourceCounts.portfolio],
                            ["other", "Other", sourceCounts.other],
                        ] as [string, string, number][]
                    )
                        .filter(([val, , count]) => count > 0 || val === "all")
                        .map(([val, label, count]) => (
                            <button
                                key={val}
                                onClick={() => setFilterSource(val as WebCandidate["source"] | "all")}
                                className="text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer font-medium"
                                style={
                                    filterSource === val
                                        ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" }
                                        : { background: "var(--bg)", color: "var(--text-muted)", borderColor: "var(--border)" }
                                }
                            >
                                {label}
                                {count > 0 ? ` (${count})` : ""}
                            </button>
                        ))}
                </div>
            </div>

            {/* cards */}
            {filtered.length === 0 ? (
                <div className="text-center py-12 text-(--text-muted) text-[14px]">
                    {list.length === 0 && (suppressedByFreshness > 0 || filteredOutByFilters > 0)
                        ? "Nothing left to show — everything found was hidden by freshness or filters. Try \"Fresh search\" or loosening a filter."
                        : "No candidates for this filter."}
                </div>
            ) : (
                <div className="flex flex-col gap-[10px]">
                    {filtered.map((c, i) => (
                        <WebCandidateCard
                            key={c.id}
                            c={c}
                            rank={i + 1}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            allSkills={effectiveSkills}
                        />
                    ))}
                </div>
            )}

            <p className="text-center text-[11px] text-(--text-muted) mt-6">
                {provider === "pdl" ? (
                    <>
                        Structured data from{" "}
                        <a href="https://peopledatalabs.com" target="_blank" rel="noopener noreferrer" className="text-(--accent)">
                            People Data Labs
                        </a>{" "}
                        · {creditsUsed ?? 0} of your free credits used
                    </>
                ) : provider === "db" ? (
                    <>Your saved candidate pool · always verify current availability before outreach</>
                ) : (
                    <>
                        Web profiles via{" "}
                        <a href={meta.signupUrl} target="_blank" rel="noopener noreferrer" className="text-(--accent)">
                            {meta.label}
                        </a>{" "}
                        · Always verify before outreach
                    </>
                )}
            </p>
        </div>
    );
}