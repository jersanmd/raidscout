import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    const body = req.body;

    // Discord PING verification
    if (body?.type === 1) {
      return res.status(200).json({ type: 1 });
    }

    // Forward to Supabase
    try {
      const fetchRes = await fetch("https://oeugehqgpodzhagomeex.supabase.co/functions/v1/discord-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await fetchRes.json();
      return res.status(fetchRes.status).json(data);
    } catch {
      return res.status(200).json({ type: 4, data: { content: "Service unavailable.", flags: 64 } });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
