/**
 * AI Vision — extract player names from rally screenshots.
 *
 * Calls the Supabase ai-vision Edge Function which proxies OpenAI.
 * The API key is stored as a Supabase secret (OPENAI_API_KEY) —
 * it never touches the browser or the client bundle.
 *
 * Setup: supabase secrets set OPENAI_API_KEY=sk-...
 *        supabase functions deploy ai-vision
 */

/**
 * Send a rally screenshot to the ai-vision Edge Function and get back
 * a list of detected player names.
 */
export async function extractNamesWithAI(file: File): Promise<string[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase URL not configured.");
  }

  const base64 = await fileToBase64(file);

  const functionUrl = `${supabaseUrl}/functions/v1/ai-vision`;
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64 }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || `AI scan failed (${response.status})`
    );
  }

  return data.names ?? [];
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
