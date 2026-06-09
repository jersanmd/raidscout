// ── Admin Impersonate Edge Function ─────────────────────────
// Allows admin to join/leave a server as owner to see the exact same view.
// Deploy: supabase functions deploy admin-impersonate --no-verify-jwt
// @ts-nocheck -- Deno edge function

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
    const { user_id, server_id, action } = await req.json();

    if (!user_id || !server_id || !action) {
      return new Response(
        JSON.stringify({ error: "Missing user_id, server_id, or action" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "join") {
      // Add admin as owner of the server
      const { error } = await supabase
        .from("server_members")
        .upsert({
          user_id,
          server_id,
          role: "owner",
        }, { onConflict: "user_id, server_id" });

      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, action: "joined" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (action === "leave") {
      // Remove admin from server
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("user_id", user_id)
        .eq("server_id", server_id);

      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, action: "left" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (action === "cleanup") {
      // Remove admin from ALL servers (call on app load to clean stale entries)
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("user_id", user_id)
        .not("server_id", "is", null); // delete all

      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, action: "cleaned" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
