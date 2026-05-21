/**
 * AI Vision — extract player names from rally screenshots.
 *
 * Supports multiple providers. Configure in .env.local:
 *   VITE_AI_PROVIDER=openai|deepseek    (default: openai)
 *   VITE_AI_API_KEY=sk-...
 *
 * DeepSeek's deepseek-chat is text-only (no vision).
 * For image analysis, use OpenAI (gpt-4o-mini) — ~$0.15/1M input tokens.
 */

const PROVIDER = (import.meta.env.VITE_AI_PROVIDER as string) || "openai";
const API_KEY = import.meta.env.VITE_AI_API_KEY as string | undefined;

interface AIResponse {
  choices: { message: { content: string } }[];
}

/**
 * Send a rally screenshot to an AI vision model and get back a list of player names.
 */
export async function extractNamesWithAI(file: File): Promise<string[]> {
  if (!API_KEY || API_KEY.startsWith("your-") || API_KEY.startsWith("sk-your-")) {
    throw new Error(
      "AI API key not configured. Add VITE_AI_API_KEY to .env.local"
    );
  }

  const base64 = await fileToBase64(file);

  const prompt =
    "Extract every player username / character name visible in this game screenshot. " +
    "Return ONLY a JSON array of strings, like: [\"DonAlas\",\"xSupladoo\"]\n" +
    "Rules:\n" +
    "- Include ALL visible player names, no matter how styled or colored\n" +
    "- Preserve exact casing, special characters (ツ, ッ, etc.), and numbers\n" +
    "- Ignore UI labels like 'Members', 'Online', 'Points', timestamps, level numbers, row numbers\n" +
    "- Do NOT include any explanation, just the JSON array\n" +
    "- If no names are visible, return empty array: []";

  if (PROVIDER === "openai") {
    return callOpenAI(base64, prompt);
  } else if (PROVIDER === "deepseek") {
    return callDeepSeek(file, prompt);
  }

  throw new Error(`Unknown AI provider: ${PROVIDER}. Use "openai" or "deepseek".`);
}

// ── OpenAI (GPT-4o mini — cheap, vision-capable) ────────────

async function callOpenAI(base64: string, prompt: string): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: base64, detail: "low" },
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data: AIResponse = await response.json();
  return parseAIResponse(data.choices[0]?.message?.content ?? "[]");
}

// ── DeepSeek (text-only — no vision, fallback) ──────────────

async function callDeepSeek(file: File, _prompt: string): Promise<string[]> {
  // deepseek-chat is text-only — we can't send images.
  // Use the file metadata to give a helpful error rather than a cryptic 400.
  throw new Error(
    "DeepSeek's deepseek-chat model does not support image analysis. " +
      "Set VITE_AI_PROVIDER=openai in .env.local and use an OpenAI API key instead.\n" +
      "OpenAI's gpt-4o-mini costs ~$0.15 per million input tokens — very affordable."
  );
}

/**
 * Parse the AI's JSON array response into a string array.
 * Handles cases where the AI wraps the JSON in markdown code fences.
 */
function parseAIResponse(content: string): string[] {
  // Strip markdown code fences if present
  let json = content.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((s) => s.trim());
    }
  } catch {
    // Fallback: try to extract anything that looks like quoted strings
    const matches = content.match(/"([^"]+)"/g);
    if (matches) {
      return matches.map((m) => m.replace(/^"|"$/g, "").trim()).filter(Boolean);
    }
  }

  return [];
}

/** Convert a File to a base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
