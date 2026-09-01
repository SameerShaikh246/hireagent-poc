"use client";
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "hireagent-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
    if (typeof document === "undefined") return "light";
    // ThemeScript already set this attribute before hydration — just read it
    // back so React's first render matches the DOM (no hydration mismatch).
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(readInitialTheme);

    const setTheme = (t: Theme) => {
        setThemeState(t);
        document.documentElement.setAttribute("data-theme", t);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, t);
        } catch {
            // localStorage unavailable (private browsing, etc.) — theme just
            // won't persist across reloads, which is an acceptable fallback.
        }
    };

    const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

    // Keep in sync if the user changes OS-level theme and hasn't set an
    // explicit preference yet.
    useEffect(() => {
        const stored = (() => {
            try {
                return localStorage.getItem(THEME_STORAGE_KEY);
            } catch {
                return null;
            }
        })();
        if (stored === "light" || stored === "dark") return;

        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e: MediaQueryListEvent) =>
            setTheme(e.matches ? "dark" : "light");
        media.addEventListener("change", handleChange);
        return () => media.removeEventListener("change", handleChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
    return ctx;
}