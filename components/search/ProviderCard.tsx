"use client";
import { Database, Code2, Search, Brain, Globe, type LucideIcon } from "lucide-react";
import type { Provider } from "@/lib/webSearchTypes";
import { PROVIDERS, toneStyle } from "@/lib/searchProviders";

const ICONS: Record<string, LucideIcon> = {
    database: Database,
    github: Code2,
    search: Search,
    brain: Brain,
    globe: Globe,
};

export default function ProviderCard({
    id,
    selected,
    onSelect,
}: {
    id: Provider;
    selected: boolean;
    onSelect: () => void;
}) {
    const p = PROVIDERS[id];
    const Icon = ICONS[p.icon] ?? Globe;
    const badge = toneStyle(p.tone);

    return (
        <div
            onClick={onSelect}
            className="flex-1 border rounded-xl p-3.5 cursor-pointer transition-all select-none min-w-0"
            style={{
                borderColor: selected ? "var(--accent)" : "var(--border)",
                background: selected ? "var(--accent-light)" : "var(--bg)",
                boxShadow: selected ? "0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent)" : "none",
            }}
        >
            <div className="flex items-center justify-between mb-1.5 gap-1 flex-wrap">
                <div className="flex items-center gap-2">
                    <div
                        className="w-2.5 h-2.5 rounded-full border-2 transition-colors shrink-0"
                        style={{
                            borderColor: selected ? "var(--accent)" : "var(--border)",
                            background: selected ? "var(--accent)" : "transparent",
                        }}
                    />
                    <Icon size={13} strokeWidth={2.25} color="var(--text-secondary)" />
                    <span className="font-semibold text-[12px] text-(--text-primary)">{p.label}</span>
                </div>
                <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0"
                    style={{ background: badge.bg, color: badge.color, borderColor: badge.border }}
                >
                    {p.bestFor}
                </span>
            </div>
            <div className="text-[11px] text-(--text-muted) mb-1">
                <span className="font-medium" style={{ color: "var(--success)" }}>
                    Free:
                </span>{" "}
                {p.free}
            </div>
            {p.isStructured && (
                <div
                    className="text-[9px] font-semibold rounded px-1.5 py-0.5 inline-block mb-1"
                    style={{ background: "var(--warning-light)", color: "var(--warning)", border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)" }}
                >
                    ✓ Structured data · Not web scraping
                </div>
            )}
            {selected && (
                <p className="text-[11px] text-(--text-secondary) leading-snug mt-1.5 border-t border-(--border) pt-1.5">
                    {p.tip}
                </p>
            )}
        </div>
    );
}