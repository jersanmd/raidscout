// Vercel serverless function — relays Discord interactions to Supabase edge function.
// Workaround for Discord ↔ Supabase endpoint verification issues.
export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const body = await req.text();

  // Discord PING verification — respond directly
  try {
    const data = JSON.parse(body);
    if (data.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Forward all other interactions to Supabase
  const supabaseUrl = "https://oeugehqgpodzhagomeex.supabase.co/functions/v1/discord-bot";
  const res = await fetch(supabaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-Ed25519": req.headers.get("X-Signature-Ed25519") || "",
      "X-Signature-Timestamp": req.headers.get("X-Signature-Timestamp") || "",
    },
    body,
  });

  const resBody = await res.text();
  return new Response(resBody, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };
