// ── Leaderboard Snapshots Edge Function ────────────────────
// Returns leaderboard snapshots for a server. Works around PostgREST anon bug.
// Deploy: supabase functions deploy get-snapshots --no-verify-jwt
// @ts-nocheck -- Deno edge function, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { server_id, snapshot_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (snapshot_id) {
      // Fetch single snapshot by ID
      const { data, error } = await supabase
        .from("leaderboard_snapshots")
        .select("*")
        .eq("id", snapshot_id)
        .eq("server_id", server_id)
        .single();

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    // List snapshots for server
    if (!server_id) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const { data, error } = await supabase
      .from("leaderboard_snapshots")
      .select("id, finalized_at, period_start, period, rankings")
      .eq("server_id", server_id)
      .order("finalized_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const mapped = (data || []).map((row: any) => {
      const rankings = Array.isArray(row.rankings) ? row.rankings : [];
      const top = rankings[0];
      return {
        id: row.id,
        finalized_at: row.finalized_at,
        period_start: row.period_start ?? undefined,
        period: row.period,
        ranking_count: rankings.length,
        top_name: top?.memberName ?? top?.member_name ?? undefined,
        top_points: top?.points ?? undefined,
      };
    });

    return new Response(JSON.stringify(mapped), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
