"use client";
import { useState, useRef } from "react";
import type { StructuredJD, JDMode, RoleType, EmploymentType, EducationLevel } from "@/types";
import { useSkillSuggestions, filterSuggestions, type SkillSuggestion } from "@/lib/useSkillSuggestions";

interface Props {
  mode: JDMode;
  onModeChange: (m: JDMode) => void;
  structured: StructuredJD;
  onStructuredChange: (jd: StructuredJD) => void;
  freeText: string;
  onFreeTextChange: (v: string) => void;
  disabled?: boolean;
  apiKey: string;
}

// Pill
type TierStyle = { pill: string; ring: string; dot: string };

const TIER_STYLES: Record<"mandatory" | "must" | "nice", TierStyle> = {
  mandatory: {
    pill: "bg-[#FCEBEB] text-[#7F1D1D] border-[#FCA5A5]",
    ring: "focus-within:ring-1 focus-within:ring-[#FCA5A5] focus-within:border-[#F87171]",
    dot: "bg-[#EF4444]",
  },
  must: {
    pill: "bg-[#ECFDF5] text-[#064E3B] border-[#6EE7B7]",
    ring: "focus-within:ring-1 focus-within:ring-[#6EE7B7] focus-within:border-[#34D399]",
    dot: "bg-[#10B981]",
  },
  nice: {
    pill: "bg-[#FFFBEB] text-[#78350F] border-[#FCD34D]",
    ring: "focus-within:ring-1 focus-within:ring-[#FCD34D] focus-within:border-[#FBBF24]",
    dot: "bg-[#F59E0B]",
  },
};

// TagInput
function TagInput({
  id, tags, onChange, placeholder, tier, disabled, suggestions, suggestionsLoading,
}: {
  id: string;
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
  tier: "mandatory" | "must" | "nice";
  disabled?: boolean;
  suggestions: SkillSuggestion[];
  suggestionsLoading: boolean;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const styles = TIER_STYLES[tier];

  const visible = filterSuggestions(suggestions, tags, input);

  const commit = (val?: string) => {
    const v = (val ?? input).trim().toLowerCase().replace(/,+$/, "");
    if (!v || tags.includes(v)) { setInput(""); return; }
    onChange([...tags, v]);
    setInput("");
  };

  const remove = (i: number) => onChange(tags.filter((_, j) => j !== i));

  const openDropdown = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const closeDropdown = () => {
    hideTimer.current = setTimeout(() => setOpen(false), 160);
  };

  return (
    <div className="relative">
      {/* Input area */}
      <div
        className={`flex flex-wrap gap-1.5 min-h-[42px] px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] cursor-text transition-all ${styles.ring}`}
        onClick={() => { document.getElementById(id)?.focus(); openDropdown(); }}
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-[3px] rounded-full border ${styles.pill}`}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="opacity-40 hover:opacity-80 text-[15px] leading-none bg-transparent border-none cursor-pointer p-0 ml-0.5"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            id={id}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toLowerCase())}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && input.trim()) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Backspace" && !input && tags.length) remove(tags.length - 1);
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") openDropdown();
            }}
            onFocus={openDropdown}
            onBlur={closeDropdown}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] border-none bg-transparent outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] p-0 my-0.5"
          />
        )}
      </div>

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
          {/* Loading state */}
          {suggestionsLoading && (
            <div className="flex items-center gap-2.5 px-3.5 py-3 text-[12px] text-[var(--text-muted)]">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin flex-shrink-0" />
              Generating suggestions…
            </div>
          )}

          {/* Suggestions list */}
          {!suggestionsLoading && visible.length > 0 && (
            <>
              <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Suggested
              </div>
              {visible.slice(0, 7).map((s) => (
                <button
                  key={s.skill}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (hideTimer.current) clearTimeout(hideTimer.current);
                    commit(s.skill);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[var(--bg)] border-none bg-transparent cursor-pointer text-left transition-colors group"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot} ${s.confidence === "medium" ? "opacity-50" : ""}`}
                  />
                  <span className="flex-1 text-[13px] text-[var(--text-primary)] group-hover:text-[var(--text-primary)]">
                    {s.skill}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] text-right max-w-[180px] truncate">
                    {s.reason}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Empty — user typed something with no match */}
          {!suggestionsLoading && visible.length === 0 && input.trim().length > 0 && (
            <div className="px-3.5 py-3 text-[12px] text-[var(--text-muted)]">
              Press <kbd className="px-1.5 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[11px]">Enter</kbd> to add &ldquo;{input}&rdquo;
            </div>
          )}

          {/* Empty — no query, no suggestions yet */}
          {!suggestionsLoading && visible.length === 0 && input.trim().length === 0 && (
            <div className="px-3.5 py-3 text-[12px] text-[var(--text-muted)]">
              Type a skill name and press <kbd className="px-1.5 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[11px]">Enter</kbd> to add it here
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tier block
function TierBlock({
  tier, label, count, weightLabel, descriptionText,
  badgeClass, id, tags, onChange, placeholder,
  suggestions, loading, disabled,
}: {
  tier: "mandatory" | "must" | "nice";
  label: string;
  count: number;
  weightLabel: string;
  descriptionText: string;
  badgeClass: string;
  id: string;
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
  suggestions: SkillSuggestion[];
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {/* Tier header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIER_STYLES[tier].dot}`} />
          <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{label}</span>
          {count > 0 && (
            <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">· {count}</span>
          )}
        </div>
        <span className={`text-[10.5px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap flex-shrink-0 ${badgeClass}`}>
          {weightLabel}
        </span>
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-snug truncate" title={descriptionText}>
        {descriptionText}
      </p>

      {/* Input */}
      <TagInput
        id={id}
        tags={tags}
        onChange={onChange}
        placeholder={placeholder}
        tier={tier}
        disabled={disabled}
        suggestions={suggestions}
        suggestionsLoading={loading}
      />
    </div>
  );
}

// JD text builder
export function buildJDText(jd: StructuredJD): string {
  const edu: Record<EducationLevel, string> = {
    any: "Not specified", diploma: "Diploma", bachelor: "Bachelor's degree",
    master: "Master's degree", phd: "PhD",
  };
  const lines: string[] = [];
  lines.push(`${jd.title.toUpperCase()}${jd.department ? ` — ${jd.department}` : ""}`);
  lines.push(jd.employmentType);
  lines.push("");
  if (jd.mandatorySkills.length) {
    lines.push("MANDATORY (non-negotiable)");
    jd.mandatorySkills.forEach((s) => lines.push(`• ${s}`));
    lines.push("");
  }
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
  lines.push(`EDUCATION\n${edu[jd.educationRequired]}`);
  return lines.join("\n");
}

// Source pill
function SourcePill({ source }: { source: "groq" | "esco" | "fallback" | null }) {
  if (!source) return null;
  const map = {
    groq: { label: "AI", style: "bg-[#EDE9FE] text-[#4C1D95] border-[#C4B5FD]" },
    esco: { label: "ESCO", style: "bg-[#EFF6FF] text-[#1E3A8A] border-[#BFDBFE]" },
    fallback: { label: "Local", style: "bg-[#F9FAFB] text-[#374151] border-[#E5E7EB]" },
  };
  const s = map[source];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.style}`}>
      {s.label}
    </span>
  );
}

// Main form
export default function JobDescriptionForm({
  mode, onModeChange, structured, onStructuredChange,
  freeText, onFreeTextChange, disabled, apiKey,
}: Props) {
  const set = <K extends keyof StructuredJD>(key: K, value: StructuredJD[K]) =>
    onStructuredChange({ ...structured, [key]: value });

  const { suggestions, status, error: suggestErr, refresh, resolvedOccupation, source, pending } =
    useSkillSuggestions(
      structured.title,
      structured.department ?? "",
      structured.roleType,
      apiKey,
    );

  const allAdded = [...structured.mandatorySkills, ...structured.mustHaveSkills, ...structured.niceToHaveSkills];

  const getSuggestions = (tier: "mandatory" | "mustHave" | "niceToHave") =>
    filterSuggestions(suggestions?.[tier] ?? [], allAdded, "");

  const inputCls = "w-full border border-[var(--border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] bg-[var(--bg)] outline-none transition-all focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]";
  const labelCls = "block text-[13px] font-medium text-[var(--text-primary)] mb-1.5";
  const suggestionsLoading = status === "loading" || pending;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-sm)]">

      {/* Card header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent-light)] flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] text-[var(--text-primary)]">Job Description</div>
          <div className="text-[12px] text-[var(--text-muted)]">3-tier skill filter · AI suggestions per role &amp; department</div>
        </div>
        {/* Mode toggle — compact */}
        <div className="flex border border-[var(--border)] rounded-lg overflow-hidden text-[12px] flex-shrink-0">
          {(["structured", "freetext"] as JDMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className="px-3 py-1.5 border-none cursor-pointer font-medium transition-colors"
              style={{
                background: mode === m ? "var(--accent)" : "transparent",
                color: mode === m ? "#fff" : "var(--text-muted)",
                borderRight: m === "structured" ? "0.5px solid var(--border)" : "none",
              }}
            >
              {m === "structured" ? "Structured" : "Free-text"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {mode === "structured" && (
          <div className="flex flex-col gap-6">

            {/* Section: Role */}
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Role</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Job title <span className="text-[var(--danger)]">*</span></label>
                  <input
                    className={inputCls}
                    value={structured.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="e.g. QA Engineer, Data Analyst…"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <label className={labelCls}>Department / industry</label>
                  <input
                    className={inputCls}
                    value={structured.department ?? ""}
                    onChange={(e) => set("department", e.target.value)}
                    placeholder="e.g. Fintech, Gaming, Healthcare…"
                    disabled={disabled}
                  />
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

            {/* Suggestion status strip */}
            <div className="flex items-center gap-2.5 min-h-[28px]">
              {/* Idle — title too short */}
              {status === "idle" && !pending && (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Enter a job title to generate skill suggestions
                </p>
              )}

              {/* Settling — user still typing */}
              {pending && (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Waiting for you to finish typing…
                </p>
              )}

              {/* Loading */}
              {status === "loading" && (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin flex-shrink-0" />
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Fetching suggestions for &ldquo;{structured.title}&rdquo;{structured.department ? ` in ${structured.department}` : ""}…
                  </p>
                </>
              )}

              {/* Success */}
              {status === "success" && (
                <>
                  <span className="text-[var(--success)] text-[13px] font-medium">✓</span>
                  <p className="text-[12px] text-[var(--text-secondary)] flex-1 min-w-0 truncate">
                    {resolvedOccupation && resolvedOccupation.toLowerCase() !== structured.title.toLowerCase()
                      ? <>Matched <strong className="text-[var(--text-primary)]">&ldquo;{resolvedOccupation}&rdquo;</strong></>
                      : <>&ldquo;{structured.title}&rdquo; suggestions ready</>
                    }
                    {structured.department ? <> &middot; {structured.department}</> : null}
                  </p>
                  <SourcePill source={source} />
                  <button
                    type="button"
                    onClick={refresh}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer transition-colors flex-shrink-0"
                  >
                    ↺ Refresh
                  </button>
                </>
              )}

              {/* Error */}
              {status === "error" && (
                <>
                  <span className="text-[var(--danger)] text-[13px]">!</span>
                  <p className="text-[12px] text-[var(--danger)] flex-1">{suggestErr ?? "Suggestions unavailable"}</p>
                  <button
                    type="button"
                    onClick={refresh}
                    className="text-[11px] text-[var(--accent)] bg-transparent border-none cursor-pointer underline flex-shrink-0"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>

            {/* Section: Skills */}
            <div className="flex flex-col gap-4">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">Skill tiers</div>

              <div className="grid grid-cols-2 gap-4">
                <TierBlock
                  tier="mandatory"
                  label="Mandatory"
                  count={structured.mandatorySkills.length}
                  weightLabel="Auto-disqualify"
                  descriptionText="Missing any of these removes the candidate before scoring."
                  badgeClass="bg-[#FCEBEB] text-[#7F1D1D] border-[#FCA5A5]"
                  id="mandatory-skills"
                  tags={structured.mandatorySkills}
                  onChange={(t) => set("mandatorySkills", t)}
                  placeholder="Add a non-negotiable skill…"
                  suggestions={getSuggestions("mandatory")}
                  loading={suggestionsLoading}
                  disabled={disabled}
                />

                <TierBlock
                  tier="must"
                  label="Must-have"
                  count={structured.mustHaveSkills.length}
                  weightLabel="1.0× weight"
                  descriptionText="Lowers score if missing, candidate still ranked."
                  badgeClass="bg-[#ECFDF5] text-[#064E3B] border-[#6EE7B7]"
                  id="must-have-skills"
                  tags={structured.mustHaveSkills}
                  onChange={(t) => set("mustHaveSkills", t)}
                  placeholder="Add a required skill…"
                  suggestions={getSuggestions("mustHave")}
                  loading={suggestionsLoading}
                  disabled={disabled}
                />
              </div>

              <TierBlock
                tier="nice"
                label="Nice-to-have"
                count={structured.niceToHaveSkills.length}
                weightLabel="0.6× weight"
                descriptionText="Bonus if present, no penalty if absent."
                badgeClass="bg-[#FFFBEB] text-[#78350F] border-[#FCD34D]"
                id="nice-to-have-skills"
                tags={structured.niceToHaveSkills}
                onChange={(t) => set("niceToHaveSkills", t)}
                placeholder="Add a bonus skill…"
                suggestions={getSuggestions("niceToHave")}
                loading={suggestionsLoading}
                disabled={disabled}
              />
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* Section: Responsibilities + Experience/Education side by side */}
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Responsibilities</label>
                  <textarea
                    className={inputCls}
                    rows={5}
                    value={structured.responsibilities}
                    onChange={(e) => set("responsibilities", e.target.value)}
                    placeholder="Describe the key duties and expectations for this role…"
                    disabled={disabled}
                  />
                </div>

                <div className="flex flex-col gap-4">

                  <div>
                    <label className={labelCls}>Education required</label>
                    <select
                      className={inputCls}
                      value={structured.educationRequired}
                      onChange={(e) => set("educationRequired", e.target.value as EducationLevel)}
                      disabled={disabled}
                    >
                      <option value="any">Any / not specified</option>
                      <option value="diploma">Diploma or equivalent</option>
                      <option value="bachelor">Bachelor&apos;s degree</option>
                      <option value="master">Master&apos;s degree</option>
                      <option value="phd">PhD</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Experience range</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} max={20}
                        className={inputCls}
                        style={{ width: 64, textAlign: "center" }}
                        value={structured.experienceRange.min}
                        onChange={(e) => set("experienceRange", { ...structured.experienceRange, min: +e.target.value })}
                        disabled={disabled}
                      />
                      <span className="text-[13px] text-[var(--text-muted)]">to</span>
                      <input
                        type="number" min={0} max={30}
                        className={inputCls}
                        style={{ width: 64, textAlign: "center" }}
                        value={structured.experienceRange.max}
                        onChange={(e) => set("experienceRange", { ...structured.experienceRange, max: +e.target.value })}
                        disabled={disabled}
                      />
                      <span className="text-[12px] text-[var(--text-muted)]">yrs</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* JD preview (collapsible) */}
            <details className="group">
              <summary className="text-[12px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] select-none list-none flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-open:rotate-90">
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Preview generated JD
              </summary>
              <pre className="mt-2 text-[12px] text-[var(--text-secondary)] bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                {structured.title ? buildJDText(structured) : "Fill in the fields above…"}
              </pre>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                🧠 JD Intelligence Agent will validate this before screening.
              </p>
            </details>

          </div>
        )}

        {mode === "freetext" && (
          <div>
            <textarea
              className={inputCls}
              rows={11}
              value={freeText}
              onChange={(e) => onFreeTextChange(e.target.value)}
              placeholder={"Paste the full job description here…\n\nWe are looking for a Senior QA Engineer with 4+ years experience in Selenium, API testing, and CI/CD pipelines."}
              disabled={disabled}
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              🧠 JD Intelligence Agent will extract and validate skills automatically.
              Mandatory skill hard-filter is only available in structured mode.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}