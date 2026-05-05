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

// Step indicator
function Steps({ state }: { state: ConvertState }) {
  const steps = [
    { key: "uploading", label: "Extracting text" },
    { key: "parsing", label: "Parsing with AI" },
    { key: "generating", label: "Generating PDF" },
    { key: "done", label: "Ready" },
  ];
  const activeIdx = steps.findIndex(s => s.key === state);
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
                  background: done ? "var(--success)" : active ? "var(--accent)" : "var(--bg)",
                  borderColor: done || active ? "transparent" : "var(--border)",
                  color: done || active ? "#fff" : "var(--text-muted)",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px mx-2 mb-4 transition-colors"
                style={{ background: i < activeIdx || state === "done" ? "var(--success)" : "var(--border)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Parsed preview 
function ParsedPreview({ parsed, options }: { parsed: ParsedCV; options: Options }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const visibleProjects = parsed.projects.slice(0, options.maxProjects);

  return (
    <div className="flex flex-col gap-4 text-[13px]">

      {/* Header */}
      <div className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">Candidate</div>
        <div className="font-semibold text-[15px] text-[var(--text-primary)]">
          {parsed.name}
        </div>
        <div className="text-[12px] text-[var(--text-muted)] mt-1 flex gap-3 flex-wrap">
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
        <div className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
            Professional Summary <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">({parsed.summary.length} points)</span>
          </div>
          <ul className="flex flex-col gap-1">
            {parsed.summary.slice(0, 4).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                <span className="mt-1 flex-shrink-0 text-[var(--accent)]">•</span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
            {parsed.summary.length > 4 && (
              <li className="text-[var(--text-muted)] text-[11px] mt-1">+ {parsed.summary.length - 4} more…</li>
            )}
          </ul>
        </div>
      )}

      {/* Education */}
      {parsed.education && (
        <div className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1">Education</div>
          <span className="text-[var(--text-primary)]">{parsed.education}</span>
        </div>
      )}

      {/* Projects */}
      {visibleProjects.length > 0 && (
        <div className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Projects
            <span className="font-normal normal-case tracking-normal ml-1">
              ({visibleProjects.length} of {parsed.projects.length} shown{parsed.projects.length > options.maxProjects ? ` — ${parsed.projects.length - options.maxProjects} removed` : ""})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {visibleProjects.map((p, i) => (
              <div key={i} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--surface)] border-none cursor-pointer text-left"
                >
                  <span className="font-medium text-[var(--text-primary)] text-[13px]">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-muted)]">{p.responsibilities.length} bullets</span>
                    <span className="text-[11px] text-[var(--text-muted)]" style={{ transform: expanded.has(i) ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▼</span>
                  </div>
                </button>
                {expanded.has(i) && (
                  <ul className="px-3 py-2 flex flex-col gap-1 bg-[var(--bg)]">
                    {p.responsibilities.map((r, j) => (
                      <li key={j} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <span className="flex-shrink-0 text-[var(--accent)] mt-0.5">•</span>
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
        <div className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
            Certifications <span className="font-normal normal-case tracking-normal">({parsed.certifications.length})</span>
          </div>
          <ul className="flex flex-col gap-1">
            {parsed.certifications.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                <span className="flex-shrink-0 text-[var(--accent)] mt-0.5">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  // Convert
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
    await new Promise(r => setTimeout(r, 400));
    setState("parsing");

    try {
      const res = await fetch("/api/convert-cv", { method: "POST", body: fd });
      setState("generating");
      await new Promise(r => setTimeout(r, 300));

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
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
  };

  const canConvert = !!file && apiKey.trim().length > 10 && state !== "uploading" && state !== "parsing" && state !== "generating";

  // Render
  return (
    <div className="min-h-screen bg-[var(--bg)]">

      {/* Header */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)] px-6 h-14 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--accent-light)] flex items-center justify-center text-[15px]">📄</div>
        <div>
          <span className="font-bold text-[15px] text-[var(--text-primary)]">CV Converter</span>
          <span className="text-[12px] text-[var(--text-muted)] ml-2">→ Soft</span>
        </div>
      </header>
      <div className="max-w-[860px] mx-auto py-8 px-5">

        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-[22px] font-bold text-[var(--text-primary)] mb-1">Convert External CV to SP Format</h1>
          <p className="text-[13px] text-[var(--text-muted)]">
            Upload any PDF or Word CV — AI extracts the content and reformats it into the standard SoftProdigy template.
          </p>
        </div>

        {state !== "done" && (
          <div className="flex flex-col gap-5">

            {/* Step progress */}
            <Steps state={state} />

            {/* API Key */}
            <div className="bg-(--surface) border border-(--border) rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div>
                  <div className="font-semibold text-[14px] text-(--text-primary)">Groq API Key</div>
                  <div className="text-[12px] text-(--text-muted)">
                    Get a free key at {" "}
                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                      className="text-(--accent) underline">console.groq.com</a>
                  </div>
                </div>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[var(--text-primary)] bg-[var(--bg)] outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
              />
            </div>

            {/* File upload */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[16px]">📂</span>
                <div>
                  <div className="font-semibold text-[14px] text-[var(--text-primary)]">Upload CV</div>
                  <div className="text-[12px] text-[var(--text-muted)]">PDF, DOCX, DOC, or TXT</div>
                </div>
              </div>

              {file ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg">
                  <span className="text-[20px]">
                    {file.name.endsWith(".pdf") ? "📄" : file.name.endsWith(".docx") || file.name.endsWith(".doc") ? "📝" : "📃"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px] text-[var(--text-primary)] truncate">{file.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{formatBytes(file.size)}</div>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="text-[var(--text-muted)] hover:text-[var(--danger)] text-[18px] bg-transparent border-none cursor-pointer leading-none"
                  >×</button>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
                  style={{
                    borderColor: isDragging ? "var(--accent)" : "var(--border)",
                    background: isDragging ? "var(--accent-light)" : "var(--bg)",
                  }}
                >
                  <span className="text-[32px]">⬆</span>
                  <div className="text-center">
                    <div className="font-medium text-[13px] text-(--text-primary)">Drop CV here or click to browse</div>
                    <div className="text-[12px] text-(--text-muted) mt-0.5">PDF, DOCX, DOC, TXT · max 10 MB</div>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
              />
            </div>
            {/* Options */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-[16px]">⚙️</span>
                <div className="font-semibold text-[14px] text-[var(--text-primary)]">Conversion options</div>
              </div>
              <div className="flex flex-col gap-5">
                {/* Candidate details toggles */}
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                    Candidate details
                  </div>

                  <label className="flex items-center justify-between px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--accent)] transition-colors">
                    <div>
                      <div className="text-[13px] font-medium text-[var(--text-primary)]">
                        Include contact details
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Show phone number and email
                      </div>
                    </div>

                    <div
                      className="relative w-10 h-5.5 rounded-full transition-colors"
                      style={{
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

                {/* Max projects */}
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
                    Maximum projects in output
                  </div>
                  <div className="flex items-center gap-4 px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg">
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-[var(--text-primary)]">
                        Show up to {options.maxProjects} project{options.maxProjects !== 1 ? "s" : ""}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        If the CV has more, only the first {options.maxProjects} will appear
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setOptions(p => ({ ...p, maxProjects: Math.max(1, p.maxProjects - 1) }))}
                        className="w-7 h-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] font-bold cursor-pointer hover:border-[var(--accent)] transition-colors text-[16px] leading-none flex items-center justify-center"
                      >−</button>
                      <span className="text-[15px] font-bold text-[var(--text-primary)] w-5 text-center">{options.maxProjects}</span>
                      <button
                        onClick={() => setOptions(p => ({ ...p, maxProjects: Math.min(10, p.maxProjects + 1) }))}
                        className="w-7 h-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] font-bold cursor-pointer hover:border-[var(--accent)] transition-colors text-[16px] leading-none flex items-center justify-center"
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 px-4 py-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-[13px] text-[var(--danger)]">
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
              {state === "uploading" || state === "parsing" || state === "generating"
                ? "Converting…"
                : "Convert to SP Format"}
            </button>

            {!canConvert && state === "idle" && (
              <p className="text-center text-[12px] text-[var(--text-muted)] -mt-2">
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
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-semibold text-[14px] text-[var(--text-primary)]">Extracted content preview</div>
                  <div className="text-[12px] text-[var(--text-muted)]">Review what was parsed from the CV</div>
                </div>
                <button
                  onClick={reset}
                  className="text-[13px] text-[var(--accent)] bg-transparent border-none cursor-pointer underline"
                >
                  Convert another
                </button>
              </div>
              <ParsedPreview parsed={result.parsed} options={options} />
            </div>

            {/* Download again */}
            <button
              onClick={() => {
                const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "cv";
                downloadBase64Pdf(result.pdfBase64, `${baseName}_SP.pdf`);
              }}
              className="w-full py-3 rounded-xl border-2 border-[var(--accent)] text-[var(--accent)] font-semibold text-[14px] bg-transparent cursor-pointer hover:bg-[var(--accent-light)] transition-colors"
            >
              ⬇ Download SP Format PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
