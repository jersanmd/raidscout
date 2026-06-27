// ── Admin Impersonate Edge Function ─────────────────────────
// Allows admin to join/leave a server as owner to see the exact same view.
// Deploy: supabase functions deploy admin-impersonate
// @ts-nocheck -- Deno edge function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.raidscout.com",
  "https://raidscout-staging.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

serve(async (req: Request) => {
  const origin = getAllowedOrigin(req);
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify JWT from Authorization header ──────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const token = authHeader.slice(7);
    const authClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Verify admin role ────────────────────────────────
    const { data: roleData } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { user_id, server_id, action } = body;

    // Only allow the authenticated admin to operate on themselves
    if (user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "user_id must match the authenticated admin" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!server_id || !action) {
      return new Response(
        JSON.stringify({ error: "Missing server_id or action" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "join") {
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
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "leave") {
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("user_id", user_id)
        .eq("server_id", server_id);

      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, action: "left" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "cleanup") {
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("user_id", user_id)
        .not("server_id", "is", null);

      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, action: "cleaned" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
