"use client";
import type { ReactNode, KeyboardEvent } from "react";

export default function ExpandableRow({
    isOpen,
    onToggle,
    className,
    children,
    label,
}: {
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
    children: ReactNode;
    /** Accessible name for screen readers, e.g. "Candidate details for Jane Doe" */
    label: string;
}) {
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            aria-label={label}
            onClick={onToggle}
            onKeyDown={handleKeyDown}
            className={className}
        >
            {children}
        </div>
    );
}