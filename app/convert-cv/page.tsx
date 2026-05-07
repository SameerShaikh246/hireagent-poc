"use client";
import { useState, useRef, useCallback } from "react";
import type { ParsedCV, ConvertCVResponse } from "@/app/api/convert-cv/route";

// Types
type ConvertState = "idle" | "uploading" | "parsing" | "generating" | "done" | "error";

type Options = {
  includeUserDetails: boolean;
  maxProjects: number;
};

// Helpers
const ACCEPT = ".pdf,.doc,.docx,.txt";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${base64}`;
  link.download = filename;
  link.click();
}

// PDF Preview Modal
function PdfPreviewModal({
  base64,
  onClose,
}: {
  base64: string;
  onClose: () => void;
}) {
  const dataUrl = `data:application/pdf;base64,${base64}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: "min(860px, 95vw)",
          height: "min(92vh, 900px)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[16px]">📄</span>
            <span
              className="font-semibold text-[14px]"
              style={{ color: "var(--text-primary)" }}
            >
              SP Format Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadBase64Pdf(base64, "cv_SP.pdf")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors"
              style={{
                borderColor: "var(--accent)",
                color: "var(--accent)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              ⬇ Download PDF
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[18px] leading-none transition-colors"
              style={{
                color: "var(--text-muted)",
                background: "transparent",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* PDF iframe */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "#525659" }}>
          <iframe
            src={dataUrl}
            title="PDF Preview"
            className="absolute inset-0 w-full h-full border-none"
            style={{ background: "transparent" }}
          />
          {/* Fallback message if iframe doesn't render (mobile/some browsers) */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none"
            style={{ zIndex: -1 }}
          >
            <span className="text-[40px]">📄</span>
            <p className="text-[13px] text-white opacity-60">
              PDF preview not supported in this browser.
              <br />
              Please download the file to view it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step indicator 
function Steps({ state }: { state: ConvertState }) {
  const steps = [
    { key: "uploading", label: "Extracting text" },
    { key: "parsing", label: "Parsing with AI" },
    { key: "generating", label: "Generating PDF" },
    { key: "done", label: "Ready" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === state);
  if (state === "idle" || state === "error") return null;

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => {
        const done = i < activeIdx || state === "done";
        const active = s.key === state;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold border transition-all"
                style={{
                  background: done
                    ? "var(--success)"
                    : active
                      ? "var(--accent)"
                      : "var(--bg)",
                  borderColor:
                    done || active ? "transparent" : "var(--border)",
                  color: done || active ? "#fff" : "var(--text-muted)",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-2 mb-4 transition-colors"
                style={{
                  background:
                    i < activeIdx || state === "done"
                      ? "var(--success)"
                      : "var(--border)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Parsed preview
function ParsedPreview({
  parsed,
  options,
}: {
  parsed: ParsedCV;
  options: Options;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const visibleProjects = parsed.projects.slice(0, options.maxProjects);

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      {/* Header */}
      <div
        className="p-4 border rounded-xl"
        style={{
          background: "var(--bg)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Candidate
        </div>
        <div
          className="font-semibold text-[15px]"
          style={{ color: "var(--text-primary)" }}
        >
          {parsed.name}
        </div>
        <div
          className="text-[12px] mt-1 flex gap-3 flex-wrap"
          style={{ color: "var(--text-muted)" }}
        >
          {options.includeUserDetails ? (
            <>
              {parsed.phone && <span>📞 {parsed.phone}</span>}
              {parsed.email && <span>✉ {parsed.email}</span>}
            </>
          ) : (
            <span className="italic">Contact details hidden</span>
          )}
        </div>
      </div>

      {/* Summary */}
      {parsed.summary.length > 0 && (
        <div
          className="p-4 border rounded-xl"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Professional Summary{" "}
            <span
              className="font-normal normal-case tracking-normal"
              style={{ color: "var(--text-muted)" }}
            >
              ({parsed.summary.length} points)
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {parsed.summary.slice(0, 4).map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <span
                  className="mt-1 flex-shrink-0"
                  style={{ color: "var(--accent)" }}
                >
                  •
                </span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
            {parsed.summary.length > 4 && (
              <li
                className="text-[11px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                + {parsed.summary.length - 4} more…
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Education */}
      {parsed.education && (
        <div
          className="p-4 border rounded-xl"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-widest mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Education
          </div>
          <span style={{ color: "var(--text-primary)" }}>{parsed.education}</span>
        </div>
      )}

      {/* Projects */}
      {visibleProjects.length > 0 && (
        <div
          className="p-4 border rounded-xl"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Projects
            <span
              className="font-normal normal-case tracking-normal ml-1"
              style={{ color: "var(--text-muted)" }}
            >
              ({visibleProjects.length} of {parsed.projects.length} shown
              {parsed.projects.length > options.maxProjects
                ? ` — ${parsed.projects.length - options.maxProjects} removed`
                : ""}
              )
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {visibleProjects.map((p, i) => (
              <div
                key={i}
                className="border rounded-lg overflow-hidden"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border-none cursor-pointer text-left"
                  style={{ background: "var(--surface)" }}
                >
                  <span
                    className="font-medium text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {p.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.responsibilities.length} bullets
                    </span>
                    <span
                      className="text-[11px]"
                      style={{
                        color: "var(--text-muted)",
                        transform: expanded.has(i) ? "rotate(180deg)" : "none",
                        display: "inline-block",
                        transition: "transform .15s",
                      }}
                    >
                      ▼
                    </span>
                  </div>
                </button>
                {expanded.has(i) && (
                  <ul
                    className="px-3 py-2 flex flex-col gap-1"
                    style={{ background: "var(--bg)" }}
                  >
                    {p.responsibilities.map((r, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-[12px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span
                          className="flex-shrink-0 mt-0.5"
                          style={{ color: "var(--accent)" }}
                        >
                          •
                        </span>
                        <span className="leading-snug">{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {parsed.certifications.length > 0 && (
        <div
          className="p-4 border rounded-xl"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Certifications{" "}
            <span className="font-normal normal-case tracking-normal">
              ({parsed.certifications.length})
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {parsed.certifications.map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <span
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: "var(--accent)" }}
                >
                  •
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Download actions bar
function DownloadBar({
  result,
  fileName,
  options,
  parsed,
  onPreview,
}: {
  result: ConvertCVResponse;
  fileName: string;
  options: Options;
  parsed: ParsedCV;
  onPreview: () => void;
}) {

  const baseName = fileName.replace(/\.[^.]+$/, "");

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Label */}
      <div
        className="px-5 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Download converted CV
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
        {/* Preview button */}
        <button
          onClick={onPreview}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[14px] font-medium border transition-all"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
            background: "var(--bg)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "var(--accent)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "var(--border)";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--text-primary)";
          }}
        >
          <span className="text-[16px]">👁</span>
          Preview PDF
        </button>

        {/* Download PDF */}
        <button
          onClick={() =>
            downloadBase64Pdf(result.pdfBase64, `${baseName}_SP.pdf`)
          }
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[14px] font-semibold transition-all border-2"
          style={{
            borderColor: "var(--accent)",
            color: "var(--accent)",
            background: "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--accent-light)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          <span className="text-[16px]">⬇</span>
          Download PDF
        </button>

        {/* Download DOCX */}
        <button
          onClick={() => alert("DOCX download not implemented yet")}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[14px] font-semibold transition-all border-2"
        >

          <span className="text-[16px]">📝</span>
          Download DOCX
        </button>
      </div>
    </div>
  );
}

// Main page
export default function CVConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [options, setOptions] = useState<Options>({
    includeUserDetails: true,
    maxProjects: 5,
  });
  const [state, setState] = useState<ConvertState>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConvertCVResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const convert = async () => {
    if (!file || !apiKey.trim()) return;
    setError("");
    setResult(null);

    const fd = new FormData();
    fd.append("cv", file);
    fd.append("apiKey", apiKey.trim());
    fd.append("includeName", "true");
    fd.append("includePhone", String(options.includeUserDetails));
    fd.append("includeEmail", String(options.includeUserDetails));
    fd.append("maxProjects", String(options.maxProjects));

    setState("uploading");
    await new Promise((r) => setTimeout(r, 400));
    setState("parsing");

    try {
      const res = await fetch("/api/convert-cv", {
        method: "POST",
        body: fd,
      });
      setState("generating");
      await new Promise((r) => setTimeout(r, 300));

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Request failed" }));
        throw new Error(data.error ?? "Conversion failed");
      }

      const data: ConvertCVResponse = await res.json();
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
    setState("idle");
    setShowPreview(false);
  };

  const canConvert =
    !!file &&
    apiKey.trim().length > 10 &&
    state !== "uploading" &&
    state !== "parsing" &&
    state !== "generating";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* PDF Preview Modal */}
      {showPreview && result && (
        <PdfPreviewModal
          base64={result.pdfBase64}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Header */}
      <header
        className="border-b px-6 h-14 flex items-center gap-3"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[15px]"
          style={{ background: "var(--accent-light)" }}
        >
          📄
        </div>
        <div>
          <span
            className="font-bold text-[15px]"
            style={{ color: "var(--text-primary)" }}
          >
            CV Converter
          </span>
          <span
            className="text-[12px] ml-2"
            style={{ color: "var(--text-muted)" }}
          >
            → SP Format
          </span>
        </div>
      </header>

      <div className="max-w-[860px] mx-auto py-8 px-5">
        {/* Page title */}
        <div className="mb-8">
          <h1
            className="text-[22px] font-bold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Convert External CV to SP Format
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Upload any PDF or Word CV — AI extracts the content and reformats it
            into the standard SoftProdigy template.
          </p>
        </div>

        {state !== "done" && (
          <div className="flex flex-col gap-5">
            <Steps state={state} />

            {/* API Key */}
            <div
              className="border rounded-xl p-5"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div>
                  <div
                    className="font-semibold text-[14px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Groq API Key
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Get a free key at{" "}
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)" }}
                      className="underline"
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
                className="w-full rounded-lg px-3 py-2.5 text-[13px] font-mono outline-none"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  background: "var(--bg)",
                }}
              />
            </div>

            {/* File upload */}
            <div
              className="border rounded-xl p-5"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[16px]">📂</span>
                <div>
                  <div
                    className="font-semibold text-[14px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Upload CV
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    PDF, DOCX, DOC, or TXT
                  </div>
                </div>
              </div>

              {file ? (
                <div
                  className="flex items-center gap-3 px-4 py-3 border rounded-lg"
                  style={{
                    background: "var(--bg)",
                    borderColor: "var(--border)",
                  }}
                >
                  <span className="text-[20px]">
                    {file.name.endsWith(".pdf")
                      ? "📄"
                      : file.name.endsWith(".docx") ||
                        file.name.endsWith(".doc")
                        ? "📝"
                        : "📃"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium text-[13px] truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {file.name}
                    </div>
                    <div
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatBytes(file.size)}
                    </div>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="text-[18px] bg-transparent border-none cursor-pointer leading-none"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
                  style={{
                    borderColor: isDragging
                      ? "var(--accent)"
                      : "var(--border)",
                    background: isDragging
                      ? "var(--accent-light)"
                      : "var(--bg)",
                  }}
                >
                  <span className="text-[32px]">⬆</span>
                  <div className="text-center">
                    <div
                      className="font-medium text-[13px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Drop CV here or click to browse
                    </div>
                    <div
                      className="text-[12px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      PDF, DOCX, DOC, TXT · max 10 MB
                    </div>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && setFile(e.target.files[0])
                }
              />
            </div>

            {/* Options */}
            <div
              className="border rounded-xl p-5"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-[16px]">⚙️</span>
                <div
                  className="font-semibold text-[14px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  Conversion options
                </div>
              </div>
              <div className="flex flex-col gap-5">
                <div>
                  <div
                    className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Candidate details
                  </div>
                  <label
                    className="flex items-center justify-between px-4 py-3 border rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: "var(--bg)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div>
                      <div
                        className="text-[13px] font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Include contact details
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Show phone number and email
                      </div>
                    </div>
                    <div
                      className="relative w-10 rounded-full transition-colors"
                      style={{
                        height: 22,
                        background: options.includeUserDetails
                          ? "var(--accent)"
                          : "var(--border)",
                      }}
                      onClick={() =>
                        setOptions((p) => ({
                          ...p,
                          includeUserDetails: !p.includeUserDetails,
                        }))
                      }
                    >
                      <div
                        className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{
                          left: options.includeUserDetails ? 20 : 3,
                        }}
                      />
                    </div>
                  </label>
                </div>

                <div>
                  <div
                    className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Maximum projects in output
                  </div>
                  <div
                    className="flex items-center gap-4 px-4 py-3 border rounded-lg"
                    style={{
                      background: "var(--bg)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex-1">
                      <div
                        className="text-[13px] font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Show up to {options.maxProjects} project
                        {options.maxProjects !== 1 ? "s" : ""}
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        If the CV has more, only the first {options.maxProjects}{" "}
                        will appear
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setOptions((p) => ({
                            ...p,
                            maxProjects: Math.max(1, p.maxProjects - 1),
                          }))
                        }
                        className="w-7 h-7 rounded-lg border font-bold cursor-pointer transition-colors text-[16px] leading-none flex items-center justify-center"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--surface)",
                          color: "var(--text-primary)",
                        }}
                      >
                        −
                      </button>
                      <span
                        className="text-[15px] font-bold w-5 text-center"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {options.maxProjects}
                      </span>
                      <button
                        onClick={() =>
                          setOptions((p) => ({
                            ...p,
                            maxProjects: Math.min(10, p.maxProjects + 1),
                          }))
                        }
                        className="w-7 h-7 rounded-lg border font-bold cursor-pointer transition-colors text-[16px] leading-none flex items-center justify-center"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--surface)",
                          color: "var(--text-primary)",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-3 px-4 py-3 border rounded-xl text-[13px]"
                style={{
                  background: "#FEF2F2",
                  borderColor: "#FCA5A5",
                  color: "var(--danger)",
                }}
              >
                <span className="text-[16px] flex-shrink-0">⚠</span>
                <div>
                  <div className="font-semibold mb-0.5">Conversion failed</div>
                  <div>{error}</div>
                </div>
              </div>
            )}

            {/* Convert button */}
            <button
              onClick={convert}
              disabled={!canConvert}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] border-none transition-all"
              style={{
                background: canConvert ? "var(--accent)" : "#93C5FD",
                cursor: canConvert ? "pointer" : "not-allowed",
              }}
            >
              {state === "uploading" ||
                state === "parsing" ||
                state === "generating"
                ? "Converting…"
                : "Convert to SP Format"}
            </button>

            {!canConvert && state === "idle" && (
              <p
                className="text-center text-[12px] -mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                {!apiKey ? "Add your Groq API key  · " : ""}
                {!file ? "Upload a CV file" : ""}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {state === "done" && result && (
          <div className="flex flex-col gap-5">
            {/* Parsed data preview */}
            <div
              className="border rounded-xl p-5"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div
                    className="font-semibold text-[14px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Extracted content preview
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Review what was parsed from the CV
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="text-[13px] bg-transparent border-none cursor-pointer underline"
                  style={{ color: "var(--accent)" }}
                >
                  Convert another
                </button>
              </div>
              <ParsedPreview parsed={result.parsed} options={options} />
            </div>

            {/* Download / Preview bar */}
            <DownloadBar
              result={result}
              fileName={file?.name ?? "cv"}
              options={options}
              parsed={result.parsed}
              onPreview={() => setShowPreview(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
