interface GroqOptions {
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export async function groqGenerate(prompt: string, options: GroqOptions): Promise<string> {
  const {
    apiKey,
    maxTokens = 1000,
    temperature = 0.1,
    model = "llama-3.3-70b-versatile",
  } = options;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
} 