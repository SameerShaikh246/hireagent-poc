import { model } from "./gemini";

export async function parseResume(text) {
  const prompt = `
  Extract structured JSON:
  {
    "name": "",
    "skills": [],
    "experience": number,
    "projects": []
  }

  Resume:
  ${text}

  Return ONLY JSON.
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response.text();

  return JSON.parse(response);
}