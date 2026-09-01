"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, CheckCircle, BarChart3, Database, AlertTriangle, RotateCcw } from "lucide-react";
import { useWebSearch } from "@/context/WebSearchContext";
import { useJD } from "@/context/JDContext";
import { PROVIDERS } from "@/lib/searchProviders";
import type { WebCandidate } from "@/lib/webSearchTypes";
import WebCandidateCard from "./WebCandidateCard";

export default function SearchResultsView() {
    const router = useRouter();
    const { jdMode } = useJD();
    const {
        provider,
        results,
        totalFound,
        searchedAt,
        creditsUsed,
        extractedJD,
        warning,
        reset,
    } = useWebSearch();

    const [filterSource, setFilterSource] = useState<WebCandidate["source"] | "all">("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const meta = PROVIDERS[provider];
    const isFreeText = jdMode === "freetext";

    const effectiveSkills =
        isFreeText && extractedJD
            ? [...new Set([...extractedJD.mandatorySkills, ...extractedJD.mustHaveSkills, ...extractedJD.niceToHaveSkills])]
            : [];

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

    return (
        <div className="max-w-4xl mx-auto py-8 px-5">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <h1 className="font-display text-[22px] font-semibold text-(--text-primary)">
                    Search results
                </h1>
                <button
                    onClick={startNewSearch}
                    className="flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-3 py-1.5 border cursor-pointer"
                    style={{ borderColor: "var(--border)", color: "var(--accent)", background: "var(--surface)" }}
                >
                    <RotateCcw size={13} strokeWidth={2.25} />
                    New search
                </button>
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
            <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                    { label: "Profiles Found", value: list.length, icon: Globe },
                    { label: "Strong Matches", value: shortlisted.length, icon: CheckCircle },
                    { label: "Avg Score", value: avgScore, icon: BarChart3 },
                    {
                        label: creditsUsed !== undefined ? `${creditsUsed} credits used` : "Via",
                        value: meta.label,
                        icon: provider === "pdl" ? Database : Globe,
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
                    No candidates for this filter.
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