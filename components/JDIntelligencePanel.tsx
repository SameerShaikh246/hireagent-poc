"use client";
import { BrainCircuit, Plus, Minus, Shuffle, PenLine, CalendarClock, TriangleAlert, type LucideIcon } from "lucide-react";
import type { JDIntelligenceResult } from "@/types";

interface Props {
  result: JDIntelligenceResult;
  defaultOpen?: boolean;
}

const changeIcon: Record<string, LucideIcon> = {
  added: Plus,
  removed: Minus,
  reclassified: Shuffle,
  normalized: PenLine,
  experience_adjusted: CalendarClock,
};

const changeColor: Record<string, string> = {
  added: "var(--success)",
  removed: "var(--danger)",
  reclassified: "var(--warning)",
  normalized: "var(--info)",
  experience_adjusted: "var(--accent)",
};

export default function JDIntelligencePanel({ result, defaultOpen = false }: Props) {
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: "var(--accent-light)" }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface)" }}>
          <BrainCircuit size={16} strokeWidth={2} color="var(--accent)" />
        </div>
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
            className="text-[18px] font-bold font-data"
            style={{ color: confidencePct >= 80 ? "var(--success)" : confidencePct >= 60 ? "var(--warning)" : "var(--danger)" }}
          >
            {confidencePct}%
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">confidence</div>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full border"
          style={{
            background: result.roleType === "technical" ? "var(--info-light)" : "var(--accent-light)",
            color: result.roleType === "technical" ? "var(--info)" : "var(--accent)",
            borderColor: "transparent",
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
                  className="text-[11px] px-2 py-0.5 rounded-full border"
                  style={{ background: "var(--surface-hover)", color: "var(--text-secondary)", borderColor: "var(--border)" }}
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
                    background: isNew ? "var(--success-light)" : "var(--accent-light)",
                    color: isNew ? "var(--success)" : "var(--accent)",
                    borderColor: "transparent",
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
        <div className="px-5 py-3 border-t border-[var(--border)]" style={{ background: "var(--warning-light)" }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--warning)" }}>
            <TriangleAlert size={12} strokeWidth={2.25} />
            Warnings
          </div>
          {result.warnings.map((w, i) => (
            <div key={i} className="text-[12px] mb-1" style={{ color: "var(--text-secondary)" }}>
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
            {result.changes.map((c, i) => {
              const Icon = changeIcon[c.type] ?? Plus;
              return (
                <div key={i} className="flex items-start gap-2 text-[12px]">
                  <Icon size={13} strokeWidth={2.25} className="mt-0.5 shrink-0" color={changeColor[c.type] ?? "var(--text-secondary)"} />
                  <div>
                    <span style={{ color: changeColor[c.type] ?? "inherit", fontWeight: 500 }}>
                      {c.type.replace("_", " ")}
                      {c.skill ? `: "${c.skill}"` : ""}
                      {c.from && c.to ? ` (${c.from} → ${c.to})` : ""}
                    </span>
                    <span className="text-[var(--text-secondary)] ml-1">— {c.reason}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}