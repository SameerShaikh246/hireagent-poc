"use client";
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
    Globe,
    ExternalLink,
} from "lucide-react";
import JobDescriptionForm from "@/components/JobDescriptionForm";
import { useJD } from "@/context/JDContext";

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

function PathCard({
    href,
    icon: Icon,
    title,
    description,
    badge,
}: {
    href: string;
    icon: typeof Upload;
    title: string;
    description: string;
    badge?: string;
}) {
    return (
        <Link
            href={href}
            className="group flex-1 flex flex-col gap-3 rounded-(--radius-lg) border p-5 no-underline transition-all"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
            <div className="flex items-center justify-between">
                <div
                    className="w-10 h-10 rounded-(--radius) flex items-center justify-center"
                    style={{ background: "var(--accent-light)" }}
                >
                    <Icon size={18} strokeWidth={1.75} color="var(--accent)" />
                </div>
                {badge && (
                    <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--success-light)", color: "var(--success)" }}
                    >
                        {badge}
                    </span>
                )}
            </div>
            <div>
                <div className="text-[14px] font-semibold text-(--text-primary) mb-1">{title}</div>
                <p className="text-[12px] text-(--text-secondary) leading-relaxed">{description}</p>
            </div>
            <div className="flex items-center gap-1 text-[12px] font-medium text-(--accent) mt-auto pt-1">
                Continue
                <ArrowRight size={13} strokeWidth={2.25} className="transition-transform group-hover:translate-x-0.5" />
            </div>
        </Link>
    );
}

export default function ScreeningSetup() {
    const { jdMode, setJdMode, structuredJD, setStructuredJD, freeTextJD, setFreeTextJD, groqApiKey, setGroqApiKey } =
        useJD();

    return (
        <div className="max-w-4xl mx-auto py-10 px-5">
            {/* Hero */}
            <div className="text-center mb-10">
                <h1 className="font-display text-[32px] font-semibold mb-2.5 text-(--text-primary)">
                    Screen resumes instantly
                </h1>
                <p className="text-(--text-secondary) max-w-[460px] text-[14px] mx-auto leading-relaxed">
                    Build a job description once, then screen uploaded resumes or search
                    for candidates online. A 5-agent pipeline handles the rest.
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

            <div className="flex flex-col gap-6">
                {/* Step 1 — API key */}
                <div>
                    <StepLabel n={1}>Groq API key</StepLabel>
                    <div
                        className="rounded-(--radius-lg) p-5 shadow-(--shadow-sm) border"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
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

                {/* Step 3 — Choose path */}
                <div>
                    <StepLabel n={3}>Find candidates</StepLabel>
                    <div className="flex gap-4 flex-col sm:flex-row">
                        <PathCard
                            href="/screen"
                            icon={Upload}
                            title="Upload resumes"
                            description="Upload up to 20 resumes and let the pipeline parse, score, and rank them against your job description."
                        />
                        <PathCard
                            href="/search"
                            icon={Globe}
                            title="Find candidates online"
                            badge="New"
                            description="Search LinkedIn, GitHub, and portfolio profiles that match your job description — no resumes needed."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}