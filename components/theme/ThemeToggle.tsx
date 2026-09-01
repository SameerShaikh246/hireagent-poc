"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={
                isDark
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            }
            aria-pressed={isDark}
            className="relative w-[52px] h-[28px] rounded-full border transition-colors cursor-pointer shrink-0"
            style={{
                background: isDark
                    ? "var(--accent-light)"
                    : "var(--surface-hover)",
                borderColor: "var(--border)",
            }}
        >
            <span
                className="absolute top-[2px] flex items-center justify-center w-[22px] h-[22px] rounded-full transition-transform duration-200 ease-out"
                style={{
                    background: "var(--surface)",
                    boxShadow: "var(--shadow-sm)",
                    transform: isDark
                        ? "translateX(26px)"
                        : "translateX(2px)",
                }}
            >
                {isDark ? (
                    <Moon
                        size={12}
                        strokeWidth={2.25}
                        color="var(--accent)"
                    />
                ) : (
                    <Sun
                        size={12}
                        strokeWidth={2.25}
                        color="var(--warning)"
                    />
                )}
            </span>
        </button>
    );
}
