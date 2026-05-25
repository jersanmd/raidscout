// Vercel Edge Function — handles Discord PING and relays commands to Supabase
export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  const body = await request.text();

  let data: any;
  try { data = JSON.parse(body); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Discord PING — respond immediately
  if (data.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // Forward to Supabase
  const supabaseUrl = "https://oeugehqgpodzhagomeex.supabase.co/functions/v1/discord-bot";
  try {
    const res = await fetch(supabaseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": request.headers.get("x-signature-ed25519") || "",
        "x-signature-timestamp": request.headers.get("x-signature-timestamp") || "",
      },
      body,
    });
    const resBody = await res.text();
    return new Response(resBody, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ type: 4, data: { content: "Service temporarily unavailable.", flags: 64 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
