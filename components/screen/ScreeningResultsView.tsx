"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CheckCircle, ClipboardList, XCircle, RotateCcw, Ban } from "lucide-react";
import { useScreening } from "@/context/ScreeningContext";
import JDIntelligencePanel from "@/components/JDIntelligencePanel";
import ScreeningResultCard from "./ScreeningResultCard";

export default function ScreeningResultsView() {
    const router = useRouter();
    const { results, reset } = useScreening();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showDisqualified, setShowDisqualified] = useState(false);

    if (!results) return null;

    const shortlisted = results.candidates.filter((c) =>
        ["Strong Yes", "Yes"].includes(c.aiAssessment.recommendation),
    );
    const dqCount = results.disqualifiedCandidates?.length ?? 0;

    const startNewScreening = () => {
        reset();
        router.push("/screen");
    };

    return (
        <div className="max-w-[900px] mx-auto py-8 px-5">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <h1 className="font-display text-[22px] font-semibold text-(--text-primary)">
                    Screening results
                </h1>
                <button
                    onClick={startNewScreening}
                    className="flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-3 py-1.5 border cursor-pointer"
                    style={{ borderColor: "var(--border)", color: "var(--accent)", background: "var(--surface)" }}
                >
                    <RotateCcw size={13} strokeWidth={2.25} />
                    New screening
                </button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                    { label: "Total Screened", value: results.totalResumes, icon: ClipboardList },
                    { label: "Shortlisted", value: shortlisted.length, icon: CheckCircle },
                    {
                        label: "Avg Score",
                        value:
                            results.candidates.length > 0
                                ? `${Math.round(results.candidates.reduce((s, c) => s + c.finalScore, 0) / results.candidates.length)}`
                                : "—",
                        icon: BarChart3,
                    },
                    { label: "Disqualified", value: dqCount, icon: XCircle },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-(--radius-lg) p-[14px_16px] shadow-(--shadow-sm) border"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                        <stat.icon size={16} strokeWidth={2} color="var(--secondary)" className="mb-1.5" />
                        <div className="text-[22px] font-bold text-(--text-primary) font-data">{stat.value}</div>
                        <div className="text-[11px] text-(--text-muted) mt-0.5">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Mandatory skills used */}
            {results.mandatorySkills?.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-[#FCEBEB] border border-[#F09595] rounded-[var(--radius-lg)]">
                    <Ban size={15} strokeWidth={2} color="#A32D2D" className="shrink-0" />
                    <span className="text-[13px] font-semibold text-[#A32D2D]">Mandatory filter applied:</span>
                    <div className="flex flex-wrap gap-1.5">
                        {results.mandatorySkills.map((s) => (
                            <span
                                key={s}
                                className="text-[12px] px-2 py-0.5 bg-[#FCEBEB] text-[#791F1F] border border-[#F09595] rounded-full font-medium"
                            >
                                {s}
                            </span>
                        ))}
                    </div>
                    <span className="text-[12px] text-[#A32D2D] ml-auto">
                        {dqCount} candidate{dqCount !== 1 ? "s" : ""} removed
                    </span>
                </div>
            )}

            {results.jdIntelligence && (
                <div className="mb-6">
                    <JDIntelligencePanel result={results.jdIntelligence} />
                </div>
            )}

            {/* Qualified candidate cards */}
            {results.candidates.length === 0 ? (
                <div className="text-center py-12 text-(--text-muted) text-[14px]">
                    No qualified candidates — all were disqualified by the mandatory filter.
                </div>
            ) : (
                <div className="flex flex-col gap-[10px]">
                    {results.candidates.map((c) => (
                        <ScreeningResultCard
                            key={c.id}
                            c={c}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            results={results}
                        />
                    ))}
                </div>
            )}

            {/* Disqualified section */}
            {dqCount > 0 && (
                <div className="mt-8">
                    <button
                        onClick={() => setShowDisqualified((v) => !v)}
                        className="w-full flex items-center justify-between px-5 py-3 bg-[#fee2e2] border border-[#fca5a5] rounded-[var(--radius-lg)] cursor-pointer text-left"
                    >
                        <span className="text-[13px] font-semibold text-[#991b1b] flex items-center gap-2">
                            <Ban size={14} strokeWidth={2.25} />
                            {dqCount} disqualified candidate{dqCount !== 1 ? "s" : ""} (missing mandatory skills)
                        </span>
                        <span
                            className="text-[12px] text-[#991b1b] transition-transform duration-200"
                            style={{ transform: showDisqualified ? "rotate(180deg)" : "none" }}
                        >
                            ▼
                        </span>
                    </button>

                    {showDisqualified && (
                        <div className="flex flex-col gap-[10px] mt-3">
                            {results.disqualifiedCandidates.map((c) => (
                                <ScreeningResultCard
                                    key={c.id}
                                    c={c}
                                    expandedId={expandedId}
                                    setExpandedId={setExpandedId}
                                    results={results}
                                    isDisqualified
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <p className="text-center text-[11px] text-(--text-muted) mt-6">
                Processed {results.totalResumes} resumes ·{" "}
                {new Date(results.processedAt).toLocaleString("en-IN")}
            </p>
        </div>
    );
}