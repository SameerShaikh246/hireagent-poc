"use client";
import Header from "@/components/Header";
import SearchSetupPanel from "@/components/search/SearchSetupPanel";

export default function SearchPage() {
    return (
        <div className="min-h-screen bg-(--bg)">
            <Header showBack backHref="/" subtitle="Find candidates online" />
            <SearchSetupPanel />
        </div>
    );
}