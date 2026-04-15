"use client";
import { useState } from "react";
import type { StructuredJD, JDMode, RoleType, EmploymentType, EducationLevel } from "@/types";

interface Props {
  mode: JDMode;
  onModeChange: (m: JDMode) => void;
  structured: StructuredJD;
  onStructuredChange: (jd: StructuredJD) => void;
  freeText: string;
  onFreeTextChange: (v: string) => void;
  disabled?: boolean;
}

function TagInput({
  id, tags, onChange, placeholder, colorClass, disabled,
}: {
  id: string;
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
  colorClass: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const val = input.trim().toLowerCase().replace(/,$/, "");
    if (!val || tags.includes(val)) { setInput(""); return; }
    onChange([...tags, val]);
    setInput("");
  };

  const removeTag = (i: number) => onChange(tags.filter((_, idx) => idx !== i));

  return (
    <div
      className="flex flex-wrap gap-1.5 border border-[var(--border)] rounded-[var(--radius)] p-1.5 bg-[var(--bg)] min-h-[40px] cursor-text items-center focus-within:border-[var(--accent)]"
      onClick={() => document.getElementById(id)?.focus()}
    >
      {tags?.map((tag, i) => (
        <span key={tag} className={`inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
          {tag}
          {!disabled && (
            <button onClick={() => removeTag(i)} className="text-[14px] leading-none opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer p-0">×</button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id} type="text" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
            if (e.key === "Backspace" && !input && tags.length) removeTag(tags.length - 1);
          }}
          placeholder={tags?.length === 0 ? placeholder : ""}
          className="border-none bg-transparent outline-none text-[13px] text-[var(--text-primary)] min-w-[140px] flex-1 p-0.5"
        />
      )}
    </div>
  );
}

export function buildJDText(jd: StructuredJD): string {
  const eduLabels: Record<EducationLevel, string> = {
    any: "Not specified", diploma: "Diploma or equivalent",
    bachelor: "Bachelor's degree", master: "Master's degree", phd: "PhD",
  };
  const lines: string[] = [];
  lines.push(`${jd.title.toUpperCase()}${jd.department ? ` — ${jd.department}` : ""}`);
  lines.push(jd.employmentType);
  lines.push("");
  if (jd.mustHaveSkills.length) {
    lines.push("REQUIRED SKILLS");
    jd.mustHaveSkills.forEach((s) => lines.push(`• ${s}`));
    lines.push("");
  }
  if (jd.niceToHaveSkills.length) {
    lines.push("PREFERRED SKILLS");
    jd.niceToHaveSkills.forEach((s) => lines.push(`• ${s}`));
    lines.push("");
  }
  if (jd.responsibilities.trim()) {
    lines.push("RESPONSIBILITIES");
    lines.push(jd.responsibilities.trim());
    lines.push("");
  }
  lines.push(`EXPERIENCE\n${jd.experienceRange.min}–${jd.experienceRange.max} years`);
  lines.push("");
  lines.push(`EDUCATION\n${eduLabels[jd.educationRequired]}`);
  return lines.join("\n");
}

export default function JobDescriptionForm({ mode, onModeChange, structured, onStructuredChange, freeText, onFreeTextChange, disabled }: Props) {
  const set = <K extends keyof StructuredJD>(key: K, value: StructuredJD[K]) =>
    onStructuredChange({ ...structured, [key]: value });

  const inputCls = "w-full border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg)] outline-none focus:border-[var(--accent)]";
  const labelCls = "block text-[13px] font-medium text-[var(--text-primary)] mb-1.5";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-[8px] bg-[var(--accent-light)] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-[14px]">Job Description</div>
          <div className="text-[12px] text-[var(--text-muted)]">Structured template or free-text paste · AI validates both</div>
        </div>
      </div>

      <div className="flex border border-[var(--border)] rounded-[var(--radius)] overflow-hidden mb-5 text-[13px]">
        {(["structured", "freetext"] as JDMode[]).map((m) => (
          <button key={m} onClick={() => onModeChange(m)}
            className="flex-1 py-2 border-none cursor-pointer font-medium transition-colors"
            style={{
              background: mode === m ? "var(--bg)" : "transparent",
              color: mode === m ? "var(--text-primary)" : "var(--text-muted)",
              borderRight: m === "structured" ? "0.5px solid var(--border)" : "none",
            }}>
            {m === "structured" ? "Structured template" : "Free-text"}
          </button>
        ))}
      </div>

      {mode === "structured" && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Role details</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Job title *</label>
                <input className={inputCls} value={structured.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Senior React Developer" disabled={disabled} />
              </div>
              <div>
                <label className={labelCls}>Department</label>
                <input className={inputCls} value={structured.department ?? ""} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Engineering" disabled={disabled} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Role type</label>
                <select className={inputCls} value={structured.roleType} onChange={(e) => set("roleType", e.target.value as RoleType)} disabled={disabled}>
                  <option value="technical">Technical</option>
                  <option value="non-technical">Non-technical</option>
                  <option value="custom">Custom weights</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Employment type</label>
                <select className={inputCls} value={structured.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)} disabled={disabled}>
                  <option value="full-time">Full-time</option>
                  <option value="contract">Contract</option>
                  <option value="part-time">Part-time</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
            </div>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls} style={{ margin: 0 }}>Must-have skills *</label>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]">
                {structured.mustHaveSkills.length} skill{structured?.mustHaveSkills.length !== 1 ? "s" : ""} · 1.0× weight
              </span>
            </div>
            <TagInput id="must-have-skills" tags={structured.mustHaveSkills} onChange={(t) => set("mustHaveSkills", t)} placeholder="Type a skill and press Enter…" colorClass="bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]" />
            <p className="text-[11px] text-[var(--text-muted)] mt-1">e.g. React, TypeScript, REST APIs, PostgreSQL</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls} style={{ margin: 0 }}>Nice-to-have skills</label>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806] border border-[#EF9F27]">
                {structured.niceToHaveSkills.length} skill{structured.niceToHaveSkills.length !== 1 ? "s" : ""} · 0.6× weight
              </span>
            </div>
            <TagInput id="nice-to-have-skills" tags={structured.niceToHaveSkills} onChange={(t) => set("niceToHaveSkills", t)} placeholder="Type a skill and press Enter…" colorClass="bg-[#FAEEDA] text-[#633806] border-[#EF9F27]" />
          </div> 
          

          <div className="h-px bg-[var(--border)]" />

          <div>
            <label className={labelCls}>Responsibilities</label>
            <textarea className={inputCls} rows={4} value={structured.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} placeholder={"Describe key duties for this role…"} disabled={disabled} />
          </div>

          <div className="h-px bg-[var(--border)]" />

          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Experience &amp; education</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Experience range (years)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={20} className={inputCls} style={{ width: 64, textAlign: "center" }} value={structured.experienceRange.min} onChange={(e) => set("experienceRange", { ...structured.experienceRange, min: +e.target.value })} disabled={disabled} />
                  <span className="text-[13px] text-[var(--text-muted)]">to</span>
                  <input type="number" min={0} max={30} className={inputCls} style={{ width: 64, textAlign: "center" }} value={structured.experienceRange.max} onChange={(e) => set("experienceRange", { ...structured.experienceRange, max: +e.target.value })} disabled={disabled} />
                  <span className="text-[12px] text-[var(--text-muted)]">yrs</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Education required</label>
                <select className={inputCls} value={structured.educationRequired} onChange={(e) => set("educationRequired", e.target.value as EducationLevel)} disabled={disabled}>
                  <option value="any">Any / not specified</option>
                  <option value="diploma">Diploma or equivalent</option>
                  <option value="bachelor">Bachelor&apos;s degree</option>
                  <option value="master">Master&apos;s degree</option>
                  <option value="phd">PhD</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Generated JD preview</label>
            <pre className="text-[12px] text-[var(--text-secondary)] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)] p-3 whitespace-pre-wrap leading-relaxed min-h-[60px]">
              {structured.title ? buildJDText(structured) : "Fill in the fields above to see the generated job description…"}
            </pre>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              🧠 JD Intelligence Agent will validate and auto-correct this before screening.
            </p>
          </div>
        </div>
      )}

      {mode === "freetext" && (
        <div>
          <textarea className={inputCls} rows={10} value={freeText} onChange={(e) => onFreeTextChange(e.target.value)} placeholder={"Paste the full job description here…\n\nWe are looking for a Senior React Developer with 4+ years experience in TypeScript, Node.js, and REST APIs."} disabled={disabled} />
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            🧠 JD Intelligence Agent will extract, validate and correct skills automatically.
          </p>
        </div>
      )}
    </div>
  );
}