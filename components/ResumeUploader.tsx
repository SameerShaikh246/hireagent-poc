"use client";
import { useRef, useState } from "react";
import JSZip from "jszip";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export default function ResumeUploader({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (incoming: FileList | null) => {
    if (!incoming) return;

    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain", "application/zip", "application/x-zip-compressed",
    ];

    const isValid = (f: File) =>
      allowed.includes(f.type) || f.name.endsWith(".txt") || f.name.endsWith(".pdf") ||
      f.name.endsWith(".docx") || f.name.endsWith(".zip");

    const newFiles: File[] = [];

    for (const file of Array.from(incoming)) {
      if (!isValid(file)) continue;
      if (file.name.endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const filename of Object.keys(zip.files)) {
            const entry = zip.files[filename];
            if (entry.dir) continue;
            if (!filename.endsWith(".pdf") && !filename.endsWith(".docx") && !filename.endsWith(".txt")) continue;
            const blob = await entry.async("blob");
            newFiles.push(new File([blob], filename, { type: blob.type || "application/octet-stream" }));
          }
        } catch (err) { console.error("ZIP error:", err); }
      } else {
        newFiles.push(file);
      }
    }

    const combined = [...files, ...newFiles].slice(0, 20);
    onChange(combined.filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i));
  };

  const remove = (name: string) => onChange(files.filter((f) => f.name !== name));

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileIcon = (name: string) => {
    if (name.endsWith(".pdf")) return { label: "PDF", color: "#dc2626", bg: "#fef2f2" };
    if (name.endsWith(".docx")) return { label: "DOC", color: "#2563eb", bg: "#eff6ff" };
    return { label: "TXT", color: "#6b6860", bg: "#f3f2ef" };
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-[8px] bg-[#f0fdf4] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-[14px]">Resumes <span className="font-normal text-[var(--text-muted)]">({files.length}/20)</span></div>
          <div className="text-[12px] text-[var(--text-muted)]">PDF, DOCX, TXT or ZIP — up to 20 files · duplicate detection enabled</div>
        </div>
      </div>

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-[var(--radius)] px-4 py-6 text-center transition-all ${dragging ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-[var(--border)] bg-[var(--bg)]"
          } ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${files.length > 0 ? "mb-3" : ""}`}
      >
        <div className="text-2xl mb-1">📂</div>
        <div className="text-[13px] text-[var(--text-secondary)] font-medium">
          {dragging ? "Drop files here" : "Click or drag & drop resumes"}
        </div>
        <div className="text-[11px] text-[var(--text-muted)] mt-1">Supports PDF, DOCX, TXT, ZIP</div>
      </div>

      <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.zip" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => {
            const icon = fileIcon(f.name);
            return (
              <div key={f.name} className="flex items-center gap-2.5 px-2.5 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)]">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px]" style={{ color: icon.color, background: icon.bg }}>{icon.label}</span>
                <span className="flex-1 text-[12px] text-[var(--text-primary)] overflow-hidden text-ellipsis whitespace-nowrap">{f.name}</span>
                <span className="text-[11px] text-[var(--text-muted)] shrink-0">{formatSize(f.size)}</span>
                {!disabled && (
                  <button onClick={(e) => { e.stopPropagation(); remove(f.name); }} className="text-[14px] text-[var(--text-muted)] bg-transparent border-none leading-none px-0.5 cursor-pointer">×</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}