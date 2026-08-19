"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Wand2 } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

type HeaderProps = {
    title?: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
};

export default function Header({
    title = "HireAgent",
    subtitle,
    showBack = false,
    onBack,
}: HeaderProps) {
    return (
        <header
            className="sticky top-0 z-50 border-b px-6 h-16 flex items-center justify-between backdrop-blur-md"
            style={{
                background: "color-mix(in srgb, var(--surface) 88%, transparent)",
                borderColor: "var(--border)",
            }}
        >
            <div className="flex items-center gap-3">
                {showBack ? (
                    <button
                        onClick={onBack}
                        aria-label="Back"
                        className="flex items-center gap-1.5 text-[13px] font-medium border-none bg-transparent cursor-pointer px-1 py-1.5 rounded-(--radius-sm) transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        <ArrowLeft size={16} strokeWidth={2.25} />
                    </button>
                ) : null}

                <Link href="/" className="flex items-center gap-2.5">
                    <Image src="/icons/robot.svg" alt="" width={32} height={32} />
                    <div className="flex items-baseline gap-2">
                        <span className="font-display font-semibold text-[16px] text-(--text-primary)">
                            {title}
                        </span>
                        {subtitle && (
                            <span className="text-[12px] text-(--text-muted) hidden sm:inline">
                                {subtitle}
                            </span>
                        )}
                    </div>
                </Link>
            </div>

            <div className="flex items-center gap-3">
                <Link href="/convert-cv">
                    <button
                        className="flex items-center gap-1.5 text-[13px] font-medium rounded-(--radius) px-[14px] py-[7px] border-none cursor-pointer transition-opacity hover:opacity-90"
                        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                    >
                        <Wand2 size={14} strokeWidth={2.25} />
                        Convert CV
                    </button>
                </Link>

                <div className="w-px h-5" style={{ background: "var(--border)" }} />

                <ThemeToggle />
            </div>
        </header>
    );
}