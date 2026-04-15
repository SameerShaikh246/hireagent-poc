"use client";

interface Props {
  total: number;
  current: number;
  stage: string;
}

const stages = [
  { key: "parse", label: "Parse Agent", desc: "Extracting text from resumes", icon: "📄" },
  { key: "jd", label: "JD Intelligence", desc: "Validating & correcting job description", icon: "🧠" },
  { key: "score", label: "Score Agent", desc: "Rule-based skill matching & scoring", icon: "📊" },
  { key: "justify", label: "Justify Agent", desc: "Groq AI role fit assessment", icon: "🤖" },
  { key: "rank", label: "Ranking", desc: "Sorting candidates by final score", icon: "🏆" },
];

export default function ProcessingScreen({ total, current, stage }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const activeIdx = stages.findIndex((s) => stage.toLowerCase().includes(s.key));

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 p-10">
      <div className="relative w-20 h-20">
        <div className="w-20 h-20 rounded-full border-4 border-[var(--border)] border-t-[var(--accent)] animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-3xl">
          {stages[Math.max(0, activeIdx)]?.icon ?? "⚙️"}
        </div>
      </div>

      <div className="text-center">
        <div className="text-lg font-bold text-[var(--text-primary)] mb-1">Screening Resumes…</div>
        <div className="text-sm text-[var(--text-secondary)]">
          Processing {current} of {total} candidates
        </div>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex justify-between mb-1 text-xs text-[var(--text-muted)]">
          <span>Progress</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {stages.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div
              key={s.key}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-light)]"
                  : done
                  ? "border-[var(--success)] text-[var(--success)] bg-[var(--success-light,#f0fdf4)]"
                  : "border-[var(--border)] text-[var(--text-muted)]"
              }`}
            >
              {done ? "✓ " : ""}{s.label}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-[var(--text-muted)] italic">{stage}</div>
    </div>
  );
}