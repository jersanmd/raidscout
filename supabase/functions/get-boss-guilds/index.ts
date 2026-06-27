// ── Boss Guilds Edge Function ──────────────────────────────
// Returns boss_guilds for a server. Works around PostgREST anon filtering bug.
// Deploy: supabase functions deploy get-boss-guilds --no-verify-jwt
// @ts-nocheck -- Deno edge function, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { server_id } = await req.json();
    if (!server_id) {
      return new Response(
        JSON.stringify({ error: "Missing server_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get boss IDs for this server
    const { data: bosses, error: bossErr } = await supabase
      .from("bosses")
      .select("id")
      .eq("server_id", server_id);

    if (bossErr) throw bossErr;

    const bossIds = (bosses || []).map((b: any) => b.id);
    if (!bossIds.length) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch boss_guilds for those bosses
    const { data, error } = await supabase
      .from("boss_guilds")
      .select("*")
      .in("boss_id", bossIds)
      .or("sort_order.neq.-1,sort_order.is.null")
      .order("sort_order", { ascending: true })
      .order("day_of_week", { ascending: true });

    if (error) throw error;

    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
