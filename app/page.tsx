"use client";
import Header from "@/components/Header";
import ScreeningSetup from "@/components/ScreeningSetup";

export default function Home() {
  return (
    <div className="min-h-screen bg-(--bg)">
      <Header subtitle="Agentic AI Resume Screener" />
      <ScreeningSetup />
    </div>
  );
}