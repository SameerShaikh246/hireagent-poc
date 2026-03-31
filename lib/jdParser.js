import { model } from "./gemini";

export async function parseJD(jdText) {
  const prompt = `
  Extract structured JSON:
  {
    "requiredSkills": [],
    "goodToHave": [],
    "minExperience": number
  }

  Job Description:
  ${jdText}

  Return ONLY JSON.
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response.text();

  return JSON.parse(response);
}