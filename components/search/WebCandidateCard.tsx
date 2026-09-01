"use client";
import {
    Trophy,
    Medal,
    Code2,
    Star,
    Globe as GlobeIcon,
    Building2,
    GraduationCap,
    CalendarDays,
    ThumbsUp,
    TriangleAlert,
    BadgeCheck,
    ChevronDown,
    createLucideIcon
} from "lucide-react";
import type { WebCandidate } from "@/lib/webSearchTypes";
import { SOURCE_LABEL, sourceStyle, scoreColor, recLabel } from "@/lib/searchProviders";
import ExpandableRow from "../ExpandableRow";

const Linkedin = createLucideIcon('Linkedin', [
    ['path', { d: 'M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z', key: 'linkedin' }]
]);

const SOURCE_ICON = {
    linkedin: Linkedin,
    github: Code2,
    portfolio: Star,
    other: GlobeIcon,
} as const;

function RankBadge({ rank }: { rank: number }) {
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

export default function WebCandidateCard({
    c,
    rank,
    expandedId,
    setExpandedId,
    allSkills,
}: {
    c: WebCandidate;
    rank: number;
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
    allSkills: string[];
}) {
    const srcStyle = sourceStyle(c.source);
    const SrcIcon = SOURCE_ICON[c.source];
    const rec = recLabel(c.relevanceScore);
    const isOpen = expandedId === c.id;
    const isPDL = c.provider === "pdl";

    return (
        <div className="fade-in bg-(--surface) border border-(--border) rounded-(--radius-lg) shadow-(--shadow-sm) overflow-hidden">
            <ExpandableRow
                isOpen={isOpen}
                onToggle={() => setExpandedId(isOpen ? null : c.id)}
                label={`${isOpen ? "Collapse" : "Expand"} details for ${c.name}`}
                className="flex items-center gap-[14px] px-[18px] py-[14px] cursor-pointer select-none"
            >
                <RankBadge rank={rank} />

                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] text-(--text-primary) overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1.5">
                        {c.name}
                        {isPDL && (
                            <span
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "var(--warning-light)", color: "var(--warning)" }}
                            >
                                <BadgeCheck size={10} strokeWidth={2.5} />
                                VERIFIED
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-(--text-muted) mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] border shrink-0"
                            style={{ background: srcStyle.bg, color: srcStyle.color, borderColor: srcStyle.border }}
                        >
                            <SrcIcon size={10} strokeWidth={2.25} />
                            {SOURCE_LABEL[c.source]}
                        </span>
                        <span className="truncate">{c.title}</span>
                        {c.company && (
                            <>
                                <span className="opacity-30">·</span>
                                <span className="truncate">{c.company}</span>
                            </>
                        )}
                        {c.location && (
                            <>
                                <span className="opacity-30">·</span>
                                <span className="truncate">{c.location}</span>
                            </>
                        )}
                        {c.experienceYears !== undefined && c.experienceYears > 0 && (
                            <>
                                <span className="opacity-30">·</span>
                                <span className="shrink-0">{c.experienceYears} yrs exp</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="text-center shrink-0">
                    <div className="text-[20px] font-bold font-data" style={{ color: scoreColor(c.relevanceScore) }}>
                        {c.relevanceScore}
                    </div>
                    <div className="text-[10px] text-(--text-muted)">/ 100</div>
                </div>

                <span
                    className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0"
                    style={{ background: rec.bg, color: rec.color, border: `1px solid ${rec.border}` }}
                >
                    {rec.label}
                </span>

                <ChevronDown
                    size={14}
                    strokeWidth={2.25}
                    aria-hidden="true"
                    className="text-(--text-muted) shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                />
            </ExpandableRow>

            {isOpen && (
                <div className="border-t border-(--border) p-[18px] bg-(--bg)">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                                Skill Match
                            </div>

                            {[
                                { label: "Skills matched", value: c.matchedSkills.length, max: allSkills.length, color: "var(--accent)" },
                                { label: "Overall relevance", value: c.relevanceScore, max: 100, color: "var(--success)" },
                            ].map((bar) => (
                                <div key={bar.label} className="mb-[10px]">
                                    <div className="flex justify-between text-[12px] mb-1">
                                        <span className="text-(--text-secondary)">{bar.label}</span>
                                        <span className="font-semibold text-(--text-primary) font-data">
                                            {bar.value}/{bar.max}
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                        <div
                                            style={{
                                                width: `${bar.max > 0 ? (bar.value / bar.max) * 100 : 0}%`,
                                                background: bar.color,
                                                transition: "width 0.6s ease",
                                            }}
                                            className="h-full rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}

                            {isPDL && c.experienceYears !== undefined && c.experienceYears > 0 && (
                                <div className="mb-[10px]">
                                    <div className="flex justify-between text-[12px] mb-1">
                                        <span className="text-(--text-secondary)">Experience</span>
                                        <span className="font-semibold text-(--text-primary) font-data">{c.experienceYears} yrs</span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                        <div
                                            style={{ width: `${Math.min(100, (c.experienceYears / 15) * 100)}%`, background: "var(--warning)", transition: "width 0.6s ease" }}
                                            className="h-full rounded-full"
                                        />
                                    </div>
                                </div>
                            )}

                            {c.matchedSkills.length > 0 && (
                                <div className="pt-[14px] border-t border-(--border)">
                                    <div className="text-[11px] font-semibold text-(--text-muted) mb-1">Matched JD Skills</div>
                                    <div className="flex flex-wrap gap-[6px]">
                                        {c.matchedSkills.map((s) => (
                                            <span key={s} className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border" style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}>
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {c.missingSkills.length > 0 && (
                                <div className="mt-3">
                                    <div className="text-[11px] font-semibold text-(--text-muted) mb-1">Missing JD Skills</div>
                                    <div className="flex flex-wrap gap-1">
                                        {c.missingSkills.slice(0, 8).map((s) => (
                                            <span key={s} className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)" }}>
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">Profile</div>

                            {isPDL && (c.company || c.education || c.experienceYears) && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {c.company && (
                                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ background: "var(--success-light)", color: "var(--success)" }}>
                                            <Building2 size={11} strokeWidth={2.25} />
                                            {c.company}
                                        </span>
                                    )}
                                    {c.education && (
                                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ background: "var(--info-light)", color: "var(--info)" }}>
                                            <GraduationCap size={11} strokeWidth={2.25} />
                                            {c.education}
                                        </span>
                                    )}
                                    {c.experienceYears !== undefined && c.experienceYears > 0 && (
                                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ background: "var(--warning-light)", color: "var(--warning)" }}>
                                            <CalendarDays size={11} strokeWidth={2.25} />
                                            {c.experienceYears} yrs exp
                                        </span>
                                    )}
                                </div>
                            )}

                            <p className="text-[12px] text-(--text-secondary) leading-relaxed mb-3">
                                {c.snippet || "No preview available."}
                            </p>

                            <div className="grid grid-cols-1 gap-[10px] mb-3">
                                {c.matchedSkills.length >= 2 && (
                                    <div className="rounded-[6px] p-[10px_12px]" style={{ background: "var(--success-light)" }}>
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold mb-[5px]" style={{ color: "var(--success)" }}>
                                            <ThumbsUp size={12} strokeWidth={2.25} />
                                            Why Consider
                                        </div>
                                        <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                                            Matches {c.matchedSkills.length} of {allSkills.length} JD skills: {c.matchedSkills.slice(0, 3).join(", ")}.
                                            {c.location ? ` Based in ${c.location}.` : ""}
                                            {isPDL ? " Verified structured profile." : ""}
                                        </p>
                                    </div>
                                )}
                                <div className="rounded-[6px] p-[10px_12px]" style={{ background: "var(--warning-light)" }}>
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold mb-[5px]" style={{ color: "var(--warning)" }}>
                                        <TriangleAlert size={12} strokeWidth={2.25} />
                                        {isPDL ? "Gaps" : "Note"}
                                    </div>
                                    <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                                        {c.missingSkills.length > 0
                                            ? `Missing ${c.missingSkills.length} skill${c.missingSkills.length > 1 ? "s" : ""}: ${c.missingSkills.slice(0, 3).join(", ")}.`
                                            : "All key skills matched."}
                                        {!isPDL ? " Web profile — verify before outreach." : ""}
                                    </p>
                                </div>
                            </div>

                            {c.url && (
                                <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border-none transition-opacity hover:opacity-80"
                                    style={{ background: srcStyle.color, color: "#fff" }}
                                >
                                    View on {SOURCE_LABEL[c.source]} ↗
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}