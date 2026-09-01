"use client";
import Header from "@/components/Header";
import ProcessingScreen from "@/components/ProcessingScreen";
import ScreenSetupPanel from "@/components/screen/ScreenSetupPanel";
import { useScreening } from "@/context/ScreeningContext";

export default function ScreenPage() {
  const { loading, processing, files } = useScreening();

  return (
    <div className="min-h-screen bg-(--bg)">
      <Header showBack backHref="/" subtitle="Screen uploaded resumes" />
      {loading ? (
        <ProcessingScreen total={files.length} current={processing.current} stage={processing.stage} />
      ) : (
        <ScreenSetupPanel />
      )}
    </div>
  );
}