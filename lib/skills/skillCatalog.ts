export const SKILL_ALIASES: Record<string, string[]> = {
    javascript: ["javascript", "js", "ecmascript", "es6", "es2015"],
    typescript: ["typescript", "ts"],
    react: ["react", "reactjs", "react js"],
    "react native": ["react native"],
    nextjs: ["next", "next.js", "nextjs", "next js"],
    nodejs: ["node", "node.js", "nodejs", "node js"],
    express: ["expressjs", "express js"],
    html: ["html", "html5"],
    css: ["css", "css3", "scss", "sass"],
    tailwind: ["tailwind", "tailwindcss"],
    bootstrap: ["bootstrap"],
    jquery: ["jquery"],
    redux: ["redux", "redux toolkit"],
    graphql: ["graphql", "gql"],
    angular: ["angular", "angularjs"],
    vue: ["vue", "vuejs", "vue.js"],
    python: ["python", "python3"],
    django: ["django", "django rest framework", "drf"],
    flask: ["flask"],
    fastapi: ["fastapi"],
    celery: ["celery"],
    pandas: ["pandas"],
    numpy: ["numpy"],
    java: ["java", "java8", "java11"],
    "spring boot": ["spring boot", "springboot"],
    kotlin: ["kotlin"],
    swift: ["swift"],
    flutter: ["flutter"],
    php: ["php"],
    laravel: ["laravel"],
    golang: ["golang"],
    "ruby on rails": ["rails", "ruby on rails"],
    dotnet: ["dotnet", "aspnet", "net core", "dotnet core"],
    sql: ["sql"],
    mysql: ["mysql"],
    mssql: ["mssql", "ms sql", "sql server", "microsoft sql server"],
    postgresql: ["postgresql", "postgres", "psql"],
    mongodb: ["mongodb", "mongo"],
    redis: ["redis"],
    elasticsearch: ["elasticsearch", "elastic search"],
    dynamodb: ["dynamodb"],
    firebase: ["firebase"],
    aws: ["aws", "amazon web services"],
    azure: ["azure"],
    gcp: ["gcp", "google cloud"],
    docker: ["docker", "containerization"],
    kubernetes: ["kubernetes", "k8s"],
    terraform: ["terraform"],
    jenkins: ["jenkins"],
    "ci/cd": ["ci cd"],
    git: ["git", "github", "gitlab"],
    linux: ["linux"],
    kafka: ["kafka"],
    rabbitmq: ["rabbitmq"],
    microservices: ["microservices", "microservice"],
    "rest api": ["rest api", "rest apis", "restful api", "restful apis", "restful"],
    selenium: ["selenium", "selenium webdriver"],
    cypress: ["cypress"],
    playwright: ["playwright"],
    jest: ["jest", "testing library"],
    tensorflow: ["tensorflow", "tf"],
    pytorch: ["pytorch", "torch"],
    "scikit learn": ["scikit learn", "sklearn"],
    nlp: ["nlp", "natural language processing"],
    "machine learning": ["machine learning", "ml", "deep learning"],
    tableau: ["tableau"],
    "power bi": ["power bi", "powerbi"],
};


/** Canonical name for known skills; lowercase tidy-up for unknown ones ("c++" stays "c++"). */
export function toStoredSkill(skill: string): string {
    const c = canonicalSkill(skill);
    return c in SKILL_ALIASES ? c : skill.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Keep only skills that actually appear in the profile text, as canonical names. */
export function verifySkillsAgainstText(skills: string[], text: string, max = 25): string[] {
    const padded = ` ${normalize(text)} `;
    const out = new Set<string>();
    for (const raw of skills) {
        const s = toStoredSkill(String(raw));
        if (!s || s.length > 40) continue;
        if (aliasesFor(s).some((a) => a.length > 1 && padded.includes(` ${a} `))) out.add(s);
        if (out.size >= max) break;
    }
    return [...out];
}

// Too short or too generic to trust when scanning free text.
const AMBIGUOUS = new Set(["js", "ts", "tf", "ml", "next", "torch", "github", "gitlab", "drf"]);

export function normalize(s: string): string {
    return s.toLowerCase().replace(/[.\-_/]+/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function aliasesFor(skill: string): string[] {
    const norm = normalize(skill);
    for (const [canonical, variants] of Object.entries(SKILL_ALIASES)) {
        if (variants.some((v) => normalize(v) === norm) || normalize(canonical) === norm) {
            return [...new Set(variants.map(normalize).concat(normalize(canonical)))];
        }
    }
    return [norm];
}

export function canonicalSkill(skill: string): string {
    const norm = normalize(skill);
    for (const [canonical, variants] of Object.entries(SKILL_ALIASES)) {
        if (variants.some((v) => normalize(v) === norm) || normalize(canonical) === norm) return canonical;
    }
    return norm;
}

export function matchSkillsInText(text: string, skills: string[]): string[] {
    const padded = ` ${normalize(text)} `;
    const seen = new Set<string>();
    for (const skill of skills) {
        if (aliasesFor(skill).some((alias) => padded.includes(` ${alias} `))) seen.add(canonicalSkill(skill));
    }
    return [...seen];
}

/** Every catalog skill found in a profile's own text (not limited to the current JD). */
export function extractAllSkills(text: string): string[] {
    if (!text) return [];
    // LinkedIn pages end with feed / "people also viewed" noise that names other people's skills.
    const own = text.split(/##\s*(?:Recent Activity|Activity|People Also Viewed|Publications)/i)[0];
    const padded = ` ${normalize(own)} `;
    const found = new Set<string>();
    for (const [canonical, variants] of Object.entries(SKILL_ALIASES)) {
        const names = [canonical, ...variants].map(normalize);
        if (names.some((a) => a.length > 1 && !AMBIGUOUS.has(a) && padded.includes(` ${a} `))) found.add(canonical);
    }
    return [...found];
}