// ── Bot Proxy Edge Function ────────────────────────────────
// Proxies requests to the bot's HTTP API with the BOT_API_SECRET.
// Keeps the secret server-side — never exposed to the browser.
//
// Deploy: supabase functions deploy bot-proxy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://www.raidscout.com",
  "https://raidscout-staging.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const BOT_URL = Deno.env.get("BOT_SERVER_URL") || "https://raidscout-bot.fly.dev";
const BOT_API_SECRET = Deno.env.get("BOT_API_SECRET") || "";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/bot-proxy/, "");
    const query = url.search;

    // Whitelist allowed endpoints
    const allowedPaths = ["/status", "/logs", "/tick-metrics", "/health"];
    if (!allowedPaths.includes(path)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const botRes = await fetch(`${BOT_URL}${path}${query}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${BOT_API_SECRET}`,
        "Content-Type": "application/json",
      },
    });

    const body = await botRes.text();
    const isJson = botRes.headers.get("content-type")?.includes("json");

    return new Response(body, {
      status: botRes.status,
      headers: {
        ...(isJson ? { "Content-Type": "application/json" } : { "Content-Type": "text/plain" }),
        ...corsHeaders,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
