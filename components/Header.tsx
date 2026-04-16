"use client";

import Image from "next/image";
import { Bot } from "lucide-react";

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
                        <span className="text-xs text-(--text-muted) ml-2">
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>

            {showBack && (
                <button
                    onClick={onBack}
                    className="text-[13px] text-(--accent) bg-(--accent-light) border border-[#bfdbfe] rounded-(--radius) px-[14px] py-[6px] cursor-pointer font-medium"
                >
                    Back to New Screening
                </button>
            )}
        </header>
    );
}