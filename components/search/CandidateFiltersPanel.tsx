"use client";
import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { CandidateFilters, EducationFilterLevel } from "@/lib/webSearchTypes";
import LocationInput from "@/components/LocationInput";

const EDUCATION_OPTIONS: { value: EducationFilterLevel; label: string }[] = [
    { value: "any", label: "Any" },
    { value: "diploma", label: "Diploma+" },
    { value: "bachelor", label: "Bachelor's+" },
    { value: "master", label: "Master's+" },
    { value: "phd", label: "PhD" },
];

export default function CandidateFiltersPanel({
    availableSkills,
    initialFilters,
    onApply,
    loading,
}: {
    /** JD skills to offer as quick-toggle chips — usually extractedJD's combined skill list. */
    availableSkills: string[];
    initialFilters?: CandidateFilters;
    /** Called with the built filters object, or undefined if every filter was cleared. */
    onApply: (filters: CandidateFilters | undefined) => void;
    loading: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [skills, setSkills] = useState<string[]>(initialFilters?.skills ?? []);
    const [minScore, setMinScore] = useState<number | "">(initialFilters?.minScore ?? "");
    const [maxScore, setMaxScore] = useState<number | "">(initialFilters?.maxScore ?? "");
    const [education, setEducation] = useState<EducationFilterLevel>(initialFilters?.education ?? "any");
    const [minExperience, setMinExperience] = useState<number | "">(initialFilters?.minExperience ?? "");
    const [maxExperience, setMaxExperience] = useState<number | "">(initialFilters?.maxExperience ?? "");
    const [includeUnknown, setIncludeUnknown] = useState(initialFilters?.includeUnknown ?? false);
    const [locations, setLocations] = useState<string[]>(initialFilters?.locations ?? []);

    // Pick up a location chosen on the main page (or changed by a re-run).
    // `?? []` matters: without it this can set `locations` to undefined.
    useEffect(() => {
        setLocations(initialFilters?.locations ?? []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [(initialFilters?.locations ?? []).join("|")]);

    const toggleSkill = (s: string) =>
        setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

    const activeCount =
        skills.length +
        (locations.length > 0 ? 1 : 0) +
        (minScore !== "" ? 1 : 0) +
        (maxScore !== "" ? 1 : 0) +
        (education !== "any" ? 1 : 0) +
        (minExperience !== "" ? 1 : 0) +
        (maxExperience !== "" ? 1 : 0);

    const apply = () => {
        const filters: CandidateFilters = {
            skills: skills.length ? skills : undefined,
            minScore: minScore === "" ? undefined : Number(minScore),
            maxScore: maxScore === "" ? undefined : Number(maxScore),
            education: education === "any" ? undefined : education,
            minExperience: minExperience === "" ? undefined : Number(minExperience),
            maxExperience: maxExperience === "" ? undefined : Number(maxExperience),
            locations: locations.length ? locations : undefined,
            includeUnknown,
        };
        const hasAny = Object.entries(filters).some(
            ([key, v]) => key !== "includeUnknown" && v !== undefined,
        );
        onApply(hasAny ? filters : undefined);
    };

    const clear = () => {
        setSkills([]);
        setMinScore("");
        setMaxScore("");
        setEducation("any");
        setMinExperience("");
        setMaxExperience("");
        setIncludeUnknown(false);
        setLocations([]);
        onApply(undefined);
    };

    const inputCls = "border rounded-lg px-2.5 py-1.5 text-[12px] text-(--text-primary) outline-none w-full";

    return (
        <div className="mb-4 rounded-(--radius-lg) border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 border-none bg-transparent cursor-pointer"
            >
                <span className="flex items-center gap-2 text-[12px] font-semibold text-(--text-primary)">
                    <SlidersHorizontal size={13} strokeWidth={2.25} />
                    Filters
                    {activeCount > 0 && (
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                        >
                            {activeCount}
                        </span>
                    )}
                </span>
                <span className="text-[11px] text-(--text-muted)">{open ? "Hide" : "Show"}</span>
            </button>

            {open && (
                <div className="px-4 pb-4 flex flex-col gap-3 border-t" style={{ borderColor: "var(--border)" }}>
                    {availableSkills.length > 0 && (
                        <div className="pt-3">
                            <div className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Must have skill</div>
                            <div className="flex flex-wrap gap-1.5">
                                {availableSkills.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => toggleSkill(s)}
                                        className="text-[11px] px-2.5 py-1 rounded-full border cursor-pointer font-medium"
                                        style={
                                            skills.includes(s)
                                                ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" }
                                                : { background: "var(--bg)", color: "var(--text-muted)", borderColor: "var(--border)" }
                                        }
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={availableSkills.length === 0 ? "pt-3" : ""}>
                        <LocationInput value={locations} onChange={setLocations} disabled={loading} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div>
                            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1">Min score</label>
                            <input
                                type="number" min={0} max={100}
                                value={minScore}
                                onChange={(e) => setMinScore(e.target.value === "" ? "" : +e.target.value)}
                                className={inputCls}
                                style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1">Max score</label>
                            <input
                                type="number" min={0} max={100}
                                value={maxScore}
                                onChange={(e) => setMaxScore(e.target.value === "" ? "" : +e.target.value)}
                                className={inputCls}
                                style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1">Education</label>
                            <select
                                value={education}
                                onChange={(e) => setEducation(e.target.value as EducationFilterLevel)}
                                className={inputCls}
                                style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                            >
                                {EDUCATION_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1">Min exp (yrs)</label>
                            <input
                                type="number" min={0}
                                value={minExperience}
                                onChange={(e) => setMinExperience(e.target.value === "" ? "" : +e.target.value)}
                                className={inputCls}
                                style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-(--text-secondary) mb-1">Max exp (yrs)</label>
                            <input
                                type="number" min={0}
                                value={maxExperience}
                                onChange={(e) => setMaxExperience(e.target.value === "" ? "" : +e.target.value)}
                                className={inputCls}
                                style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-(--text-secondary) cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeUnknown}
                            onChange={(e) => setIncludeUnknown(e.target.checked)}
                        />
                        Include candidates with unknown experience/education
                    </label>
                    <p className="text-[10.5px] text-(--text-muted) -mt-2">
                        Off by default — a candidate whose experience or education we simply don&apos;t know is hidden rather than silently assumed to pass.
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={apply}
                            disabled={loading}
                            className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg border-none cursor-pointer"
                            style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: loading ? 0.6 : 1 }}
                        >
                            {loading ? "Applying…" : "Apply filters"}
                        </button>
                        {activeCount > 0 && (
                            <button
                                onClick={clear}
                                disabled={loading}
                                className="flex items-center gap-1 text-[11px] text-(--text-muted) bg-transparent border-none cursor-pointer"
                            >
                                <X size={12} strokeWidth={2.25} /> Clear
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}