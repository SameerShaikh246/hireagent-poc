"use client";
import { useRouter } from "next/navigation";
import { FileSearch } from "lucide-react";
import Header from "@/components/Header";
import ScreeningResultsView from "@/components/screen/ScreeningResultsView";
import { useScreening } from "@/context/ScreeningContext";

export default function ScreenResultsPage() {
  const router = useRouter();
  const { results } = useScreening();

  if (!results) {
    return (
      <div className="min-h-screen bg-(--bg)">
        <Header showBack backHref="/screen" subtitle="Screen uploaded resumes" />
        <div className="max-w-md mx-auto py-20 px-5 text-center">
          <FileSearch size={32} strokeWidth={1.5} color="var(--text-muted)" className="mx-auto mb-4" />
          <p className="text-(--text-secondary) text-[14px] mb-5">
            No screening results yet. Run a screening first.
          </p>
          <button
            onClick={() => router.push("/screen")}
            className="text-[13px] font-semibold rounded-lg px-4 py-2 border-none cursor-pointer"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            Start screening
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-(--bg)">
      <Header showBack backHref="/screen" subtitle="Screen uploaded resumes" />
      <ScreeningResultsView />
    </div>
  );
}
