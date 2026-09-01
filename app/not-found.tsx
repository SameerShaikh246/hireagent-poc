import Link from "next/link";
import { SearchX, Home } from "lucide-react";
import Header from "@/components/Header";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-(--bg)">
            <Header subtitle="Agentic AI Resume Screener" />

            <main
                className="max-w-md mx-auto py-24 px-5 text-center"
                aria-labelledby="not-found-title"
            >
                <div
                    className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                    style={{ background: "var(--accent-light)" }}
                    aria-hidden="true"
                >
                    <SearchX
                        size={26}
                        strokeWidth={1.75}
                        color="var(--accent)"
                    />
                </div>

                <h1
                    id="not-found-title"
                    className="font-display text-[22px] font-semibold text-(--text-primary) mb-2"
                >
                    Page not found
                </h1>

                <p className="text-(--text-secondary) text-[14px] mb-6 leading-relaxed">
                    The page you're looking for doesn't exist, or the link may
                    be out of date.
                </p>

                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-4 py-2 no-underline"
                    style={{
                        background: "var(--accent)",
                        color: "var(--accent-contrast)",
                    }}
                >
                    <Home size={14} strokeWidth={2.25} aria-hidden="true" />
                    Back to home
                </Link>
            </main>
        </div>
    );
}
