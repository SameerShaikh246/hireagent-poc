// Maps a semantic "tone" to theme tokens that already flip correctly between
// light/dark (see globals.css --success/--success-light etc from phase 1).
// Using color-mix for the border keeps it soft in both themes without
// needing a dedicated --X-border token per tone.

export type Tone = "success" | "info" | "warning" | "danger" | "accent" | "neutral";

export interface ToneStyle {
  bg: string;
  color: string;
  border: string;
}

const TONE_MAP: Record<Tone, ToneStyle> = {
  success: {
    bg: "var(--success-light)",
    color: "var(--success)",
    border: "color-mix(in srgb, var(--success) 35%, transparent)",
  },
  info: {
    bg: "var(--info-light)",
    color: "var(--info)",
    border: "color-mix(in srgb, var(--info) 35%, transparent)",
  },
  warning: {
    bg: "var(--warning-light)",
    color: "var(--warning)",
    border: "color-mix(in srgb, var(--warning) 35%, transparent)",
  },
  danger: {
    bg: "var(--danger-light)",
    color: "var(--danger)",
    border: "color-mix(in srgb, var(--danger) 35%, transparent)",
  },
  accent: {
    bg: "var(--accent-light)",
    color: "var(--accent)",
    border: "color-mix(in srgb, var(--accent) 35%, transparent)",
  },
  neutral: {
    bg: "var(--surface-hover)",
    color: "var(--text-secondary)",
    border: "var(--border)",
  },
};

export function toneStyle(tone: Tone): ToneStyle {
  return TONE_MAP[tone];
}

export function recommendationTone(rec: string): Tone {
  switch (rec) {
    case "Strong Yes":
      return "success";
    case "Yes":
      return "info";
    case "Maybe":
      return "warning";
    case "No":
      return "danger";
    default:
      return "neutral";
  }
}

export function matchTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 55) return "info";
  if (score >= 35) return "warning";
  return "danger";
}

export function sourceTone(source: "linkedin" | "github" | "portfolio" | "other"): Tone {
  switch (source) {
    case "linkedin":
      return "info";
    case "portfolio":
      return "accent";
    default:
      return "neutral";
  }
}