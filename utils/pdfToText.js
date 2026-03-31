export async function extractText(fileBuffer) {
  const pdf = (await import("pdf-parse")).default;

  const data = await pdf(fileBuffer);
  return data.text;
}