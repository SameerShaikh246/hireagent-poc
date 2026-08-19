"use client";

import {
    createContext,
    useContext,
    useState,
    type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const THEME_COOKIE = "hireagent-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
    children,
    initialTheme,
}: {
    children: ReactNode;
    initialTheme: Theme;
}) {
    const [theme, setThemeState] = useState<Theme>(initialTheme);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);

        // Set cookie so the SERVER knows the theme on next request.
        document.cookie = `${THEME_COOKIE}=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;

        // Update DOM immediately.
        document.documentElement.setAttribute(
            "data-theme",
            newTheme
        );
    };

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    return (
        <ThemeContext.Provider
            value={{
                theme,
                setTheme,
                toggleTheme,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error(
            "useTheme must be used within a ThemeProvider"
        );
    }

    return context;
}
