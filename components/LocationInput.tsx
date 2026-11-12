"use client";
import { useState } from "react";
import { X } from "lucide-react";

export const LOCATION_SUGGESTIONS = [
    "Bengaluru", "Hyderabad", "Pune", "Chennai", "Mumbai",
    "Delhi", "Noida", "Gurugram", "Kolkata", "Ahmedabad",
];
export const MAX_LOCATIONS = 5;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function LocationInput({
    value,
    onChange,
    disabled,
}: {
    value?: string[];
    onChange?: (locations: string[]) => void;
    disabled?: boolean;
}) {
    const [input, setInput] = useState("");
    const list: string[] = Array.isArray(value) ? value : [];
    const emit = (next: string[]) => onChange?.(next);
    const has = (v: string) => list.some((l) => same(l, v));

    const add = (raw: string) => {
        const v = raw.trim();
        setInput("");
        if (!v || has(v) || list.length >= MAX_LOCATIONS) return;
        emit([...list, v]);
    };
    const toggle = (v: string) => {
        if (has(v)) emit(list.filter((l) => !same(l, v)));
        else if (list.length < MAX_LOCATIONS) emit([...list, v]);
    };
    const custom = list.filter((l) => !LOCATION_SUGGESTIONS.some((s) => same(s, l)));

    return (
        <div>
            <div className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
                Candidate location <span className="text-(--text-muted) font-normal">(up to {MAX_LOCATIONS})</span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
                {LOCATION_SUGGESTIONS.map((s) => (
                    <button
                        key={s}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full border cursor-pointer font-medium"
                        style={has(s)
                            ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" }
                            : { background: "var(--bg)", color: "var(--text-muted)", borderColor: "var(--border)" }}
                    >
                        {s}
                    </button>
                ))}
                {custom.map((l) => (
                    <span
                        key={l}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium"
                        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                    >
                        {l}
                        <button type="button" onClick={() => toggle(l)} aria-label={`Remove ${l}`}
                            className="bg-transparent border-none cursor-pointer p-0 flex" style={{ color: "inherit" }}>
                            <X size={11} strokeWidth={2.5} />
                        </button>
                    </span>
                ))}
            </div>

            <input
                value={input}
                disabled={disabled || list.length >= MAX_LOCATIONS}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
                }}
                onBlur={() => { if (input.trim()) add(input); }}
                placeholder="Type another city and press Enter"
                className="border rounded-lg px-2.5 py-1.5 text-[12px] text-(--text-primary) outline-none w-full"
                style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            />
            <p className="text-[10.5px] text-(--text-muted) mt-1">Leave empty to search all of India.</p>
        </div>
    );
}