"use client";
import { useState } from "react";
import type { StructuredJD, JDMode } from "@/types";
import { BarChart3, CheckCircle, Globe, Database, Sparkles } from "lucide-react";

export interface WebCandidate {
    id: string;
    name: string;
    title: string;
    company: string;
    url: string;
    source: "linkedin" | "github" | "portfolio" | "other";
    snippet: string;
    matchedSkills: string[];
    missingSkills: string[];
    relevanceScore: number;
    location?: string;
    experienceYears?: number;
    education?: string;
    provider: "pdl" | "tavily" | "exa" | "serper" | "github";
}

type Provider = "pdl" | "tavily" | "exa" | "serper" | "github";

interface ExtractedJD {
    jobTitle: string;
    mandatorySkills: string[];
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
}

interface Props {
    structuredJD: StructuredJD;
    jdText: string;
    // NEW — needed to support free-text JD search
    jdMode: JDMode;
    groqApiKey: string;
}

// ─── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS: Record<
    Provider,
    {
        label: string;
        free: string;
        signupUrl: string;
        placeholder: string;
        keyHint: string;
        bestFor: string;
        badgeBg: string;
        badgeColor: string;
        badgeBorder: string;
        tip: string;
        isStructured: boolean;
        icon: string;
    }
> = {
    pdl: {
        label: "People Data Labs",
        free: "100 records/month (500 on trial)",
        signupUrl: "https://peopledatalabs.com",
        placeholder: "Paste your PDL API key…",
        keyHint: "Sign up → Dashboard → API Keys",
        bestFor: "Best accuracy",
        badgeBg: "#fef3c7",
        badgeColor: "#92400e",
        badgeBorder: "#fcd34d",
        tip: "Structured database of 1.5B+ verified profiles with real skills, job history, education, and LinkedIn URLs. Not web scraping — actual person records. Best accuracy for both tech and non-tech roles.",
        isStructured: true,
        icon: "🗄️",
    },
    github: {
        label: "GitHub",
        free: "60/hr free, 5,000/hr with a token",
        signupUrl: "https://github.com/settings/tokens",
        placeholder: "ghp_… (optional — leave blank to use free tier)",
        keyHint: "Optional. Settings → Developer settings → Personal access tokens → Generate (no scopes needed)",
        bestFor: "Free • Technical roles",
        badgeBg: "#dcfce7",
        badgeColor: "#166534",
        badgeBorder: "#86efac",
        tip: "Searches real GitHub profiles by location + language + bio keywords, then pulls each profile's bio, company, and repo activity directly from GitHub's API. Completely free, no signup required — add a personal access token only if you hit the 60/hr rate limit.",
        isStructured: false,
        icon: "🐙",
    },
    tavily: {
        label: "Tavily",
        free: "1,000/month forever",
        signupUrl: "https://tavily.com",
        placeholder: "tvly-…",
        keyHint: "Sign up → Dashboard → API Keys",
        bestFor: "Non-technical roles",
        badgeBg: "#fce7f3",
        badgeColor: "#be185d",
        badgeBorder: "#f9a8d4",
        tip: "Web search. Best for non-technical roles (marketing, HR, sales, finance) — returns good coverage of professional profiles and portfolio pages. Less accurate than PDL since results are web-scraped.",
        isStructured: false,
        icon: "🔍",
    },
    exa: {
        label: "Exa",
        free: "$20 signup + $10/month",
        signupUrl: "https://exa.ai",
        placeholder: "exa-…",
        keyHint: "Sign up → API Keys → Create key",
        bestFor: "Technical roles",
        badgeBg: "#ede9fe",
        badgeColor: "#6d28d9",
        badgeBorder: "#c4b5fd",
        tip: "Neural web search. Best for technical roles (engineers, developers, data scientists) — semantic search trained on 1B+ profiles surfaces GitHub and LinkedIn for tech candidates well.",
        isStructured: false,
        icon: "🧠",
    },
    serper: {
        label: "Serper",
        free: "2,500 one-time",
        signupUrl: "https://serper.dev",
        placeholder: "Paste your Serper API key…",
        keyHint: "Sign up → Dashboard → API Key",
        bestFor: "General fallback",
        badgeBg: "#dbeafe",
        badgeColor: "#1d4ed8",
        badgeBorder: "#93c5fd",
        tip: "Raw Google results. Good fallback for both role types but may surface job postings — filtered automatically. Use PDL for accurate structured results.",
        isStructured: false,
        icon: "🌐",
    },
};

// ─── Source badge ──────────────────────────────────────────────────────────────
const SOURCE_META = {
    linkedin: {
        label: "LinkedIn",
        icon: "in",
        color: "#0077b5",
        bg: "#e8f4fb",
        border: "#93c5fd",
    },
    github: {
        label: "GitHub",
        icon: "gh",
        color: "#24292f",
        bg: "#f3f4f6",
        border: "#d1d5db",
    },
    portfolio: {
        label: "Portfolio",
        icon: "★",
        color: "#7c3aed",
        bg: "#ede9fe",
        border: "#c4b5fd",
    },
    other: {
        label: "Web",
        icon: "🌐",
        color: "#374151",
        bg: "#f9fafb",
        border: "#e5e7eb",
    },
} as const;

function scoreColor(s: number) {
    return s >= 70
        ? "var(--success)"
        : s >= 50
            ? "var(--warning)"
            : "var(--danger)";
}

function recLabel(score: number) {
    if (score >= 75)
        return {
            label: "Strong Match",
            bg: "#dcfce7",
            color: "#15803d",
            border: "#86efac",
        };
    if (score >= 55)
        return {
            label: "Good Match",
            bg: "#dbeafe",
            color: "#1d4ed8",
            border: "#93c5fd",
        };
    if (score >= 35)
        return {
            label: "Partial",
            bg: "#fef9c3",
            color: "#854d0e",
            border: "#fde047",
        };
    return {
        label: "Low Match",
        bg: "#fee2e2",
        color: "#991b1b",
        border: "#fca5a5",
    };
}

// ─── Candidate card ────────────────────────────────────────────────────────────
function CandidateCard({
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
    const rankIcon =
        rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    const isPDL = c.provider === "pdl";

    return (
        <div className="fade-in bg-(--surface) border border-(--border) rounded-(--radius-lg) shadow-(--shadow-sm) overflow-hidden">
            {/* ── Collapsed row ── */}
            <div
                onClick={() => setExpandedId(isOpen ? null : c.id)}
                className="flex items-center gap-[14px] px-[18px] py-[14px] cursor-pointer select-none"
            >
                {/* rank */}
                <div
                    className="w-8 h-8 rounded-[8px] border border-(--border) flex items-center justify-center font-bold text-[13px] shrink-0"
                    style={{
                        background:
                            rank === 1 ? "#fef9c3" : rank === 2 ? "#f1f5f9" : "var(--bg)",
                        color: rank <= 3 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                >
                    {rankIcon}
                </div>

                {/* name + meta */}
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
                            style={{
                                background: src.bg,
                                color: src.color,
                                borderColor: src.border,
                            }}
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

                {/* score */}
                <div className="text-center shrink-0">
                    <div
                        className="text-[20px] font-bold"
                        style={{ color: scoreColor(c.relevanceScore) }}
                    >
                        {c.relevanceScore}
                    </div>
                    <div className="text-[10px] text-(--text-muted)">/ 100</div>
                </div>

                {/* rec pill */}
                <span
                    className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0"
                    style={{
                        background: rec.bg,
                        color: rec.color,
                        border: `1px solid ${rec.border}`,
                    }}
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

            {/* ── Expanded ── */}
            {isOpen && (
                <div className="border-t border-(--border) p-[18px] bg-(--bg)">
                    <div className="grid grid-cols-2 gap-4">
                        {/* left: skill bars */}
                        <div>
                            <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                                Skill Match
                            </div>

                            {[
                                {
                                    label: "Skills matched",
                                    value: c.matchedSkills.length,
                                    max: allSkills.length,
                                    color: "#3b82f6",
                                },
                                {
                                    label: "Overall relevance",
                                    value: c.relevanceScore,
                                    max: 100,
                                    color: "#10b981",
                                },
                            ].map((bar) => (
                                <div key={bar.label} className="mb-[10px]">
                                    <div className="flex justify-between text-[12px] mb-1">
                                        <span className="text-(--text-secondary)">{bar.label}</span>
                                        <span className="font-semibold text-(--text-primary)">
                                            {bar.value}/{bar.max}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-[#e5e3de] rounded-full overflow-hidden">
                                        <div
                                            style={{
                                                width: `${(bar.value / bar.max) * 100}%`,
                                                background: bar.color,
                                                transition: "width 0.6s ease",
                                            }}
                                            className="h-full rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}

                            {isPDL &&
                                c.experienceYears !== undefined &&
                                c.experienceYears > 0 && (
                                    <div className="mb-[10px]">
                                        <div className="flex justify-between text-[12px] mb-1">
                                            <span className="text-(--text-secondary)">
                                                Experience
                                            </span>
                                            <span className="font-semibold text-(--text-primary)">
                                                {c.experienceYears} yrs
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-[#e5e3de] rounded-full overflow-hidden">
                                            <div
                                                style={{
                                                    width: `${Math.min(100, (c.experienceYears / 15) * 100)}%`,
                                                    background: "#f59e0b",
                                                    transition: "width 0.6s ease",
                                                }}
                                                className="h-full rounded-full"
                                            />
                                        </div>
                                    </div>
                                )}

                            {c.matchedSkills.length > 0 && (
                                <div className="pt-[14px] border-t border-(--border)">
                                    <div className="text-[11px] font-semibold text-(--text-muted) mb-1">
                                        Matched JD Skills
                                    </div>
                                    <div className="flex flex-wrap gap-[6px]">
                                        {c.matchedSkills.map((s) => (
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

                            {c.missingSkills.length > 0 && (
                                <div className="mt-3">
                                    <div className="text-[11px] font-semibold text-(--text-muted) mb-1">
                                        Missing JD Skills
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {c.missingSkills.slice(0, 8).map((s) => (
                                            <span
                                                key={s}
                                                className="text-[10px] bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] rounded-full px-2 py-0.5"
                                            >
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* right: profile info */}
                        <div>
                            <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                                Profile
                            </div>

                            {/* PDL verified info strip */}
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
                                        <div className="text-[11px] font-bold text-(--success) mb-[5px]">
                                            👍 Why Consider
                                        </div>
                                        <p className="text-[11px] text-[#166534] leading-snug">
                                            Matches {c.matchedSkills.length} of {allSkills.length} JD
                                            skills: {c.matchedSkills.slice(0, 3).join(", ")}.
                                            {c.location ? ` Based in ${c.location}.` : ""}
                                            {isPDL ? " Verified structured profile." : ""}
                                        </p>
                                    </div>
                                )}
                                <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[6px] p-[10px_12px]">
                                    <div className="text-[11px] font-bold text-[#c2410c] mb-[5px]">
                                        ⚠️ {isPDL ? "Gaps" : "Note"}
                                    </div>
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

// ─── Provider selector card ────────────────────────────────────────────────────
function ProviderCard({
    id,
    selected,
    onSelect,
}: {
    id: Provider;
    selected: boolean;
    onSelect: () => void;
}) {
    const p = PROVIDERS[id];
    return (
        <div
            onClick={onSelect}
            className="flex-1 border rounded-xl p-3.5 cursor-pointer transition-all select-none min-w-0"
            style={{
                borderColor: selected ? "var(--accent)" : "var(--border)",
                background: selected ? "var(--accent-light)" : "var(--bg)",
                boxShadow: selected
                    ? "0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent)"
                    : "none",
            }}
        >
            <div className="flex items-center justify-between mb-1.5 gap-1 flex-wrap">
                <div className="flex items-center gap-2">
                    <div
                        className="w-2.5 h-2.5 rounded-full border-2 transition-colors shrink-0"
                        style={{
                            borderColor: selected ? "var(--accent)" : "var(--border)",
                            background: selected ? "var(--accent)" : "transparent",
                        }}
                    />
                    <span className="font-semibold text-[12px] text-(--text-primary)">
                        {p.icon} {p.label}
                    </span>
                </div>
                <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0"
                    style={{
                        background: p.badgeBg,
                        color: p.badgeColor,
                        borderColor: p.badgeBorder,
                    }}
                >
                    {p.bestFor}
                </span>
            </div>
            <div className="text-[11px] text-(--text-muted) mb-1">
                <span className="font-medium" style={{ color: "var(--success)" }}>
                    Free:
                </span>{" "}
                {p.free}
            </div>
            {p.isStructured && (
                <div className="text-[9px] font-semibold text-[#92400e] bg-[#fef3c7] border border-[#fcd34d] rounded px-1.5 py-0.5 inline-block mb-1">
                    ✓ Structured data · Not web scraping
                </div>
            )}
            {selected && (
                <p className="text-[11px] text-[var(--text-secondary)] leading-snug mt-1.5 border-t border-(--border) pt-1.5">
                    {p.tip}
                </p>
            )}
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function WebCandidateSearch({ structuredJD, jdText, jdMode, groqApiKey }: Props) {
    const [provider, setProvider] = useState<Provider>("pdl");
    const [apiKey, setApiKey] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [results, setResults] = useState<WebCandidate[] | null>(null);
    const [searchedAt, setSearchedAt] = useState("");
    const [totalFound, setTotalFound] = useState(0);
    const [creditsUsed, setCreditsUsed] = useState<number | undefined>();
    const [filterSource, setFilterSource] = useState<
        WebCandidate["source"] | "all"
    >("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showSetup, setShowSetup] = useState(true);
    const [warning, setWarning] = useState("");

    // What Groq inferred from a free-text JD, filled in after search
    const [extractedInfo, setExtractedInfo] = useState<ExtractedJD | null>(null);

    const isFreeText = jdMode === "freetext";

    const structuredSkills = [
        ...new Set([
            ...structuredJD.mandatorySkills,
            ...structuredJD.mustHaveSkills,
            ...structuredJD.niceToHaveSkills,
        ]),
    ];

    // Skills used for match bars / chips — from Groq extraction in free-text
    // mode (once a search has run), otherwise the structured JD as before.
    const effectiveSkills =
        isFreeText && extractedInfo
            ? [
                ...new Set([
                    ...extractedInfo.mandatorySkills,
                    ...extractedInfo.mustHaveSkills,
                    ...extractedInfo.niceToHaveSkills,
                ]),
            ]
            : structuredSkills;

    const meta = PROVIDERS[provider];

    const apiKeyOk = provider === "github" ? true : apiKey.trim().length > 4;

    const canSearch = isFreeText
        ? apiKeyOk && groqApiKey.trim().length > 10 && jdText.trim().length >= 20
        : apiKeyOk &&
        (structuredJD.title.trim().length > 0 ||
            structuredJD.mustHaveSkills.length > 0 ||
            structuredJD.mandatorySkills.length > 0);

    const handleSearch = async () => {
        setLoading(true);
        setError("");
        setResults(null);
        setExpandedId(null);
        try {
            const res = await fetch("/api/search-candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    apiKey: apiKey.trim(),
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
            setExtractedInfo(data.extractedJD ?? null);
            setWarning(data.warning ?? null);
            setShowSetup(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    const filtered =
        results?.filter(
            (c) => filterSource === "all" || c.source === filterSource,
        ) ?? [];
    const shortlisted = results?.filter((c) => c.relevanceScore >= 55) ?? [];
    const avgScore = results?.length
        ? Math.round(
            results.reduce((s, c) => s + c.relevanceScore, 0) / results.length,
        )
        : 0;
    const sourceCounts = results
        ? (
            ["linkedin", "github", "portfolio", "other"] as WebCandidate["source"][]
        ).reduce(
            (acc, s) => {
                acc[s] = results.filter((c) => c.source === s).length;
                return acc;
            },
            {} as Record<WebCandidate["source"], number>,
        )
        : null;

    return (
        <div className="flex flex-col gap-4">
            {/* ── Setup panel ── */}
            {showSetup && (
                <>
                    <div className="bg-(--surface) border border-(--border) rounded-(--radius-lg) p-5 shadow-(--shadow-sm)">
                        {/* PDL recommended banner */}
                        <div className="flex items-center gap-2.5 mb-4 px-3 py-2.5 bg-[#fef9c3] border border-[#fcd34d] rounded-lg">
                            <Database className="w-4 h-4 text-[#92400e] shrink-0" />
                            <p className="text-[12px] text-[#78350f]">
                                <span className="font-semibold">Recommended:</span> Use{" "}
                                <strong>People Data Labs</strong> for verified, structured
                                candidate data — unlike web search providers which scrape and
                                guess.
                            </p>
                        </div>

                        <div className="text-[11px] font-semibold text-(--text-muted) uppercase tracking-widest mb-3">
                            Choose provider
                        </div>

                        {/* Provider cards — free options first, then paid web fallbacks */}
                        <div className="flex flex-col gap-2 mb-4">
                            <div className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-widest mt-1">
                                Free options
                            </div>
                            <div className="flex gap-2">
                                <ProviderCard
                                    id="pdl"
                                    selected={provider === "pdl"}
                                    onSelect={() => {
                                        setProvider("pdl");
                                        setApiKey("");
                                        setError("");
                                    }}
                                />
                                <ProviderCard
                                    id="github"
                                    selected={provider === "github"}
                                    onSelect={() => {
                                        setProvider("github");
                                        setApiKey("");
                                        setError("");
                                    }}
                                />
                            </div>
                            <div className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-widest mt-1">
                                Web search fallbacks
                            </div>
                            <div className="flex gap-2">
                                {(["tavily", "exa", "serper"] as Provider[]).map((id) => (
                                    <ProviderCard
                                        key={id}
                                        id={id}
                                        selected={provider === id}
                                        onSelect={() => {
                                            setProvider(id);
                                            setApiKey("");
                                            setError("");
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* API key */}
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[13px] font-medium text-(--text-primary)">
                                {meta.label} API Key
                            </label>
                            <a
                                href={meta.signupUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-(--accent) underline"
                            >
                                Get free key ↗
                            </a>
                        </div>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={meta.placeholder}
                            className="w-full border border-(--border) rounded-(--radius) px-3 py-2.5 text-[13px] font-mono text-(--text-primary) bg-(--bg) outline-none focus:border-(--accent) mb-2"
                            disabled={loading}
                        />
                        <p className="text-[11px] text-(--text-muted)">
                            💡 {meta.keyHint} · Free: {meta.free}
                        </p>
                    </div>

                    {/* JD context — structured mode shows the fields directly */}
                    {!isFreeText && (structuredJD.title || structuredSkills.length > 0) && (
                        <div className="px-3 py-2.5 bg-(--bg) border border-(--border) rounded-(--radius) text-[12px] text-(--text-secondary)">
                            <span className="font-semibold text-(--text-primary)">
                                {structuredJD.title || "Untitled role"}
                            </span>
                            {structuredSkills.length > 0 && (
                                <>
                                    {" "}
                                    ·{" "}
                                    <span className="text-(--accent)">
                                        {structuredSkills.slice(0, 5).join(", ")}
                                        {structuredSkills.length > 5 ? " …" : ""}
                                    </span>
                                </>
                            )}
                        </div>
                    )}

                    {/* Free-text mode — explain the auto-extraction step */}
                    {isFreeText && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg text-[12px] text-[#1e3a8a]">
                            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Free-text JD detected — before searching, Groq will read your
                                job description and auto-detect the role title and required
                                skills.
                                {!groqApiKey.trim() && (
                                    <>
                                        {" "}
                                        Add your Groq API key in the setup step above to enable
                                        this.
                                    </>
                                )}
                                {jdText.trim().length > 0 && jdText.trim().length < 20 && (
                                    <> Write a bit more detail in the JD first.</>
                                )}
                            </span>
                        </div>
                    )}

                    {!canSearch && (
                        <p className="text-[12px] text-(--text-muted) text-center">
                            {!apiKeyOk
                                ? `Paste your ${meta.label} API key above`
                                : isFreeText
                                    ? !groqApiKey.trim()
                                        ? "Add your Groq API key in the setup step above"
                                        : "Write at least 20 characters of job description first"
                                    : "Add a job title or skills to the JD first"}
                        </p>
                    )}

                    {error && (
                        <div className="px-4 py-3 bg-[#fef2f2] border border-[#fca5a5] rounded-(--radius) text-[13px] text-[#991b1b]">
                            ⚠️ {error}
                            {error.includes("Invalid") && (
                                <>
                                    {" "}
                                    ·{" "}
                                    <a
                                        href={meta.signupUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline"
                                    >
                                        Get a free key
                                    </a>
                                </>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleSearch}
                        disabled={!canSearch || loading}
                        className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] border-none transition-all tracking-[-0.01em]"
                        style={{
                            background: !canSearch || loading ? "#93c5fd" : "var(--accent)",
                            cursor: !canSearch || loading ? "not-allowed" : "pointer",
                        }}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                {isFreeText
                                    ? "Reading JD & searching…"
                                    : provider === "pdl"
                                        ? "Querying People Data Labs…"
                                        : `Searching via ${meta.label}…`}
                            </span>
                        ) : provider === "pdl" ? (
                            "🗄️ Find Candidates via PDL"
                        ) : (
                            `🔍 Find Candidates via ${meta.label}`
                        )}
                    </button>
                </>
            )}

            {/* ── Results ── */}
            {results && (
                <div className="flex flex-col gap-4">

                    {warning && (
                        <div className="flex items-start gap-2.5 px-4 py-3 bg-[#fffbeb] border border-[#fcd34d] rounded-lg text-[12px] text-[#92400e]">
                            <span className="text-[15px] shrink-0">⚠️</span>

                            <div>
                                <div className="font-semibold mb-0.5">
                                    Warning
                                </div>
                                <div className="leading-relaxed">
                                    {warning}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* stats */}
                    <div className="grid grid-cols-4 gap-3">
                        {[
                            {
                                label: "Profiles Found",
                                value: results.length,
                                icon: <Globe className="w-4 h-4" />,
                            },
                            {
                                label: "Strong Matches",
                                value: shortlisted.length,
                                icon: <CheckCircle className="w-4 h-4" />,
                            },
                            {
                                label: "Avg Score",
                                value: avgScore,
                                icon: <BarChart3 className="w-4 h-4" />,
                            },
                            {
                                label:
                                    creditsUsed !== undefined
                                        ? `${creditsUsed} credits used`
                                        : "Via",
                                value: meta.label,
                                icon:
                                    provider === "pdl" ? (
                                        <Database className="w-4 h-4" />
                                    ) : (
                                        <Globe className="w-4 h-4" />
                                    ),
                            },
                        ].map((stat) => (
                            <div
                                key={stat.label}
                                className="bg-(--surface) border border-(--border) rounded-(--radius-lg) p-[14px_16px] shadow-(--shadow-sm)"
                            >
                                <div className="text-lg mb-1">{stat.icon}</div>
                                <div className="text-[22px] font-bold text-(--text-primary)">
                                    {stat.value}
                                </div>
                                <div className="text-[11px] text-(--text-muted) mt-0.5">
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Free-text: show what Groq extracted this search used */}
                    {isFreeText && extractedInfo && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg text-[12px] text-[#1e3a8a]">
                            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                <span className="font-semibold">
                                    {extractedInfo.jobTitle || "Untitled role"}
                                </span>
                                {effectiveSkills.length > 0 && (
                                    <>
                                        {" "}
                                        ·{" "}
                                        {effectiveSkills.slice(0, 6).join(", ")}
                                        {effectiveSkills.length > 6 ? " …" : ""}
                                    </>
                                )}
                                {" "}— auto-detected from your JD by Groq.
                            </span>
                        </div>
                    )}

                    {/* PDL accuracy note */}
                    {provider === "pdl" && (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#fef9c3] border border-[#fcd34d] rounded-lg text-[12px] text-[#78350f]">
                            <Database className="w-3.5 h-3.5 shrink-0" />
                            <span>
                                Structured verified data from People Data Labs ·{" "}
                                {creditsUsed ?? 0} credits consumed · {totalFound} total
                                matching profiles in database
                            </span>
                        </div>
                    )}

                    {/* filter row */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSetup((v) => !v)}
                                className="text-[12px] text-(--accent) bg-transparent border border-(--border) rounded-lg px-3 py-1.5 cursor-pointer hover:bg-(--bg) transition-colors"
                            >
                                {showSetup ? "▲ Hide" : "🔄 New search"}
                            </button>
                            <span className="text-[12px] text-(--text-muted)">
                                {results.length} profiles ·{" "}
                                {new Date(searchedAt).toLocaleTimeString("en-IN")}
                            </span>
                        </div>
                        {sourceCounts && (
                            <div className="flex gap-1 flex-wrap">
                                {(
                                    [
                                        ["all", "All", results.length],
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
                                            onClick={() =>
                                                setFilterSource(val as WebCandidate["source"] | "all")
                                            }
                                            className="text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer font-medium"
                                            style={
                                                filterSource === val
                                                    ? {
                                                        background: "var(--accent)",
                                                        color: "#fff",
                                                        borderColor: "var(--accent)",
                                                    }
                                                    : {
                                                        background: "var(--bg)",
                                                        color: "var(--text-muted)",
                                                        borderColor: "var(--border)",
                                                    }
                                            }
                                        >
                                            {label}
                                            {count > 0 ? ` (${count})` : ""}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* cards */}
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-(--text-muted) text-[14px]">
                            No candidates for this filter.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-[10px]">
                            {filtered.map((c, i) => (
                                <CandidateCard
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

                    <p className="text-center text-[11px] text-(--text-muted) mt-2">
                        {provider === "pdl" ? (
                            <>
                                Structured data from{" "}
                                <a
                                    href="https://peopledatalabs.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-(--accent)"
                                >
                                    People Data Labs
                                </a>{" "}
                                · {creditsUsed ?? 0} of your free credits used
                            </>
                        ) : (
                            <>
                                Web profiles via{" "}
                                <a
                                    href={meta.signupUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-(--accent)"
                                >
                                    {meta.label}
                                </a>{" "}
                                · Always verify before outreach
                            </>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}