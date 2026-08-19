"use client";
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
    Lightbulb,
    ExternalLink,
} from "lucide-react";
import type { JDMode, StructuredJD } from "@/types";
import JobDescriptionForm, { buildJDText } from "@/components/JobDescriptionForm";
import ResumeUploader from "@/components/ResumeUploader";
import WebCandidateSearch from "@/components/WebCandidateSearch";

type SetupTab = "upload" | "web-search";

interface Props {
    error: string;
    apiKey: string;
    onApiKeyChange: (v: string) => void;
    jdMode: JDMode;
    onJdModeChange: (m: JDMode) => void;
    structuredJD: StructuredJD;
    onStructuredJDChange: (jd: StructuredJD) => void;
    freeTextJD: string;
    onFreeTextJDChange: (v: string) => void;
    setupTab: SetupTab;
    onSetupTabChange: (t: SetupTab) => void;
    files: File[];
    onFilesChange: (f: File[]) => void;
    canSubmit: boolean;
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

export default function ScreeningSetup({
    error,
    apiKey,
    onApiKeyChange,
    jdMode,
    onJdModeChange,
    structuredJD,
    onStructuredJDChange,
    freeTextJD,
    onFreeTextJDChange,
    setupTab,
    onSetupTabChange,
    files,
    onFilesChange,
    canSubmit,
    onRunScreening,
}: Props) {
    const jdText = jdMode === "structured" ? buildJDText(structuredJD) : freeTextJD;

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
                                <span className="text-[12px] font-medium text-(--text-secondary)">
                                    {step.label}
                                </span>
                            </div>
                            {i < PIPELINE.length - 1 && (
                                <ArrowRight size={13} strokeWidth={2} color="var(--text-muted)" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {error && (
                <div
                    className="flex items-start gap-2.5 rounded-(--radius) px-4 py-3 mb-6 text-[13px]"
                    style={{
                        background: "var(--danger-light)",
                        border: "1px solid var(--danger)",
                        color: "var(--danger)",
                    }}
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
                        value={apiKey}
                        onChange={(e) => onApiKeyChange(e.target.value)}
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
                        onModeChange={onJdModeChange}
                        structured={structuredJD}
                        onStructuredChange={onStructuredJDChange}
                        freeText={freeTextJD}
                        onFreeTextChange={onFreeTextJDChange}
                        disabled={false}
                        apiKey={apiKey}
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
                                    { key: "upload", label: "Upload resumes", icon: Upload, badge: undefined },
                                    { key: "web-search", label: "Find candidates online", icon: Search, badge: "New" },
                                ] as const
                            ).map((tab) => {
                                const active = setupTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => onSetupTabChange(tab.key)}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold border-none cursor-pointer transition-colors"
                                        style={{
                                            background: active ? "var(--accent-light)" : "transparent",
                                            color: active ? "var(--accent)" : "var(--text-muted)",
                                            borderBottom: active
                                                ? "2px solid var(--accent)"
                                                : "2px solid transparent",
                                        }}
                                        type="button"
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
                                <WebCandidateSearch
                                    structuredJD={structuredJD}
                                    jdText={jdText}
                                    jdMode={jdMode}
                                    groqApiKey={apiKey}
                                />
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
                            type="button"
                        >
                            Screen{" "}
                            {files.length > 0
                                ? `${files.length} Resume${files.length > 1 ? "s" : ""}`
                                : "Resumes"}
                        </button>

                        {!canSubmit && (
                            <p className="text-center text-[12px] text-(--text-muted) mt-2">
                                {!apiKey ? "Add your Groq API key · " : ""}
                                {files.length === 0 ? "Upload at least one resume" : ""}
                            </p>
                        )}
                    </div>
                )}

                {setupTab === "web-search" && (
                    <div
                        className="flex items-start gap-3 px-4 py-3 rounded-(--radius-lg) text-[12px]"
                        style={{
                            background: "var(--warning-light)",
                            border: "1px solid var(--warning)",
                            color: "var(--text-secondary)",
                        }}
                    >
                        <Lightbulb size={16} strokeWidth={2} className="shrink-0 mt-0.5" color="var(--warning)" />
                        <div>
                            <span className="font-semibold" style={{ color: "var(--warning)" }}>
                                Tip:
                            </span>{" "}
                            Web search finds publicly available candidate profiles from
                            LinkedIn, GitHub, and portfolios. To screen uploaded resumes with
                            AI scoring, switch to the{" "}
                            <button
                                onClick={() => onSetupTabChange("upload")}
                                className="text-(--accent) underline bg-transparent border-none cursor-pointer p-0"
                            >
                                Upload resumes
                            </button>{" "}
                            tab.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
