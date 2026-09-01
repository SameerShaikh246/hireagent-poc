"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PencilLine, AlertCircle } from "lucide-react";
import { useJD } from "@/context/JDContext";
import { useScreening } from "@/context/ScreeningContext";
import ResumeUploader from "@/components/ResumeUploader";

export default function ScreenSetupPanel() {
    const router = useRouter();
    const { jdMode, structuredJD, freeTextJD, groqApiKey } = useJD();
    const { files, setFiles, error, runScreening } = useScreening();

    const isFreeText = jdMode === "freetext";
    const structuredSkills = [
        ...new Set([...structuredJD.mandatorySkills, ...structuredJD.mustHaveSkills, ...structuredJD.niceToHaveSkills]),
    ];
    const hasJD = isFreeText
        ? freeTextJD.trim().length >= 20
        : structuredJD.title.trim().length > 0 && structuredJD.mustHaveSkills.length > 0;
    const canSubmit = files.length > 0 && groqApiKey.trim().length > 10 && hasJD;

    const handleRun = async () => {
        const ok = await runScreening({ jdMode, structuredJD, freeTextJD, groqApiKey });
        if (ok) router.push("/screen/results");
    };

    return (
        <div className="max-w-4xl mx-auto py-10 px-5">
            <div className="text-center mb-8">
                <h1 className="font-display text-[28px] font-semibold mb-2 text-(--text-primary)">
                    Screen your resumes
                </h1>
                <p className="text-(--text-secondary) max-w-[480px] text-[14px] mx-auto leading-relaxed">
                    Upload up to 20 resumes. A 5-agent pipeline parses, filters, scores,
                    justifies, and ranks them against your job description.
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
                <Link href="/" className="flex items-center gap-1 text-[12px] font-medium text-(--accent) shrink-0">
                    <PencilLine size={13} strokeWidth={2.25} />
                    Edit JD
                </Link>
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

            <div
                className="rounded-(--radius-lg) overflow-hidden shadow-(--shadow-sm) border mb-6"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
                <div className="p-4">
                    <ResumeUploader files={files} onChange={setFiles} />
                </div>
            </div>

            <button
                onClick={handleRun}
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
                    {!hasJD ? "Set a job description on the home page · " : ""}
                    {!groqApiKey ? "Add your Groq API key · " : ""}
                    {files.length === 0 ? "Upload at least one resume" : ""}
                </p>
            )}
        </div>
    );
}