"use client";
import { Trophy, Medal, XCircle, Ban, ThumbsUp, ThumbsDown, ChevronDown } from "lucide-react";
import type { CandidateResult, ScreeningResponse } from "@/types";
import { toneStyle, recommendationTone } from "@/lib/badgeTones";

const ScoreBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div
            style={{ width: `${(value / max) * 100}%`, background: color, transition: "width 0.6s ease" }}
            className="h-full rounded-full"
        />
    </div>
);

function RankBadge({ rank, disqualified }: { rank: number; disqualified?: boolean }) {
    if (disqualified)
        return (
            <div className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center shrink-0" style={{ background: "var(--danger-light)" }}>
                <XCircle size={15} strokeWidth={2} color="var(--danger)" />
            </div>
        );
    if (rank === 1)
        return (
            <div className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center shrink-0" style={{ background: "var(--warning-light)" }}>
                <Trophy size={15} strokeWidth={2} color="var(--warning)" />
            </div>
        );
    if (rank === 2 || rank === 3)
        return (
            <div className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center shrink-0" style={{ background: "var(--surface-hover)" }}>
                <Medal size={15} strokeWidth={2} color="var(--text-secondary)" />
            </div>
        );
    return (
        <div className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center font-bold text-[12px] font-data shrink-0 text-(--text-muted)" style={{ background: "var(--bg)" }}>
            #{rank}
        </div>
    );
}

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
    const rec = toneStyle(recommendationTone(c.aiAssessment.recommendation));
    const isOpen = expandedId === c.id;

    return (
        <div
            className={`fade-in bg-(--surface) border rounded-(--radius-lg) shadow-(--shadow-sm) overflow-hidden ${isDisqualified ? "opacity-80" : "border-(--border)"}`}
            style={isDisqualified ? { borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" } : undefined}
        >
            <div
                onClick={() => setExpandedId(isOpen ? null : c.id)}
                className="flex items-center gap-[14px] px-[18px] py-[14px] cursor-pointer select-none"
            >
                <RankBadge rank={c.rank} disqualified={isDisqualified} />
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
                                ? "var(--danger)"
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
                    <span
                        className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0"
                        style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)" }}
                    >
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
                <ChevronDown
                    size={14}
                    strokeWidth={2.25}
                    className="text-(--text-muted) shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                />
            </div>

            {isOpen && (
                <div className="border-t border-(--border) p-[18px] bg-(--bg)">
                    {isDisqualified ? (
                        <div>
                            <div
                                className="flex items-start gap-3 p-4 rounded-[var(--radius)] mb-4"
                                style={{ background: "var(--danger-light)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)" }}
                            >
                                <Ban size={18} strokeWidth={2} color="var(--danger)" className="shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-semibold text-[14px] mb-1" style={{ color: "var(--danger)" }}>
                                        Automatically disqualified
                                    </div>
                                    <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                                        This candidate was removed before scoring because they are missing the following mandatory skill
                                        {c.ruleScore.missingMandatorySkills.length > 1 ? "s" : ""}:
                                        <strong style={{ color: "var(--danger)" }}> {c.ruleScore.missingMandatorySkills.join(", ")}</strong>. Mandatory skills are hard
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
                                                className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border"
                                                style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
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
                                    { label: "Skill Match", value: c.ruleScore.skillScore, max: results.customWeights?.skills ?? 30, color: "var(--accent)" },
                                    { label: "Experience", value: c.ruleScore.experienceScore, max: results.customWeights?.experience ?? 25, color: "var(--info)" },
                                    { label: "Education", value: c.ruleScore.educationScore, max: results.customWeights?.education ?? 10, color: "var(--warning)" },
                                    { label: "Role Fit (AI)", value: c.aiAssessment.roleFitScore, max: 100, color: "var(--success)" },
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
                                                    <span
                                                        key={s}
                                                        className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border"
                                                        style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
                                                    >
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
                                                <span
                                                    key={s}
                                                    className="text-[10px] rounded-full px-2 py-0.5"
                                                    style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)" }}
                                                >
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
                                        <div className="text-[11px] font-semibold mb-[6px]" style={{ color: "var(--success)" }}>
                                            ✓ Strengths
                                        </div>
                                        {c.aiAssessment.strengths.map((s, i) => (
                                            <div key={i} className="text-[11px] text-(--text-secondary) py-[3px] border-b border-(--border) leading-snug">
                                                {s}
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold mb-[6px]" style={{ color: "var(--danger)" }}>
                                            ✗ Gaps
                                        </div>
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
                                            <div className="rounded-[6px] p-[10px_12px]" style={{ background: "var(--success-light)" }}>
                                                <div className="flex items-center gap-1.5 text-[11px] font-bold mb-[5px]" style={{ color: "var(--success)" }}>
                                                    <ThumbsUp size={12} strokeWidth={2.25} />
                                                    Why Select
                                                </div>
                                                <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>{c.aiAssessment.whySelect}</p>
                                            </div>
                                        )}
                                        {c.aiAssessment.whyNotSelect && (
                                            <div className="rounded-[6px] p-[10px_12px]" style={{ background: "var(--warning-light)" }}>
                                                <div className="flex items-center gap-1.5 text-[11px] font-bold mb-[5px]" style={{ color: "var(--warning)" }}>
                                                    <ThumbsDown size={12} strokeWidth={2.25} />
                                                    Why Not Select
                                                </div>
                                                <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>{c.aiAssessment.whyNotSelect}</p>
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