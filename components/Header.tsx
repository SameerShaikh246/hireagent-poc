"use client";

import Image from "next/image";
import Link from "next/link";

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
        <header className="bg-(--surface) border-b border-(--border) px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Image src="/icons/robot.svg" alt="Logo" width={40} height={40} />
                <div>
                    <span className="font-bold text-[15px] text-(--text-primary)">
                        {title}
                    </span>
                    {subtitle && (
                        <span className="text-xs text-(--text-muted) ml-2">{subtitle}</span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* Convert CV Button */}
                <Link href="/convert-cv">
                    <button className="text-[13px] text-white bg-(--accent) rounded-(--radius) px-[14px] py-1 cursor-pointer font-medium hover:bg-(--accent-hover)">
                        Convert CV
                    </button>
                </Link>

                {/* Back button */}
                {showBack && (
                    <button
                        onClick={onBack}
                        className="text-[13px] text-(--accent) bg-(--accent-light) border border-[#bfdbfe] rounded-(--radius) px-[14px] py-1 cursor-pointer font-medium"
                    >
                        Back
                    </button>
                )}
            </div>
        </header>
    );
}
