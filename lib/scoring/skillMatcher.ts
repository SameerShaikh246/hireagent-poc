import { SKILL_ALIASES } from "../constants/skillAliases";

// SKILL PRESENCE CHECK (alias-aware) 
export function skillPresentInText(skill: string, text: string): boolean {
  const skillLower = skill.toLowerCase();

  // Direct match — phrase or word boundary
  const escaped = skillLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = skillLower.includes(" ")
    ? new RegExp(escaped, "i")
    : new RegExp(`\\b${escaped}\\b`, "i");
  if (pattern.test(text)) return true;

  // Check if any alias for this skill appears in text
  const aliases = SKILL_ALIASES[skillLower] ?? [];
  for (const alias of aliases) {
    const ae = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ap = alias.includes(" ")
      ? new RegExp(ae, "i")
      : new RegExp(`\\b${ae}\\b`, "i");
    if (ap.test(text)) return true;
}

  // Reverse check: is this skill listed as an alias for a canonical that appears in text?
  for (const [canonical, aliasList] of Object.entries(SKILL_ALIASES)) {
    if (aliasList.includes(skillLower)) {
      const ce = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const cp = canonical.includes(" ")
        ? new RegExp(ce, "i")
        : new RegExp(`\\b${ce}\\b`, "i");
      if (cp.test(text)) return true;
    }
  }

  return false;
}