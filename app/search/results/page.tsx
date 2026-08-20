"use client";
import { useRouter } from "next/navigation";
import { SearchX } from "lucide-react";
import Header from "@/components/Header";
import SearchResultsView from "@/components/search/SearchResultsView";
import { useWebSearch } from "@/context/WebSearchContext";

export default function SearchResultsPage() {
    const router = useRouter();
    const { results } = useWebSearch();

    if (!results) {
        return (
            <div className="min-h-screen bg-(--bg)">
                <Header showBack backHref="/search" subtitle="Find candidates online" />
                <div className="max-w-md mx-auto py-20 px-5 text-center">
                    <SearchX size={32} strokeWidth={1.5} color="var(--text-muted)" className="mx-auto mb-4" />
                    <p className="text-(--text-secondary) text-[14px] mb-5">
                        No search results yet. Run a search first.
                    </p>
                    <button
                        onClick={() => router.push("/search")}
                        className="text-[13px] font-semibold rounded-lg px-4 py-2 border-none cursor-pointer"
                        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                    >
                        Start a search
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-(--bg)">
            <Header showBack backHref="/search" subtitle="Find candidates online" />
            <SearchResultsView />
        </div>
    );
}