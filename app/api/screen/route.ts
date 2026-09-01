import type {
  CandidateResult,
  ScreeningResponse,
  RoleType,
  EducationLevel,
} from "@/types";
import { NextRequest, NextResponse } from "next/server";
import parseAgent from "@/lib/parsers/parseResume";
import { jdIntelligenceAgent } from "@/lib/agents/jdIntelligenceAgent";
import { scoreAgent } from "@/lib/agents/scoreAgent";
import { justifyAgent } from "@/lib/agents/justifyAgent";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const jd = formData.get("jobDescription") as string;
    const apiKey = formData.get("apiKey") as string;
    const files = formData.getAll("resumes") as File[];
    const jdMode = (formData.get("jdMode") as string) ?? "freetext";
    const roleType: RoleType =
      (formData.get("roleType") as RoleType) ?? "technical";
    const educationRequired: EducationLevel =
      (formData.get("educationRequired") as EducationLevel) ?? "bachelor";
    const experienceMin = parseInt(
      (formData.get("experienceMin") as string) ?? "3",
      10,
    );
    const ruleBlend = parseFloat(
      (formData.get("ruleBlend") as string) ?? "0.4",
    );

    let mandatorySkills: string[] = [];
    const mandatoryRaw = formData.get("mandatorySkills") as string;
    if (mandatoryRaw) {
      try {
        mandatorySkills = JSON.parse(mandatoryRaw);
      } catch (err: unknown) {
        console.error("Mandatory skills error:", err);
      }
    }

    // Validation
    if (!jd || jd.trim().length < 20)
      return NextResponse.json(
        { error: "Job description is too short." },
        { status: 400 },
      );
    if (!apiKey || apiKey.trim().length < 10)
      return NextResponse.json(
        { error: "Groq API key is required." },
        { status: 400 },
      );
    if (!files || files.length === 0)
      return NextResponse.json(
        { error: "No resume files uploaded." },
        { status: 400 },
      );

    // Structured JD input
    let structuredInput = null;
    if (jdMode === "structured") {
      try {
        structuredInput = {
          title: (formData.get("title") as string) ?? "",
          roleType,
          mandatorySkills,
          mustHaveSkills: JSON.parse(
            (formData.get("mustHaveSkills") as string) ?? "[]",
          ),
          niceToHaveSkills: JSON.parse(
            (formData.get("niceToHaveSkills") as string) ?? "[]",
          ),
          experienceRange: {
            min: experienceMin,
            max: parseInt((formData.get("experienceMax") as string) ?? "6", 10),
          },
          educationRequired,
          responsibilities: (formData.get("responsibilities") as string) ?? "",
        };
      } catch {
        structuredInput = null;
      }
    }

    // JD Intelligence Agent
    const jdIntelligence = await jdIntelligenceAgent(
      jd,
      structuredInput,
      apiKey,
    );

    const mustHaveSkills =
      jdIntelligence.mustHaveSkills.length > 0
        ? jdIntelligence.mustHaveSkills
        : (structuredInput?.mustHaveSkills ?? []);
    const niceToHaveSkills = jdIntelligence.niceToHaveSkills;
    const correctedRoleType = jdIntelligence.roleType;
    const correctedExpMin = jdIntelligence.correctedExperienceRange.min;

    // NOTE: mandatory skills are NOT passed to jdIntelligenceAgent for correction —
    // they are the recruiter's hard business rule and should not be auto-modified.

    // Parse all resumes in parallel
    const parsedResumes = await Promise.all(files.map((f) => parseAgent(f)));

    // Duplicate detection
    const seenHashes = new Map<string, string>();
    const duplicateFlags = parsedResumes.map((r, i) => {
      const hash = r.contentHash ?? "";
      if (hash && seenHashes.has(hash)) {
        return { isDuplicate: true, duplicateOf: seenHashes.get(hash)! };
      }
      seenHashes.set(hash, `candidate-${i + 1}`);
      return { isDuplicate: false, duplicateOf: undefined };
    });

    // Score all candidates (mandatory filter applied inside scoreAgent)
    const allCandidates: CandidateResult[] = [];

    for (let i = 0; i < parsedResumes.length; i++) {
      const parsed = parsedResumes[i];
      const dupFlag = duplicateFlags[i];

      const ruleScore = scoreAgent(
        parsed,
        mandatorySkills,
        mustHaveSkills,
        jd,
        correctedExpMin,
      );

      // Disqualified candidates skip the AI justify step (saves API calls + cost)
      let aiAssessment;
      if (ruleScore.disqualified) {
        aiAssessment = {
          roleFitScore: 0,
          overallScore: 0,
          strengths: ruleScore.matchedSkills.slice(0, 3).map((s) => `Has ${s}`),
          gaps: ruleScore.missingMandatorySkills.map(
            (s) => `Missing mandatory skill: ${s}`,
          ),
          explanation: `Automatically disqualified: missing mandatory skill${ruleScore.missingMandatorySkills.length > 1 ? "s" : ""} — ${ruleScore.missingMandatorySkills.join(", ")}.`,
          whySelect: "",
          whyNotSelect: `Missing non-negotiable skill${ruleScore.missingMandatorySkills.length > 1 ? "s" : ""}: ${ruleScore.missingMandatorySkills.join(", ")}.`,
          recommendation: "No" as const,
          alternateRoles: [],
        };
      } else {
        aiAssessment = await justifyAgent(
          parsed,
          ruleScore,
          jd,
          mustHaveSkills,
          niceToHaveSkills,
          correctedRoleType,
          apiKey,
        );
      }
      // With ruleBlend = 0.4, finalScore is 40% rule-based, 60% AI.
      const overallScore = ruleScore.disqualified
        ? 0
        : Math.round(
            ruleScore.total * ruleBlend +
              aiAssessment.roleFitScore * (1 - ruleBlend),
          );
      aiAssessment.overallScore = overallScore;

      allCandidates.push({
        id: `candidate-${i + 1}`,
        fileName: parsed.fileName,
        contentHash: parsed.contentHash,
        isDuplicate: dupFlag.isDuplicate,
        duplicateOf: dupFlag.duplicateOf,
        ruleScore,
        aiAssessment,
        finalScore: overallScore,
        rank: 0,
        jdUsed: jdIntelligence.changes.length > 0 ? "corrected" : "original",
      });
    }

    // Split qualified vs disqualified
    const qualifiedCandidates = allCandidates.filter(
      (c) => !c.ruleScore.disqualified,
    );
    const disqualifiedCandidates = allCandidates.filter(
      (c) => c.ruleScore.disqualified,
    );

    // Rank qualified candidates only
    qualifiedCandidates.sort((a, b) => b.finalScore - a.finalScore);
    qualifiedCandidates.forEach((c, i) => {
      c.rank = i + 1;
    });

    // Disqualified get ranks starting after qualified
    disqualifiedCandidates.forEach((c, i) => {
      c.rank = qualifiedCandidates.length + i + 1;
    });

    const duplicatesFound = duplicateFlags.filter((d) => d.isDuplicate).length;

    const response: ScreeningResponse = {
      candidates: qualifiedCandidates,
      disqualifiedCandidates,
      jdIntelligence,
      processedAt: new Date().toISOString(),
      totalResumes: files.length,
      duplicatesFound,
      ruleBlend,
      mandatorySkills,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("Screening error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Screening failed: ${message}` },
      { status: 500 },
    );
  }
}
