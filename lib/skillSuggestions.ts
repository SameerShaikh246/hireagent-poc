import type { SkillSuggestion, SkillSuggestions, RoleType } from "@/types";

// Predefined suggestions keyed by role type + title keywords
// Each entry: { mandatory, mustHave, niceToHave }
// Mandatory = truly non-negotiable for the role to function
// MustHave  = strong preference, score penalty if missing
// NiceToHave = bonus skills

type SuggestionMap = Record<string, SkillSuggestions>;

const TECHNICAL_SUGGESTIONS: SuggestionMap = {
  // Frontend / React
  react: {
    mandatory: [
      { skill: "react", confidence: "high", reason: "Core framework for this role" },
      { skill: "javascript", confidence: "high", reason: "Foundational for any frontend work" },
    ],
    mustHave: [
      { skill: "typescript", confidence: "high", reason: "Industry standard for React projects" },
      { skill: "html", confidence: "high", reason: "Essential frontend skill" },
      { skill: "css", confidence: "high", reason: "Essential frontend skill" },
      { skill: "rest apis", confidence: "high", reason: "Standard integration method" },
      { skill: "git", confidence: "high", reason: "Required for all modern dev teams" },
    ],
    niceToHave: [
      { skill: "next.js", confidence: "high", reason: "Popular React meta-framework" },
      { skill: "graphql", confidence: "medium", reason: "Modern API approach" },
      { skill: "redux", confidence: "medium", reason: "State management" },
      { skill: "jest", confidence: "medium", reason: "Testing library" },
      { skill: "tailwind", confidence: "medium", reason: "Utility CSS framework" },
      { skill: "storybook", confidence: "medium", reason: "Component documentation" },
      { skill: "webpack", confidence: "medium", reason: "Bundler" },
      { skill: "vite", confidence: "high", reason: "Modern build tool" },
    ],
  },

  // Angular
  angular: {
    mandatory: [
      { skill: "angular", confidence: "high", reason: "Core framework for this role" },
      { skill: "typescript", confidence: "high", reason: "Angular is TypeScript-first" },
    ],
    mustHave: [
      { skill: "javascript", confidence: "high", reason: "Foundational" },
      { skill: "rxjs", confidence: "high", reason: "Core to Angular development" },
      { skill: "html", confidence: "high", reason: "Essential" },
      { skill: "css", confidence: "high", reason: "Essential" },
      { skill: "rest apis", confidence: "high", reason: "Standard integration" },
    ],
    niceToHave: [
      { skill: "ngrx", confidence: "medium", reason: "Angular state management" },
      { skill: "jasmine", confidence: "medium", reason: "Angular default test framework" },
      { skill: "karma", confidence: "medium", reason: "Test runner" },
      { skill: "docker", confidence: "medium", reason: "Containerisation" },
    ],
  },

  // Vue
  vue: {
    mandatory: [
      { skill: "vue.js", confidence: "high", reason: "Core framework" },
      { skill: "javascript", confidence: "high", reason: "Foundational" },
    ],
    mustHave: [
      { skill: "typescript", confidence: "high", reason: "Modern Vue projects" },
      { skill: "html", confidence: "high", reason: "Essential" },
      { skill: "css", confidence: "high", reason: "Essential" },
      { skill: "vuex", confidence: "medium", reason: "State management for Vue" },
      { skill: "vue router", confidence: "medium", reason: "Official routing solution" },
    ],
    niceToHave: [
      { skill: "nuxt.js", confidence: "high", reason: "Vue meta-framework" },
      { skill: "pinia", confidence: "medium", reason: "Modern Vue state management" },
      { skill: "jest", confidence: "medium", reason: "Testing" },
    ],
  },

  // Node / Backend
  node: {
    mandatory: [
      { skill: "node.js", confidence: "high", reason: "Core runtime" },
      { skill: "javascript", confidence: "high", reason: "Foundational" },
    ],
    mustHave: [
      { skill: "typescript", confidence: "high", reason: "Industry standard" },
      { skill: "express.js", confidence: "high", reason: "Most popular Node framework" },
      { skill: "rest apis", confidence: "high", reason: "Standard API approach" },
      { skill: "postgresql", confidence: "high", reason: "Primary relational DB" },
      { skill: "git", confidence: "high", reason: "Version control" },
    ],
    niceToHave: [
      { skill: "docker", confidence: "high", reason: "Containerisation" },
      { skill: "redis", confidence: "medium", reason: "Caching layer" },
      { skill: "graphql", confidence: "medium", reason: "Modern API approach" },
      { skill: "aws", confidence: "medium", reason: "Cloud deployment" },
      { skill: "jest", confidence: "medium", reason: "Testing" },
      { skill: "kafka", confidence: "medium", reason: "Message broker" },
      { skill: "mongodb", confidence: "medium", reason: "NoSQL option" },
    ],
  },

  // Python / Data
  python: {
    mandatory: [
      { skill: "python", confidence: "high", reason: "Core language" },
    ],
    mustHave: [
      { skill: "sql", confidence: "high", reason: "Data querying" },
      { skill: "pandas", confidence: "high", reason: "Core data library" },
      { skill: "numpy", confidence: "high", reason: "Numerical computing" },
      { skill: "git", confidence: "high", reason: "Version control" },
    ],
    niceToHave: [
      { skill: "scikit-learn", confidence: "medium", reason: "ML library" },
      { skill: "tensorflow", confidence: "medium", reason: "Deep learning" },
      { skill: "pytorch", confidence: "medium", reason: "Deep learning" },
      { skill: "docker", confidence: "medium", reason: "Containerisation" },
      { skill: "fastapi", confidence: "medium", reason: "Modern Python API framework" },
      { skill: "airflow", confidence: "medium", reason: "Workflow orchestration" },
      { skill: "spark", confidence: "medium", reason: "Big data processing" },
    ],
  },

  // DevOps
  devops: {
    mandatory: [
      { skill: "docker", confidence: "high", reason: "Core containerisation skill" },
      { skill: "kubernetes", confidence: "high", reason: "Container orchestration" },
      { skill: "linux", confidence: "high", reason: "Essential for DevOps" },
    ],
    mustHave: [
      { skill: "ci/cd", confidence: "high", reason: "Core DevOps practice" },
      { skill: "terraform", confidence: "high", reason: "Infrastructure as code" },
      { skill: "aws", confidence: "high", reason: "Leading cloud platform" },
      { skill: "git", confidence: "high", reason: "Version control" },
      { skill: "bash scripting", confidence: "high", reason: "Automation" },
    ],
    niceToHave: [
      { skill: "ansible", confidence: "medium", reason: "Configuration management" },
      { skill: "prometheus", confidence: "medium", reason: "Monitoring" },
      { skill: "grafana", confidence: "medium", reason: "Dashboards" },
      { skill: "jenkins", confidence: "medium", reason: "CI/CD tool" },
      { skill: "github actions", confidence: "medium", reason: "CI/CD tool" },
      { skill: "helm", confidence: "medium", reason: "Kubernetes package manager" },
    ],
  },

  // Mobile
  mobile: {
    mandatory: [
      { skill: "react native", confidence: "high", reason: "Cross-platform mobile framework" },
    ],
    mustHave: [
      { skill: "javascript", confidence: "high", reason: "Foundational" },
      { skill: "typescript", confidence: "high", reason: "Industry standard" },
      { skill: "ios development", confidence: "medium", reason: "Platform target" },
      { skill: "android development", confidence: "medium", reason: "Platform target" },
      { skill: "rest apis", confidence: "high", reason: "Backend integration" },
    ],
    niceToHave: [
      { skill: "expo", confidence: "high", reason: "React Native toolchain" },
      { skill: "redux", confidence: "medium", reason: "State management" },
      { skill: "firebase", confidence: "medium", reason: "Backend services" },
      { skill: "jest", confidence: "medium", reason: "Testing" },
    ],
  },

  // Fullstack
  fullstack: {
    mandatory: [
      { skill: "javascript", confidence: "high", reason: "Core language for fullstack" },
      { skill: "node.js", confidence: "high", reason: "Backend runtime" },
    ],
    mustHave: [
      { skill: "react", confidence: "high", reason: "Most popular frontend framework" },
      { skill: "typescript", confidence: "high", reason: "Industry standard" },
      { skill: "rest apis", confidence: "high", reason: "API design" },
      { skill: "postgresql", confidence: "high", reason: "Relational DB" },
      { skill: "git", confidence: "high", reason: "Version control" },
    ],
    niceToHave: [
      { skill: "docker", confidence: "high", reason: "Containerisation" },
      { skill: "aws", confidence: "medium", reason: "Cloud deployment" },
      { skill: "graphql", confidence: "medium", reason: "Modern API" },
      { skill: "redis", confidence: "medium", reason: "Caching" },
      { skill: "next.js", confidence: "high", reason: "Fullstack React framework" },
    ],
  },
};

const NON_TECHNICAL_SUGGESTIONS: SuggestionMap = {
  hr: {
    mandatory: [
      { skill: "recruitment", confidence: "high", reason: "Core HR function" },
      { skill: "employee relations", confidence: "high", reason: "Core HR function" },
    ],
    mustHave: [
      { skill: "hris", confidence: "high", reason: "HR system management" },
      { skill: "onboarding", confidence: "high", reason: "Standard HR process" },
      { skill: "performance management", confidence: "high", reason: "Core HR function" },
      { skill: "labour law", confidence: "high", reason: "Compliance requirement" },
    ],
    niceToHave: [
      { skill: "workday", confidence: "medium", reason: "Popular HRIS platform" },
      { skill: "talent acquisition", confidence: "medium", reason: "Specialised function" },
      { skill: "learning & development", confidence: "medium", reason: "Training function" },
      { skill: "compensation & benefits", confidence: "medium", reason: "Total rewards" },
    ],
  },
  finance: {
    mandatory: [
      { skill: "financial analysis", confidence: "high", reason: "Core finance skill" },
      { skill: "excel", confidence: "high", reason: "Essential finance tool" },
    ],
    mustHave: [
      { skill: "accounting", confidence: "high", reason: "Financial fundamentals" },
      { skill: "budgeting", confidence: "high", reason: "Core planning skill" },
      { skill: "financial modelling", confidence: "high", reason: "Analysis requirement" },
      { skill: "erp", confidence: "medium", reason: "Enterprise systems" },
    ],
    niceToHave: [
      { skill: "sap", confidence: "medium", reason: "Common ERP platform" },
      { skill: "power bi", confidence: "medium", reason: "Data visualisation" },
      { skill: "tableau", confidence: "medium", reason: "Data visualisation" },
      { skill: "sql", confidence: "medium", reason: "Data querying" },
    ],
  },
  marketing: {
    mandatory: [
      { skill: "digital marketing", confidence: "high", reason: "Core discipline" },
      { skill: "google analytics", confidence: "high", reason: "Measurement foundation" },
    ],
    mustHave: [
      { skill: "seo", confidence: "high", reason: "Organic growth" },
      { skill: "content marketing", confidence: "high", reason: "Core channel" },
      { skill: "social media marketing", confidence: "high", reason: "Core channel" },
      { skill: "email marketing", confidence: "high", reason: "Core channel" },
    ],
    niceToHave: [
      { skill: "hubspot", confidence: "medium", reason: "CRM & automation" },
      { skill: "paid ads", confidence: "medium", reason: "Performance marketing" },
      { skill: "copywriting", confidence: "medium", reason: "Content creation" },
      { skill: "figma", confidence: "medium", reason: "Design collaboration" },
    ],
  },
};


function getSuggestionKey(title: string, roleType: RoleType): string | null {
  const t = title.toLowerCase();

  if (roleType === "technical") {
    if (t.includes("react") || t.includes("frontend") || t.includes("front-end") || t.includes("front end")) return "react";
    if (t.includes("angular")) return "angular";
    if (t.includes("vue")) return "vue";
    if (t.includes("node") || t.includes("backend") || t.includes("back-end")) return "node";
    if (t.includes("python") || t.includes("data") || t.includes("ml") || t.includes("machine learning")) return "python";
    if (t.includes("devops") || t.includes("sre") || t.includes("infrastructure") || t.includes("platform")) return "devops";
    if (t.includes("mobile") || t.includes("ios") || t.includes("android")) return "mobile";
    if (t.includes("fullstack") || t.includes("full stack") || t.includes("full-stack")) return "fullstack";
    // Default tech
    return "fullstack";
  }

  if (roleType === "non-technical") {
    if (t.includes("hr") || t.includes("human resource") || t.includes("people") || t.includes("talent") || t.includes("recruit")) return "hr";
    if (t.includes("finance") || t.includes("accounting") || t.includes("financial") || t.includes("analyst")) return "finance";
    if (t.includes("market") || t.includes("growth") || t.includes("brand") || t.includes("content")) return "marketing";
  }

  return null;
}

// Main export
export function getSkillSuggestions(
  jobTitle: string,
  roleType: RoleType,
  existingSkills: string[] = []
): SkillSuggestions {
  const key = getSuggestionKey(jobTitle, roleType);
  const map = roleType === "non-technical" ? NON_TECHNICAL_SUGGESTIONS : TECHNICAL_SUGGESTIONS;
  const suggestions = key ? map[key] : null;

  if (!suggestions) {
    return { mandatory: [], mustHave: [], niceToHave: [] };
  }

  const existing = new Set(existingSkills.map(s => s.toLowerCase()));

  const filter = (items: SkillSuggestion[]) =>
    items.filter(s => !existing.has(s.skill.toLowerCase()));

  return {
    mandatory: filter(suggestions.mandatory),
    mustHave: filter(suggestions.mustHave),
    niceToHave: filter(suggestions.niceToHave),
  };
}
