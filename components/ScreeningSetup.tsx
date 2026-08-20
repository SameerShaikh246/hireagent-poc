"use client";
import { useState } from "react";
import Link from "next/link";
import {
    FileText,
    Ban,
    BarChart3,
    Bot,
    Trophy,
    ArrowRight,
    KeyRound,
    Upload,
    Search,
    AlertCircle,
    ExternalLink,
    Globe,
} from "lucide-react";
import JobDescriptionForm from "@/components/JobDescriptionForm";
import ResumeUploader from "@/components/ResumeUploader";
import { useJD } from "@/context/JDContext";

type SetupTab = "upload" | "web-search";

interface Props {
    error: string;
    files: File[];
    onFilesChange: (f: File[]) => void;
    onRunScreening: () => void;
}

const PIPELINE = [
    { icon: FileText, label: "Parse" },
    { icon: Ban, label: "Mandatory filter" },
    { icon: BarChart3, label: "Score" },
    { icon: Bot, label: "AI justify" },
    { icon: Trophy, label: "Rank" },
];

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2.5 mb-3">
            <span
                className="flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold shrink-0 font-data"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
                {n}
            </span>
            <span className="text-[13px] font-semibold text-(--text-primary)">{children}</span>
        </div>
    );
}

export default function ScreeningSetup({ error, files, onFilesChange, onRunScreening }: Props) {
    const {
        jdMode, setJdMode,
        structuredJD, setStructuredJD,
        freeTextJD, setFreeTextJD,
        groqApiKey, setGroqApiKey,
    } = useJD();

    const [setupTab, setSetupTab] = useState<SetupTab>("upload");

    const canSubmit =
        files.length > 0 &&
        groqApiKey.trim().length > 10 &&
        (jdMode === "freetext"
            ? freeTextJD.trim().length >= 20
            : structuredJD.title.trim().length > 0 && structuredJD.mustHaveSkills.length > 0);

    const structuredSkills = [
        ...new Set([...structuredJD.mandatorySkills, ...structuredJD.mustHaveSkills, ...structuredJD.niceToHaveSkills]),
    ];

    return (
        <div className="max-w-4xl mx-auto py-10 px-5">
            {/* Hero */}
            <div className="text-center mb-10">
                <h1 className="font-display text-[32px] font-semibold mb-2.5 text-(--text-primary)">
                    Screen resumes instantly
                </h1>
                <p className="text-(--text-secondary) max-w-[460px] text-[14px] mx-auto leading-relaxed">
                    Upload up to 20 resumes and a job description. A 5-agent pipeline
                    parses, filters, scores, justifies, and ranks candidates automatically.
                </p>

                <div
                    className="flex items-center justify-center gap-1 mt-6 mx-auto flex-wrap max-w-xl rounded-(--radius-lg) border px-4 py-3"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                    {PIPELINE.map((step, i) => (
                        <div key={step.label} className="flex items-center gap-1">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                                <step.icon size={14} strokeWidth={2} color="var(--secondary)" />
                                <span className="text-[12px] font-medium text-(--text-secondary)">{step.label}</span>
                            </div>
                            {i < PIPELINE.length - 1 && <ArrowRight size={13} strokeWidth={2} color="var(--text-muted)" />}
                        </div>
                    ))}
                </div>
            </div>

            {error && (
                <div
                    className="flex items-start gap-2.5 rounded-(--radius) px-4 py-3 mb-6 text-[13px]"
                    style={{ background: "var(--danger-light)", border: "1px solid var(--danger)", color: "var(--danger)" }}
                >
                    <AlertCircle size={16} strokeWidth={2.25} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex flex-col gap-6">
                {/* Step 1 — API key */}
                <div
                    className="rounded-(--radius-lg) p-5 shadow-(--shadow-sm) border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                    <StepLabel n={1}>Groq API key</StepLabel>
                    <div className="flex items-center gap-3 mb-3">
                        <div
                            className="w-9 h-9 rounded-(--radius) flex items-center justify-center shrink-0"
                            style={{ background: "var(--accent-light)" }}
                        >
                            <KeyRound size={16} strokeWidth={2} color="var(--accent)" />
                        </div>
                        <p className="text-[12px] text-(--text-muted)">
                            Get a free key at{" "}
                            <a
                                href="https://console.groq.com/keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-(--accent) inline-flex items-center gap-0.5"
                            >
                                console.groq.com <ExternalLink size={10} />
                            </a>
                        </p>
                    </div>
                    <input
                        type="password"
                        value={groqApiKey}
                        onChange={(e) => setGroqApiKey(e.target.value)}
                        placeholder="gsk_..."
                        className="w-full border rounded-(--radius) px-3 py-2.5 text-[13px] font-data text-(--text-primary) outline-none transition-colors"
                        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                    />
                </div>

                {/* Step 2 — Job description */}
                <div>
                    <StepLabel n={2}>Job description</StepLabel>
                    <JobDescriptionForm
                        mode={jdMode}
                        onModeChange={setJdMode}
                        structured={structuredJD}
                        onStructuredChange={setStructuredJD}
                        freeText={freeTextJD}
                        onFreeTextChange={setFreeTextJD}
                        disabled={false}
                        apiKey={groqApiKey}
                    />
                </div>

                {/* Step 3 — Candidate source */}
                <div>
                    <StepLabel n={3}>Candidates</StepLabel>
                    <div
                        className="rounded-(--radius-lg) overflow-hidden shadow-(--shadow-sm) border"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                        <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
                            {(
                                [
                                    { key: "upload", label: "Upload resumes", icon: Upload },
                                    { key: "web-search", label: "Find candidates online", icon: Search, badge: "New" },
                                ] as const
                            ).map((tab) => {
                                const active = setupTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setSetupTab(tab.key)}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold border-none cursor-pointer transition-colors"
                                        style={{
                                            background: active ? "var(--accent-light)" : "transparent",
                                            color: active ? "var(--accent)" : "var(--text-muted)",
                                            borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                                        }}
                                    >
                                        <tab.icon size={15} strokeWidth={2.25} />
                                        {tab.label}
                                        {tab.badge && (
                                            <span
                                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                                style={{ background: "var(--success-light)", color: "var(--success)" }}
                                            >
                                                {tab.badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="p-4">
                            {setupTab === "upload" ? (
                                <ResumeUploader files={files} onChange={onFilesChange} />
                            ) : (
                                <div className="flex flex-col items-center text-center py-8 px-4">
                                    <div
                                        className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
                                        style={{ background: "var(--accent-light)" }}
                                    >
                                        <Globe size={20} strokeWidth={1.75} color="var(--accent)" />
                                    </div>
                                    <p className="text-[13px] text-(--text-secondary) max-w-[360px] mb-1">
                                        Search LinkedIn, GitHub, and portfolio profiles using the job
                                        description above.
                                    </p>
                                    {structuredSkills.length > 0 && jdMode === "structured" && (
                                        <p className="text-[11px] text-(--text-muted) mb-4">
                                            {structuredJD.title || "Untitled role"} · {structuredSkills.slice(0, 4).join(", ")}
                                            {structuredSkills.length > 4 ? " …" : ""}
                                        </p>
                                    )}
                                    <Link
                                        href="/search"
                                        className="flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-4 py-2 no-underline"
                                        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                                    >
                                        Continue to candidate search
                                        <ArrowRight size={14} strokeWidth={2.25} />
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Step 4 — Run */}
                {setupTab === "upload" && (
                    <div>
                        <button
                            onClick={onRunScreening}
                            disabled={!canSubmit}
                            className="w-full py-3.5 rounded-xl font-semibold text-[15px] border-none tracking-[-0.01em] transition-opacity"
                            style={{
                                background: canSubmit ? "var(--accent)" : "var(--border-strong)",
                                color: canSubmit ? "var(--accent-contrast)" : "var(--text-muted)",
                                cursor: canSubmit ? "pointer" : "not-allowed",
                            }}
                        >
                            Screen {files.length > 0 ? `${files.length} Resume${files.length > 1 ? "s" : ""}` : "Resumes"}
                        </button>

                        {!canSubmit && (
                            <p className="text-center text-[12px] text-(--text-muted) mt-2">
                                {!groqApiKey ? "Add your Groq API key · " : ""}
                                {files.length === 0 ? "Upload at least one resume" : ""}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}