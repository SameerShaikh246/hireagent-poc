"use client";
import { useRouter } from "next/navigation";
import { AlertCircle, Sparkles, PencilLine } from "lucide-react";
import Link from "next/link";
import { useJD } from "@/context/JDContext";
import { useWebSearch } from "@/context/WebSearchContext";
import { buildJDText } from "@/components/JobDescriptionForm";
import { PROVIDERS } from "@/lib/searchProviders";
import type { Provider } from "@/lib/webSearchTypes";
import ProviderCard from "./ProviderCard";

export default function SearchSetupPanel() {
    const router = useRouter();
    const { jdMode, structuredJD, freeTextJD } = useJD();
    const { provider, setProvider, loading, error, runSearch } = useWebSearch();

    const isFreeText = jdMode === "freetext";
    const jdText = isFreeText ? freeTextJD : buildJDText(structuredJD);

    const structuredSkills = [
        ...new Set([
            ...structuredJD.mandatorySkills,
            ...structuredJD.mustHaveSkills,
            ...structuredJD.niceToHaveSkills,
        ]),
    ];

    const meta = PROVIDERS[provider];

    const hasJD = isFreeText
        ? jdText.trim().length >= 20
        : structuredJD.title.trim().length > 0 ||
        structuredJD.mustHaveSkills.length > 0 ||
        structuredJD.mandatorySkills.length > 0;

    // Keys live on the server now, so the only thing gating a search is
    // having a usable job description.
    const canSearch = hasJD;

    const handleSearch = async () => {
        const ok = await runSearch({
            structuredJD,
            jdMode,
            jdText,
        });

        if (ok) {
            router.push("/search/results");
        }
    };


    return (
        <div className="max-w-4xl mx-auto py-10 px-5">
            <div className="text-center mb-8">
                <h1 className="font-display text-[28px] font-semibold mb-2 text-(--text-primary)">
                    Find candidates online
                </h1>
                <p className="text-(--text-secondary) max-w-[480px] text-[14px] mx-auto leading-relaxed">
                    Search LinkedIn, GitHub, and portfolio profiles that match your job description.
                </p>
            </div>

            {/* JD context strip */}
            <div
                className="flex items-center justify-between gap-3 px-4 py-3 mb-6 rounded-(--radius-lg) border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
                {hasJD ? (
                    <div className="text-[12px] text-(--text-secondary) min-w-0">
                        <span className="font-semibold text-(--text-primary)">
                            {isFreeText ? "Free-text JD" : structuredJD.title || "Untitled role"}
                        </span>
                        {!isFreeText && structuredSkills.length > 0 && (
                            <span className="text-(--accent)">
                                {" "}
                                · {structuredSkills.slice(0, 5).join(", ")}
                                {structuredSkills.length > 5 ? " …" : ""}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-[12px] text-(--text-muted)">No job description set yet</span>
                )}
                <Link
                    href="/"
                    className="flex items-center gap-1 text-[12px] font-medium text-(--accent) shrink-0"
                >
                    <PencilLine size={13} strokeWidth={2.25} />
                    Edit JD
                </Link>
            </div>

            {isFreeText && (
                <div
                    className="flex items-start gap-2.5 px-4 py-3 mb-6 rounded-lg text-[12px]"
                    style={{ background: "var(--accent-light)", color: "var(--text-secondary)" }}
                >
                    <Sparkles size={15} strokeWidth={2} className="shrink-0 mt-0.5" color="var(--accent)" />
                    <span>
                        Free-text JD detected — Groq will read your job description and auto-detect
                        the role title and required skills before searching.
                    </span>
                </div>
            )}

            {/* PDL recommended banner */}
            <div
                className="flex items-center gap-2.5 mb-4 px-3 py-2.5 rounded-lg"
                style={{ background: "var(--warning-light)", border: "1px solid var(--warning)" }}
            >
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--warning)" }}>
                        Recommended:
                    </span>{" "}
                    Use <strong>People Data Labs</strong> for verified, structured candidate data —
                    unlike web search providers which scrape and guess.
                </span>
            </div>

            <div
                className="rounded-(--radius-lg) p-5 shadow-(--shadow-sm) border mb-6"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
                <div className="flex flex-col gap-2 mb-4">
                    <div className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-widest">
                        Free options
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <ProviderCard id="pdl" selected={provider === "pdl"} onSelect={() => { setProvider("pdl"); }} />
                        <ProviderCard id="github" selected={provider === "github"} onSelect={() => { setProvider("github"); }} />
                    </div>

                    <div className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-widest mt-1">
                        Your saved candidates
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <ProviderCard id="db" selected={provider === "db"} onSelect={() => { setProvider("db"); }} />
                    </div>

                    <div className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-widest mt-1">
                        Web search fallbacks
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {(["tavily", "exa", "serper"] as Provider[]).map((id) => (
                            <ProviderCard key={id} id={id} selected={provider === id} onSelect={() => { setProvider(id); }} />
                        ))}
                    </div>
                </div>

            </div>

            {!canSearch && (
                <p className="text-[12px] text-(--text-muted) text-center mb-3">
                    {isFreeText
                        ? "Write at least 20 characters of job description first"
                        : "Add a job title or skills to the JD on the home page first"}
                </p>
            )}

            {error && (
                <div
                    className="flex items-start gap-2.5 px-4 py-3 mb-3 rounded-(--radius) text-[13px]"
                    style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger)" }}
                >
                    <AlertCircle size={16} strokeWidth={2.25} className="shrink-0 mt-0.5" />
                    <span>
                        {error}
                    </span>
                </div>
            )}

            <button
                onClick={handleSearch}
                disabled={!canSearch || loading}
                className="w-full py-3.5 rounded-xl font-semibold text-[15px] border-none transition-opacity tracking-[-0.01em]"
                style={{
                    background: !canSearch || loading ? "var(--border-strong)" : "var(--accent)",
                    color: !canSearch || loading ? "var(--text-muted)" : "var(--accent-contrast)",
                    cursor: !canSearch || loading ? "not-allowed" : "pointer",
                }}
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin opacity-70" />
                        {isFreeText ? "Reading JD & searching…" : `Searching via ${meta.label}…`}
                    </span>
                ) : (
                    `Find candidates via ${meta.label}`
                )}
            </button>
        </div>
    );
}