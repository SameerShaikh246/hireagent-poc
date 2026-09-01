"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { JDMode, StructuredJD, ScreeningResponse } from "@/types";
import { buildJDText } from "@/components/JobDescriptionForm";

interface ProcessingState {
  current: number;
  stage: string;
}

interface RunScreeningArgs {
  jdMode: JDMode;
  structuredJD: StructuredJD;
  freeTextJD: string;
  groqApiKey: string;
}

interface ScreeningContextValue {
  files: File[];
  setFiles: (f: File[]) => void;
  loading: boolean;
  processing: ProcessingState;
  error: string;
  results: ScreeningResponse | null;
  runScreening: (args: RunScreeningArgs) => Promise<boolean>;
  reset: () => void;
}

const ScreeningContext = createContext<ScreeningContextValue | null>(null);

const STAGES = [
  "parse agent — extracting text from resumes…",
  "score agent — applying mandatory filter & matching skills…",
  "justify agent — Groq AI assessing role fit…",
  "rank agent — sorting candidates…",
];

export function ScreeningProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState>({ current: 0, stage: "" });
  const [error, setError] = useState("");
  const [results, setResults] = useState<ScreeningResponse | null>(null);

  const runScreening = async ({ jdMode, structuredJD, freeTextJD, groqApiKey }: RunScreeningArgs) => {
    setError("");
    setLoading(true);
    setProcessing({ current: 0, stage: "Initializing pipeline…" });

    const formData = new FormData();
    const jdText = jdMode === "structured" ? buildJDText(structuredJD) : freeTextJD;
    formData.append("jobDescription", jdText);
    formData.append("jdMode", jdMode);
    if (jdMode === "structured") {
      formData.append("mandatorySkills", JSON.stringify(structuredJD.mandatorySkills));
      formData.append("mustHaveSkills", JSON.stringify(structuredJD.mustHaveSkills));
      formData.append("niceToHaveSkills", JSON.stringify(structuredJD.niceToHaveSkills));
      formData.append("roleType", structuredJD.roleType);
      formData.append("experienceMin", String(structuredJD.experienceRange.min));
      formData.append("experienceMax", String(structuredJD.experienceRange.max));
      formData.append("educationRequired", structuredJD.educationRequired);
    }
    formData.append("apiKey", groqApiKey);
    files.forEach((f) => formData.append("resumes", f));

    const interval = setInterval(() => {
      setProcessing((prev) => {
        const nextStage =
          STAGES[Math.min(Math.floor(prev.current / (files.length / 4 + 1)), STAGES.length - 1)];
        return {
          current: Math.min(prev.current + 1, Math.max(files.length - 1, 0)),
          stage: nextStage,
        };
      });
    }, 900);

    try {
      const res = await fetch("/api/screen", { method: "POST", body: formData });
      clearInterval(interval);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      const data: ScreeningResponse = await res.json();
      setResults(data);
      return true;
    } catch (err: unknown) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResults(null);
    setError("");
  };

  return (
    <ScreeningContext.Provider
      value={{ files, setFiles, loading, processing, error, results, runScreening, reset }}
    >
      {children}
    </ScreeningContext.Provider>
  );
}

export function useScreening() {
  const ctx = useContext(ScreeningContext);
  if (!ctx) throw new Error("useScreening must be used within a ScreeningProvider");
  return ctx;
}