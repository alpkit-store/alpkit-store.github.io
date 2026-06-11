export const CATEGORIES = ["Shopify", "Khaos Control", "Operations & monitoring", "Marketing & members", "Utilities"];

const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4.1-mini";
const README_CHAR_LIMIT = 24000;

const SYSTEM_PROMPT = `You write plain-English summaries of internal software tools for non-technical retail company staff.
Respond with ONLY a JSON object: {"summary": "...", "category": "..."}.
- "summary": 2-3 sentences covering what the tool does, who would use it, and what problem it solves. No jargon, no URLs, no hostnames, no credentials, no installation details.
- "category": exactly one of: ${CATEGORIES.join(", ")}.`;

export async function generateSummary(repo, readme, token, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Repo name: ${repo.name}\nDescription: ${repo.description}\n\nREADME:\n${readme.slice(0, README_CHAR_LIMIT)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Models API failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Models response contained no JSON: ${text.slice(0, 200)}`);
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error(`Models response contained invalid JSON: ${text.slice(0, 200)}`);
  }
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) throw new Error("Summary missing in model response");
  return {
    summary: parsed.summary.trim(),
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "Utilities",
  };
}
