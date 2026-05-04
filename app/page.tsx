"use client";
import { useState } from "react";
import Image from "next/image";
import type {
  CandidateResult,
  JDMode,
  ScreeningResponse,
  StructuredJD,
} from "@/types";
import JobDescriptionForm, {
  buildJDText,
} from "@/components/JobDescriptionForm";
import ResumeUploader from "@/components/ResumeUploader";
import ProcessingScreen from "@/components/ProcessingScreen";
import {
  BarChart3,
  Trophy,
  CheckCircle,
  ClipboardList,
  XCircle,
} from "lucide-react";
import JDIntelligencePanel from "@/components/JDIntelligencePanel";
import Header from "@/components/Header";

type View = "setup" | "processing" | "results";

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

const ScoreBar = ({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) => (
  <div className="h-1.5 bg-[#e5e3de] rounded-full overflow-hidden">
    <div
      style={{
        width: `${(value / max) * 100}%`,
        background: color,
        transition: "width 0.6s ease",
      }}
      className="h-full rounded-full"
    />
  </div>
);



// ── Candidate card (shared between qualified + disqualified sections) ──────────
function CandidateCard({
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
            color: isDisqualified
              ? "#991b1b"
              : c.rank <= 3
                ? "var(--text-primary)"
                : "var(--text-muted)",
          }}
        >
          {isDisqualified
            ? "✗"
            : c.rank === 1
              ? "🥇"
              : c.rank === 2
                ? "🥈"
                : c.rank === 3
                  ? "🥉"
                  : `#${c.rank}`}
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
            className="text-[20px] font-bold"
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
          <div className="text-[10px] text-(--text-muted)">
            {isDisqualified ? "" : "/ 100"}
          </div>
        </div>
        {isDisqualified ? (
          <span className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0 bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5]">
            Disqualified
          </span>
        ) : (
          <span
            className="text-[11px] font-semibold px-[10px] py-1 rounded-full shrink-0"
            style={{
              background: rec.bg,
              color: rec.color,
              border: `1px solid ${rec.border}`,
            }}
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
                  <div className="font-semibold text-[14px] text-[#991b1b] mb-1">
                    Automatically disqualified
                  </div>
                  <p className="text-[13px] text-[#991b1b]">
                    This candidate was removed before scoring because they are
                    missing the following mandatory skill
                    {c.ruleScore.missingMandatorySkills.length > 1 ? "s" : ""}:
                    <strong>
                      {" "}
                      {c.ruleScore.missingMandatorySkills.join(", ")}
                    </strong>
                    . Mandatory skills are hard filters — no exceptions.
                  </p>
                </div>
              </div>
              {c.ruleScore.matchedSkills.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-(--text-muted) mb-2">
                    Skills they do have
                  </div>
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
                  {
                    label: "Skill Match",
                    value: c.ruleScore.skillScore,
                    max: results.customWeights?.skills ?? 30,
                    color: "#3b82f6",
                  },
                  {
                    label: "Experience",
                    value: c.ruleScore.experienceScore,
                    max: results.customWeights?.experience ?? 25,
                    color: "#2563eb",
                  },
                  {
                    label: "Education",
                    value: c.ruleScore.educationScore,
                    max: results.customWeights?.education ?? 10,
                    color: "#f59e0b",
                  },
                  {
                    label: "Role Fit (AI)",
                    value: c.aiAssessment.roleFitScore,
                    max: 100,
                    color: "#10b981",
                  },
                ].map((s) => (
                  <div key={s.label} className="mb-[10px]">
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-(--text-secondary)">{s.label}</span>
                      <span className="font-semibold text-(--text-primary)">
                        {s.value}/{s.max}
                      </span>
                    </div>
                    <ScoreBar value={s.value} max={s.max} color={s.color} />
                  </div>
                ))}

                {c.ruleScore.matchedSkills.length > 0 && (
                  <div className="mt-[14px] pt-[14px] border-t border-(--border)">
                    <div className="text-[11px] font-semibold text-(--text-muted) mb-1">
                      Matched JD Skills
                    </div>
                    <div className="flex flex-wrap gap-[6px]">
                      {c.ruleScore.matchedSkills.map((s) => {
                        const mult = results.skillMultipliers?.[s];
                        return (
                          <span
                            key={s}
                            className="text-[11px] px-2 py-[3px] bg-(--accent-light) text-(--accent) rounded-full border border-[#bfdbfe]"
                          >
                            {s}
                            {mult !== undefined && mult !== 1.0
                              ? ` ×${mult.toFixed(1)}`
                              : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {c.ruleScore.missingSkills.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold text-(--text-muted) mb-1">
                      Missing JD Skills
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.ruleScore.missingSkills.slice(0, 8).map((s) => (
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

              <div>
                <div className="text-[12px] font-semibold text-(--text-secondary) mb-3 uppercase tracking-[0.05em]">
                  AI Assessment
                </div>
                <p className="text-[12px] text-(--text-secondary) leading-relaxed mb-3">
                  {c.aiAssessment.explanation}
                </p>
                <div className="grid grid-cols-2 gap-[10px] mb-3">
                  <div>
                    <div className="text-[11px] font-semibold text-(--success) mb-[6px]">
                      ✓ Strengths
                    </div>
                    {c.aiAssessment.strengths.map((s, i) => (
                      <div
                        key={i}
                        className="text-[11px] text-(--text-secondary) py-[3px] border-b border-(--border) leading-snug"
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-(--danger) mb-[6px]">
                      ✗ Gaps
                    </div>
                    {c.aiAssessment.gaps.map((g, i) => (
                      <div
                        key={i}
                        className="text-[11px] text-(--text-secondary) py-[3px] border-b border-(--border) leading-snug"
                      >
                        {g}
                      </div>
                    ))}
                  </div>
                </div>
                {(c.aiAssessment.whySelect || c.aiAssessment.whyNotSelect) && (
                  <div className="grid grid-cols-2 gap-[10px]">
                    {c.aiAssessment.whySelect && (
                      <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-[6px] p-[10px_12px]">
                        <div className="text-[11px] font-bold text-(--success) mb-[5px]">
                          👍 Why Select
                        </div>
                        <p className="text-[11px] text-[#166534] leading-snug">
                          {c.aiAssessment.whySelect}
                        </p>
                      </div>
                    )}
                    {c.aiAssessment.whyNotSelect && (
                      <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[6px] p-[10px_12px]">
                        <div className="text-[11px] font-bold text-[#c2410c] mb-[5px]">
                          👎 Why Not Select
                        </div>
                        <p className="text-[11px] text-[#9a3412] leading-snug">
                          {c.aiAssessment.whyNotSelect}
                        </p>
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

export default function Home() {
  const [view, setView] = useState<View>("setup");
  const [jdMode, setJdMode] = useState<JDMode>("structured");
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ScreeningResponse | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState({ current: 0, stage: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDisqualified, setShowDisqualified] = useState(false);

  const [structuredJD, setStructuredJD] = useState<StructuredJD>({
    title: "",
    department: "",
    roleType: "technical",
    employmentType: "full-time",
    mandatorySkills: [],
    mustHaveSkills: [],
    niceToHaveSkills: [],
    responsibilities: "",
    experienceRange: { min: 3, max: 6 },
    educationRequired: "bachelor",
  });
  const [freeTextJD, setFreeTextJD] = useState("");

  const canSubmit =
    files.length > 0 &&
    apiKey.trim().length > 10 &&
    (jdMode === "freetext"
      ? freeTextJD.trim().length >= 20
      : structuredJD.title.trim().length > 0 &&
      structuredJD.mustHaveSkills.length > 0);

  const runScreening = async () => {
    setError("");
    setView("processing");
    setProcessing({ current: 0, stage: "Initializing pipeline…" });

    const formData = new FormData();
    const jdText =
      jdMode === "structured" ? buildJDText(structuredJD) : freeTextJD;
    formData.append("jobDescription", jdText);
    formData.append("jdMode", jdMode);
    if (jdMode === "structured") {
      formData.append(
        "mandatorySkills",
        JSON.stringify(structuredJD.mandatorySkills),
      );
      formData.append(
        "mustHaveSkills",
        JSON.stringify(structuredJD.mustHaveSkills),
      );
      formData.append(
        "niceToHaveSkills",
        JSON.stringify(structuredJD.niceToHaveSkills),
      );
      formData.append("roleType", structuredJD.roleType);
      formData.append(
        "experienceMin",
        String(structuredJD.experienceRange.min),
      );
      formData.append(
        "experienceMax",
        String(structuredJD.experienceRange.max),
      );
      formData.append("educationRequired", structuredJD.educationRequired);
    }
    formData.append("apiKey", apiKey);
    files.forEach((f) => formData.append("resumes", f));

    const interval = setInterval(() => {
      setProcessing((prev) => {
        const stages = [
          "parse agent — extracting text from resumes…",
          "score agent — applying mandatory filter & matching skills…",
          "justify agent — Groq AI assessing role fit…",
          "rank agent — sorting candidates…",
        ];
        const nextStage =
          stages[
          Math.min(
            Math.floor(prev.current / (files.length / 4 + 1)),
            stages.length - 1,
          )
          ];
        return {
          current: Math.min(prev.current + 1, files.length - 1),
          stage: nextStage,
        };
      });
    }, 900);

    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        body: formData,
      });
      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      const data: ScreeningResponse = await res.json();
      setResults(data);
      setView("results");
    } catch (err: unknown) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Unknown error");
      setView("setup");
    }
  };

  const reset = () => {
    setView("setup");
    setResults(null);
    setError("");
    setExpandedId(null);
    setShowDisqualified(false);
  };

  // RESULTS VIEW
  if (view === "results" && results) {
    const shortlisted = results.candidates.filter((c) =>
      ["Strong Yes", "Yes"].includes(c.aiAssessment.recommendation),
    );
    const dqCount = results.disqualifiedCandidates?.length ?? 0;

    return (
      <div className="min-h-screen bg-(--bg)">
        <Header showBack onBack={reset} />
        <h1 className="text-2xl font-bold text-(--text-primary) mb-6 p-4">
          Results screening
        </h1>

        <div className="max-w-[900px] mx-auto py-6 px-5">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              {
                label: "Total Screened",
                value: results.totalResumes,
                icon: <ClipboardList className="w-4 h-4" />,
              },
              {
                label: "Shortlisted",
                value: shortlisted.length,
                icon: <CheckCircle className="w-4 h-4" />,
              },
              {
                label: "Avg Score",
                value:
                  results.candidates.length > 0
                    ? `${Math.round(results.candidates.reduce((s, c) => s + c.finalScore, 0) / results.candidates.length)}`
                    : "—",
                icon: <BarChart3 className="w-4 h-4" />,
              },
              { label: "Disqualified", value: dqCount, icon: <XCircle className="w-4 h-4" /> },
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

          {/* Mandatory skills used */}
          {results.mandatorySkills?.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-[#FCEBEB] border border-[#F09595] rounded-[var(--radius-lg)]">
              <span className="text-[13px] font-semibold text-[#A32D2D]">
                🚫 Mandatory filter applied:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {results.mandatorySkills.map((s) => (
                  <span
                    key={s}
                    className="text-[12px] px-2 py-0.5 bg-[#FCEBEB] text-[#791F1F] border border-[#F09595] rounded-full font-medium"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <span className="text-[12px] text-[#A32D2D] ml-auto">
                {dqCount} candidate{dqCount !== 1 ? "s" : ""} removed
              </span>
            </div>
          )}


          {results.jdIntelligence && (
            <div className="mb-6">
              <JDIntelligencePanel result={results.jdIntelligence} />
            </div>
          )}

          {/* Qualified candidate cards */}
          {results.candidates.length === 0 ? (
            <div className="text-center py-12 text-(--text-muted) text-[14px]">
              No qualified candidates — all were disqualified by the mandatory
              filter.
            </div>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {results.candidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  c={c}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  results={results}
                />
              ))}
            </div>
          )}

          {/* Disqualified section */}
          {dqCount > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowDisqualified((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 bg-[#fee2e2] border border-[#fca5a5] rounded-[var(--radius-lg)] cursor-pointer text-left"
                style={{ background: "#fee2e2" }}
              >
                <span className="text-[13px] font-semibold text-[#991b1b]">
                  🚫 {dqCount} disqualified candidate{dqCount !== 1 ? "s" : ""}{" "}
                  (missing mandatory skills)
                </span>
                <span
                  className="text-[12px] text-[#991b1b] transition-transform duration-200"
                  style={{
                    transform: showDisqualified ? "rotate(180deg)" : "none",
                  }}
                >
                  ▼
                </span>
              </button>

              {showDisqualified && (
                <div className="flex flex-col gap-[10px] mt-3">
                  {results.disqualifiedCandidates.map((c) => (
                    <CandidateCard
                      key={c.id}
                      c={c}
                      expandedId={expandedId}
                      setExpandedId={setExpandedId}
                      results={results}
                      isDisqualified
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-center text-[11px] text-(--text-muted) mt-6">
            Processed {results.totalResumes} resumes ·{" "}
            {new Date(results.processedAt).toLocaleString("en-IN")}
          </p>
        </div>
      </div>
    );
  }

  // PROCESSING VIEW
  if (view === "processing") {
    return (
      <div className="min-h-screen bg-(--bg)">
        <header className="bg-(--surface) border-b border-(--border) px-6 h-14 flex items-center gap-2.5">
          <span className="text-xl">
            <Image src="/icons/robot.svg" alt="Logo" width={40} height={40} />
          </span>
          <span className="font-bold text-[15px]">HireAgent</span>
        </header>
        <ProcessingScreen
          total={files.length}
          current={processing.current}
          stage={processing.stage}
        />
      </div>
    );
  }

  // SETUP VIEW
  return (
    <div className="min-h-screen bg-(--bg)">
      <Header subtitle="Agentic AI Resume Screener" />

      <div className="max-w-4xl mx-auto py-8 px-5">
        <div className="text-center mb-9">
          <h1 className="text-3xl font-bold mb-2 text-(--text-primary)">
            Screen Resume Instantly
          </h1>
          <p className="text-(--text-secondary) max-w-[440px] text-sm mx-auto">
            Upload up to 20 resumes and a job description. A 5-agent AI pipeline
            will analyse, parse, score, justify and rank candidates
            automatically.
          </p>
          <div className="flex gap-2 justify-center mt-4 flex-wrap">
            {[
              { icon: "📄", label: "Parse Agent" },
              { icon: "→", label: "", plain: true },
              { icon: "🚫", label: "Mandatory Filter" },
              { icon: "→", label: "", plain: true },
              { icon: "📊", label: "Score Agent" },
              { icon: "→", label: "", plain: true },
              { icon: "🤖", label: "Justify Agent" },
              { icon: "→", label: "", plain: true },
              { icon: "🏆", label: "Ranked Shortlist" },
            ].map((b, i) =>
              b.plain ? (
                <span key={i} className="text-(--text-muted) text-sm">
                  {b.icon}
                </span>
              ) : (
                <span
                  key={i}
                  className="text-[12px] px-[10px] py-1 bg-(--surface) border border-(--border) rounded-full text-(--text-secondary)"
                >
                  {b.icon} {b.label}
                </span>
              ),
            )}
          </div>
        </div>

        {error && (
          <div className="bg-[#fef2f2] border border-[#fca5a5] rounded-(--radius) px-4 py-3 mb-5 text-[13px] text-(--danger)">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* API Key */}
          <div className="bg-(--surface) border border-(--border) rounded-(--radius-lg) p-5 shadow-(--shadow-sm)">
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-8 h-8 rounded-[8px] bg-[#fff7ed] flex items-center justify-center">
                🔑
              </div>
              <div>
                <div className="font-semibold text-[14px]">Groq API Key</div>
                <div className="text-[12px] text-(--text-muted)">
                  Get a free key at{" "}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--accent)"
                  >
                    console.groq.com
                  </a>
                </div>
              </div>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full border border-(--border) rounded-(--radius) px-3 py-2.5 text-[13px] font-mono text-(--text-primary) bg-(--bg) outline-none focus:border-(--accent)"
            />
          </div>

          <JobDescriptionForm
            mode={jdMode}
            onModeChange={setJdMode}
            structured={structuredJD}
            onStructuredChange={setStructuredJD}
            freeText={freeTextJD}
            onFreeTextChange={setFreeTextJD}
            disabled={false}
            apiKey={apiKey}
          />



          <ResumeUploader files={files} onChange={setFiles} />

          <button
            onClick={runScreening}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] border-none tracking-[-0.01em] transition-colors duration-150"
            style={{
              background: canSubmit ? "var(--accent)" : "#93c5fd",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            onMouseEnter={(e) => {
              if (canSubmit)
                (e.target as HTMLButtonElement).style.background =
                  "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              if (canSubmit)
                (e.target as HTMLButtonElement).style.background =
                  "var(--accent)";
            }}
          >
            Screen{" "}
            {files.length > 0
              ? `${files.length} Resume${files.length > 1 ? "s" : ""}`
              : "Resumes"}
          </button>

          {!canSubmit && (
            <p className="text-center text-[12px] text-(--text-muted) -mt-2">
              {!apiKey ? "Add your Groq API key · " : ""}
              {/* {jd.trim().length < 20 ? "Add a job description · " : ""} */}
              {files.length === 0 ? "Upload at least one resume" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
