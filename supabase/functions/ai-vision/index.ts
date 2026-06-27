// ── AI Vision Edge Function ────────────────────────────────
// Proxies OpenAI vision API calls so the API key stays in Supabase,
// never exposed to the browser.
//
// Set the secret: supabase secrets set OPENAI_API_KEY=sk-...
// Deploy:           supabase functions deploy ai-vision
// @ts-nocheck -- Deno edge function, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://www.raidscout.com",
  "https://raidscout-staging.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

interface AIResponse {
  choices: { message: { content: string } }[];
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate base64 size — reject images larger than 10MB
    const base64Size = typeof imageBase64 === "string" ? imageBase64.length : 0;
    const MAX_BASE64_LENGTH = 14_000_000; // ~10MB raw -> ~13.3MB base64
    if (base64Size > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Image too large. Maximum 10MB allowed." }),
        { status: 413, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Read the OpenAI API key from edge function secret
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey || apiKey.startsWith("sk-your-")) {
      return new Response(
        JSON.stringify({
          error:
            "OpenAI API key not configured. Run: supabase secrets set OPENAI_API_KEY=sk-...",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Call OpenAI vision API
    const prompt =
      "Extract every player username / character name visible in this game screenshot. " +
      "Return ONLY a JSON array of strings, like: [\"DonAlas\",\"xSupladoo\"]\n" +
      "Rules:\n" +
      "- Include ALL visible player names, no matter how styled or colored\n" +
      "- Preserve exact casing, all Unicode characters (Chinese 中文, Korean 한국어, Japanese 日本語, Cyrillic, Arabic, emoji, etc.), and numbers\n" +
      "- Ignore UI labels like 'Members', 'Online', 'Points', timestamps, level numbers, row numbers\n" +
      "- Do NOT include any explanation, just the JSON array\n" +
      "- If no names are visible, return empty array: []";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: imageBase64, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0,
      }),
    });

    clearTimeout(timeout);

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error (${openaiRes.status}): ${errText}` }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const data: AIResponse = await openaiRes.json();
    const content = data.choices[0]?.message?.content ?? "[]";

    // Parse the response
    const names = parseNames(content);

    return new Response(JSON.stringify({ names }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

function parseNames(content: string): string[] {
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
    const matches = content.match(/"([^"]+)"/g);
    if (matches) {
      return matches.map((m) => m.replace(/^"|"$/g, "").trim()).filter(Boolean);
    }
  }

  return [];
}
