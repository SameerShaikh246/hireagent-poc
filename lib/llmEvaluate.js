import { model } from "./gemini";

export async function llmEvaluate(candidate, jd) {
  const prompt = `
You are an expert HR recruiter.

Evaluate the candidate against the job description.

Candidate:
${JSON.stringify(candidate)}

Job Description:
${JSON.stringify(jd)}

Return ONLY JSON:
{
  "score": number (0-10),
  "justification": "2-3 lines explaining fit"
}
`;

  try {
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    return JSON.parse(text);
  } catch (err) {
    return {
      score: 5,
      justification: "Fallback evaluation due to parsing error"
    };
  }
}