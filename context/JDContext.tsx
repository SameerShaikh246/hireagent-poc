"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { JDMode, StructuredJD } from "@/types";

interface JDContextValue {
    jdMode: JDMode;
    setJdMode: (m: JDMode) => void;
    structuredJD: StructuredJD;
    setStructuredJD: (jd: StructuredJD) => void;
    freeTextJD: string;
    setFreeTextJD: (v: string) => void;
    groqApiKey: string;
    setGroqApiKey: (v: string) => void;
}

const defaultStructuredJD: StructuredJD = {
    title: "",
    department: "",
    roleType: "technical",
    employmentType: "full-time",
    mandatorySkills: [],
    mustHaveSkills: [],
    niceToHaveSkills: [],
    responsibilities: "",
    experienceRange: { min: 3, max: 6 },
    educationRequired: "bachelor",
};

const JDContext = createContext<JDContextValue | null>(null);

export function JDProvider({ children }: { children: ReactNode }) {
    const [jdMode, setJdMode] = useState<JDMode>("structured");
    const [structuredJD, setStructuredJD] = useState<StructuredJD>(defaultStructuredJD);
    const [freeTextJD, setFreeTextJD] = useState("");
    const [groqApiKey, setGroqApiKey] = useState("");

    return (
        <JDContext.Provider
            value={{
                jdMode,
                setJdMode,
                structuredJD,
                setStructuredJD,
                freeTextJD,
                setFreeTextJD,
                groqApiKey,
                setGroqApiKey,
            }}
        >
            {children}
        </JDContext.Provider>
    );
}

export function useJD() {
    const ctx = useContext(JDContext);
    if (!ctx) throw new Error("useJD must be used within a JDProvider");
    return ctx;
}