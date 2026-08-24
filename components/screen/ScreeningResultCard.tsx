"use client";
import type { CandidateResult, ScreeningResponse } from "@/types";

const recommendationStyle = (rec: string) => {
    switch (rec) {
        case "Strong Yes":
            return { bg: "#dcfce7", color: "#15803d", border: "#86efac" };
        case "Yes":
            return { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" };
        case "Maybe":
            return { bg: "#fef9c3", color: "#854d0e", border: "#fde047" };
        case "No":
            return { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" };
        default:
            return { bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
    }
};

const ScoreBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
    <div className="h-1.5 bg-[#e5e3de] rounded-full overflow-hidden">
        <div
            style={{ width: `${(value / max) * 100}%`, background: color, transition: "width 0.6s ease" }}
            className="h-full rounded-full"
        />
    </div>
);

export default function ScreeningResultCard({
    c,
    expandedId,
    setExpandedId,
    results,
    isDisqualified,
}: {
    c: CandidateResult;
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
    results: ScreeningResponse;
    isDisqualified?: boolean;
}) {
    const rec = recommendationStyle(c.aiAssessment.recommendation);
    const isOpen = expandedId === c.id;

    return (
        <div
            className={`fade-in bg-(--surface) border rounded-(--radius-lg) shadow-(--shadow-sm) overflow-hidden ${isDisqualified ? "border-[#fca5a5] opacity-80" : "border-(--border)"}`}
        >
            <div
                onClick={() => setExpandedId(isOpen ? null : c.id)}
                className="flex items-center gap-[14px] px-[18px] py-[14px] cursor-pointer select-none"
            >
                <div
                    className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center font-bold text-[13px] shrink-0"
                    style={{
                        background: isDisqualified
                            ? "#fee2e2"
                            : c.rank === 1
                                ? "#fef9c3"
                                : c.rank === 2
                                    ? "#f1f5f9"
                                    : "var(--bg)",
                        color: isDisqualified ? "#991b1b" : c.rank <= 3 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                >
                    {isDisqualified ? "✗" : c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `#${c.rank}`}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] text-(--text-primary) overflow-hidden text-ellipsis whitespace-nowrap">
                        {c.fileName.replace(/\.[^.]+$/, "")}
                    </div>
                    <div className="text-[11px] text-(--text-muted) mt-0.5">
                        {isDisqualified
                            ? `Missing mandatory: ${c.ruleScore.missingMandatorySkills.join(", ")}`
                            : `${c.ruleScore.experienceYears > 0 ? `${c.ruleScore.experienceYears} yrs exp · ` : ""}${c.ruleScore.matchedSkills.slice(0, 3).join(", ") || "No skills matched"}`}
                    </div>
                </div>
                <div className="text-center shrink-0">
                    <div
                        className="text-[20px] font-bold font-data"
                        style={{
                            color: isDisqualified
                                ? "#991b1b"
                                : c.finalScore >= 70
                                    ? "var(--success)"
                                    : c.finalScore >= 50
                                        ? "var(--warning)"
                                        : "var(--danger)",
                        }}
                    >
                        {isDisqualified ? "DQ" : c.finalScore}
                    </div>
                    <div className="text-[10px] text-(--text-muted)">{isDisqualified ? "" : "/ 100"}</div>
                </div>
                {isDisqualified ? (
                    <span className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0 bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5]">
                        Disqualified
                    </span>
                ) : (
                    <span
                        className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0"
                        style={{ background: rec.bg, color: rec.color, border: `1px solid ${rec.border}` }}
                    >
                        {c.aiAssessment.recommendation}
                    </span>
                )}
                <span
                    className="text-(--text-muted) text-[12px] shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                >
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="border-t border-(--border) p-[18px] bg-(--bg)">
                    {isDisqualified ? (
                        <div>
                            <div className="flex items-start gap-3 p-4 bg-[#fee2e2] border border-[#fca5a5] rounded-[var(--radius)] mb-4">
                                <span className="text-[20px]">🚫</span>
                                <div>
                                    <div className="font-semibold text-[14px] text-[#991b1b] mb-1">Automatically disqualified</div>
                                    <p className="text-[13px] text-[#991b1b]">
                                        This candidate was removed before scoring because they are missing the following mandatory skill
                                        {c.ruleScore.missingMandatorySkills.length > 1 ? "s" : ""}:
                                        <strong> {c.ruleScore.missingMandatorySkills.join(", ")}</strong>. Mandatory skills are hard
                                        filters — no exceptions.
                                    </p>
                                </div>
                            </div>
                            {c.ruleScore.matchedSkills.length > 0 && (
                                <div>
                                    <div className="text-[11px] font-semibold text-(--text-muted) mb-2">Skills they do have</div>
                                    <div className="flex flex-wrap gap-[6px]">
                                        {c.ruleScore.matchedSkills.map((s) => (
                                            <span
                                                key={s}
                                                className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border border-[#bfdbfe]"
                                            >
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                                    Score Breakdown
                                </div>
                                {[
                                    { label: "Skill Match", value: c.ruleScore.skillScore, max: results.customWeights?.skills ?? 30, color: "#3b82f6" },
                                    { label: "Experience", value: c.ruleScore.experienceScore, max: results.customWeights?.experience ?? 25, color: "#2563eb" },
                                    { label: "Education", value: c.ruleScore.educationScore, max: results.customWeights?.education ?? 10, color: "#f59e0b" },
                                    { label: "Role Fit (AI)", value: c.aiAssessment.roleFitScore, max: 100, color: "#10b981" },
                                ].map((s) => (
                                    <div key={s.label} className="mb-[10px]">
                                        <div className="flex justify-between text-[12px] mb-1">
                                            <span className="text-(--text-secondary)">{s.label}</span>
                                            <span className="font-semibold text-(--text-primary) font-data">
                                                {s.value}/{s.max}
                                            </span>
                                        </div>
                                        <ScoreBar value={s.value} max={s.max} color={s.color} />
                                    </div>
                                ))}

                                {c.ruleScore.matchedSkills.length > 0 && (
                                    <div className="mt-[14px] pt-[14px] border-t border-(--border)">
                                        <div className="text-[11px] font-semibold text-(--text-muted) mb-1">Matched JD Skills</div>
                                        <div className="flex flex-wrap gap-[6px]">
                                            {c.ruleScore.matchedSkills.map((s) => {
                                                const mult = results.skillMultipliers?.[s];
                                                return (
                                                    <span key={s} className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border border-[#bfdbfe]">
                                                        {s}
                                                        {mult !== undefined && mult !== 1.0 ? ` ×${mult.toFixed(1)}` : ""}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {c.ruleScore.missingSkills.length > 0 && (
                                    <div className="mt-3">
                                        <div className="text-[11px] font-semibold text-(--text-muted) mb-1">Missing JD Skills</div>
                                        <div className="flex flex-wrap gap-1">
                                            {c.ruleScore.missingSkills.slice(0, 8).map((s) => (
                                                <span key={s} className="text-[10px] bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] rounded-full px-2 py-0.5">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                                    AI Assessment
                                </div>
                                <p className="text-[12px] text-(--text-secondary) leading-relaxed mb-3">{c.aiAssessment.explanation}</p>
                                <div className="grid grid-cols-2 gap-[10px] mb-3">
                                    <div>
                                        <div className="text-[11px] font-semibold text-(--success) mb-[6px]">✓ Strengths</div>
                                        {c.aiAssessment.strengths.map((s, i) => (
                                            <div key={i} className="text-[11px] text-(--text-secondary) py-[3px] border-b border-(--border) leading-snug">
                                                {s}
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold text-(--danger) mb-[6px]">✗ Gaps</div>
                                        {c.aiAssessment.gaps.map((g, i) => (
                                            <div key={i} className="text-[11px] text-(--text-secondary) py-[3px] border-b border-(--border) leading-snug">
                                                {g}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {(c.aiAssessment.whySelect || c.aiAssessment.whyNotSelect) && (
                                    <div className="grid grid-cols-2 gap-[10px]">
                                        {c.aiAssessment.whySelect && (
                                            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[6px] p-[10px_12px]">
                                                <div className="text-[11px] font-bold text-(--success) mb-[5px]">👍 Why Select</div>
                                                <p className="text-[11px] text-[#166534] leading-snug">{c.aiAssessment.whySelect}</p>
                                            </div>
                                        )}
                                        {c.aiAssessment.whyNotSelect && (
                                            <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[6px] p-[10px_12px]">
                                                <div className="text-[11px] font-bold text-[#c2410c] mb-[5px]">👎 Why Not Select</div>
                                                <p className="text-[11px] text-[#9a3412] leading-snug">{c.aiAssessment.whyNotSelect}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}