"use client";
import type { JDIntelligenceResult } from "@/types";

interface Props {
  result: JDIntelligenceResult;
  defaultOpen?: boolean;
}

const changeIcon: Record<string, string> = {
  added: "➕",
  removed: "➖",
  reclassified: "🔀",
  normalized: "✏️",
  experience_adjusted: "📅",
};

const changeColor: Record<string, string> = {
  added: "#16a34a",
  removed: "#dc2626",
  reclassified: "#d97706",
  normalized: "#2563eb",
  experience_adjusted: "#7c3aed",
};

export default function JDIntelligencePanel({ result, defaultOpen = false }: Props) {
  const hasChanges = result.changes.length > 0 || result.warnings.length > 0;
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-[#fefce8] to-[var(--surface)]">
        <span className="text-xl">🧠</span>
        <div className="flex-1">
          <div className="font-semibold text-[14px] text-[var(--text-primary)]">
            JD Intelligence Agent
          </div>
          <div className="text-[12px] text-[var(--text-muted)]">
            Validated job description · {result.changes.length} correction{result.changes.length !== 1 ? "s" : ""} applied
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-[18px] font-bold"
            style={{ color: confidencePct >= 80 ? "#16a34a" : confidencePct >= 60 ? "#d97706" : "#dc2626" }}
          >
            {confidencePct}%
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">confidence</div>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full border"
          style={{
            background: result.roleType === "technical" ? "#dbeafe" : "#fce7f3",
            color: result.roleType === "technical" ? "#1d4ed8" : "#be185d",
            borderColor: result.roleType === "technical" ? "#93c5fd" : "#f9a8d4",
          }}
        >
          {result.roleType}
        </span>
      </div>

      {/* Skills comparison */}
      <div className="px-5 py-4 border-t border-[var(--border)] grid grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Original must-have
          </div>
          <div className="flex flex-wrap gap-1">
            {result.originalMustHave.length > 0 ? (
              result.originalMustHave.map((s) => (
                <span
                  key={s}
                  className="text-[11px] px-2 py-0.5 rounded-full border bg-[#f3f4f6] text-[#6b7280] border-[#d1d5db]"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[var(--text-muted)] italic">none provided</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            AI-corrected must-have
          </div>
          <div className="flex flex-wrap gap-1">
            {result.mustHaveSkills.map((s) => {
              const isNew = !result.originalMustHave.includes(s);
              return (
                <span
                  key={s}
                  className="text-[11px] px-2 py-0.5 rounded-full border"
                  style={{
                    background: isNew ? "#dcfce7" : "#E1F5EE",
                    color: isNew ? "#15803d" : "#0F6E56",
                    borderColor: isNew ? "#86efac" : "#5DCAA5",
                  }}
                >
                  {isNew ? "✦ " : ""}{s}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[#fffbeb]">
          <div className="text-[11px] font-semibold text-[#92400e] uppercase tracking-wider mb-2">
            ⚠️ Warnings
          </div>
          {result.warnings.map((w, i) => (
            <div key={i} className="text-[12px] text-[#78350f] mb-1">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Changes detail */}
      {result.changes.length > 0 && (
        <div className="px-5 py-4 border-t border-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Changes applied
          </div>
          <div className="flex flex-col gap-2">
            {result.changes.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span className="text-[13px] mt-0.5">{changeIcon[c.type] ?? "•"}</span>
                <div>
                  <span style={{ color: changeColor[c.type] ?? "inherit", fontWeight: 500 }}>
                    {c.type.replace("_", " ")}
                    {c.skill ? `: "${c.skill}"` : ""}
                    {c.from && c.to ? ` (${c.from} → ${c.to})` : ""}
                  </span>
                  <span className="text-[var(--text-secondary)] ml-1">— {c.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}