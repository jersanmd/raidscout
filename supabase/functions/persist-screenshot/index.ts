// ── Persist Screenshot Edge Function ────────────────────────
// Downloads a Discord attachment and uploads to Supabase Storage.
// Called by the bot when processing CP update commands.
//
// Deploy: supabase functions deploy persist-screenshot
// Secrets required: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { attachment_url, guild_id, member_id } = await req.json();

    if (!attachment_url || !guild_id || !member_id) {
      return new Response(JSON.stringify({ error: "Missing attachment_url, guild_id, or member_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "DISCORD_BOT_TOKEN not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 1. Download the file from Discord
    console.log(`[persist-screenshot] Downloading from Discord: ${attachment_url}`);
    const dlRes = await fetch(attachment_url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!dlRes.ok) {
      return new Response(JSON.stringify({ error: `Discord download failed: ${dlRes.status}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const blob = await dlRes.blob();
    const contentType = dlRes.headers.get("content-type") || "image/png";

    // Determine file extension
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[contentType] || "png";

    // 2. Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const timestamp = Math.floor(Date.now() / 1000);
    const storagePath = `${guild_id}/${member_id}/${timestamp}.${ext}`;

    console.log(`[persist-screenshot] Uploading to cp-screenshots/${storagePath}`);
    const { error: uploadErr } = await supabase.storage
      .from("cp-screenshots")
      .upload(storagePath, blob, {
        contentType,
        upsert: true,
      });

    if (uploadErr) {
      return new Response(JSON.stringify({ error: "Storage upload failed", detail: uploadErr.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3. Generate public URL
    const { data: urlData } = supabase.storage
      .from("cp-screenshots")
      .getPublicUrl(storagePath);

    console.log(`[persist-screenshot] Done: ${urlData.publicUrl}`);

    return new Response(JSON.stringify({
      ok: true,
      url: urlData.publicUrl,
      path: storagePath,
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
