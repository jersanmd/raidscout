// ── Attendance Records Edge Function ────────────────────────
// Returns attendance_records for given death IDs. Works around PostgREST anon filtering bug.
// Deploy: supabase functions deploy get-attendance --no-verify-jwt
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
    const { death_record_ids } = await req.json();
    if (!death_record_ids || !Array.isArray(death_record_ids) || death_record_ids.length === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Paginate — PostgREST defaults to 1,000 rows max
    const allData: any[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .in("death_record_id", death_record_ids)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      if (!data?.length) break;
      allData.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    return new Response(JSON.stringify(allData), {
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
