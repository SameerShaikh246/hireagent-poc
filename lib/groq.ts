import OpenAI from "openai";

export function createGroqClient(apiKey?: string) {
  const key = apiKey?.trim() || process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error("Groq API key is required (formData or env).");
  }

  return new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: key,
  });
}

export async function groqGenerate(
  prompt: string,
  options?: {
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }
): Promise<string> {
  const client = createGroqClient(options?.apiKey);

  const result = await client.chat.completions.create({
    model: options?.model || "llama-3.3-70b-versatile",
    max_tokens: options?.maxTokens ?? 1000,
    temperature: options?.temperature ?? 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  return result.choices[0]?.message?.content?.trim() ?? "";
}