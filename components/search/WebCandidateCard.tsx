"use client";
import type { WebCandidate } from "@/lib/webSearchTypes";
import { SOURCE_META, scoreColor, recLabel } from "@/lib/searchProviders";

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
    const src = SOURCE_META[c.source];
    const rec = recLabel(c.relevanceScore);
    const isOpen = expandedId === c.id;
    const rankIcon = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    const isPDL = c.provider === "pdl";

    return (
        <div className="fade-in bg-(--surface) border border-(--border) rounded-(--radius-lg) shadow-(--shadow-sm) overflow-hidden">
            <div
                onClick={() => setExpandedId(isOpen ? null : c.id)}
                className="flex items-center gap-[14px] px-[18px] py-[14px] cursor-pointer select-none"
            >
                <div
                    className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center font-bold text-[13px] shrink-0"
                    style={{
                        background: rank === 1 ? "#fef9c3" : rank === 2 ? "#f1f5f9" : "var(--bg)",
                        color: rank <= 3 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                >
                    {rankIcon}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] text-(--text-primary) overflow-hidden text-ellipsis whitespace-nowrap">
                        {c.name}
                        {isPDL && (
                            <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] border border-[#fcd34d] align-middle">
                                VERIFIED
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-(--text-muted) mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] border shrink-0"
                            style={{ background: src.bg, color: src.color, borderColor: src.border }}
                        >
                            {src.label}
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

                <span
                    className="text-(--text-muted) text-[12px] shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                >
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="border-t border-(--border) p-[18px] bg-(--bg)">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                                Skill Match
                            </div>

                            {[
                                { label: "Skills matched", value: c.matchedSkills.length, max: allSkills.length, color: "#3b82f6" },
                                { label: "Overall relevance", value: c.relevanceScore, max: 100, color: "#10b981" },
                            ].map((bar) => (
                                <div key={bar.label} className="mb-[10px]">
                                    <div className="flex justify-between text-[12px] mb-1">
                                        <span className="text-(--text-secondary)">{bar.label}</span>
                                        <span className="font-semibold text-(--text-primary) font-data">
                                            {bar.value}/{bar.max}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-[#e5e3de] rounded-full overflow-hidden">
                                        <div
                                            style={{ width: `${(bar.value / bar.max) * 100}%`, background: bar.color, transition: "width 0.6s ease" }}
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
                                    <div className="h-1.5 bg-[#e5e3de] rounded-full overflow-hidden">
                                        <div
                                            style={{ width: `${Math.min(100, (c.experienceYears / 15) * 100)}%`, background: "#f59e0b", transition: "width 0.6s ease" }}
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
                                            <span key={s} className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border border-[#bfdbfe]">
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
                                            <span key={s} className="text-[10px] bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] rounded-full px-2 py-0.5">
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
                                        <span className="text-[11px] px-2 py-1 rounded-lg bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]">
                                            🏢 {c.company}
                                        </span>
                                    )}
                                    {c.education && (
                                        <span className="text-[11px] px-2 py-1 rounded-lg bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]">
                                            🎓 {c.education}
                                        </span>
                                    )}
                                    {c.experienceYears !== undefined && c.experienceYears > 0 && (
                                        <span className="text-[11px] px-2 py-1 rounded-lg bg-[#fef9c3] text-[#854d0e] border border-[#fde047]">
                                            📅 {c.experienceYears} yrs exp
                                        </span>
                                    )}
                                </div>
                            )}

                            <p className="text-[12px] text-(--text-secondary) leading-relaxed mb-3">
                                {c.snippet || "No preview available."}
                            </p>

                            <div className="grid grid-cols-1 gap-[10px] mb-3">
                                {c.matchedSkills.length >= 2 && (
                                    <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[6px] p-[10px_12px]">
                                        <div className="text-[11px] font-bold text-(--success) mb-[5px]">👍 Why Consider</div>
                                        <p className="text-[11px] text-[#166534] leading-snug">
                                            Matches {c.matchedSkills.length} of {allSkills.length} JD skills: {c.matchedSkills.slice(0, 3).join(", ")}.
                                            {c.location ? ` Based in ${c.location}.` : ""}
                                            {isPDL ? " Verified structured profile." : ""}
                                        </p>
                                    </div>
                                )}
                                <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[6px] p-[10px_12px]">
                                    <div className="text-[11px] font-bold text-[#c2410c] mb-[5px]">⚠️ {isPDL ? "Gaps" : "Note"}</div>
                                    <p className="text-[11px] text-[#9a3412] leading-snug">
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
                                    className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg text-white border-none transition-opacity hover:opacity-80"
                                    style={{ background: src.color }}
                                >
                                    View on {src.label} ↗
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}