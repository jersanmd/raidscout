/**
 * Cancel a PayPal subscription.
 * Called from the Billing Dashboard when the server owner cancels their plan.
 * Uses the PayPal REST API with the stored subscription ID.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_SECRET = Deno.env.get("PAYPAL_SECRET")!;

// Set PAYPAL_API_URL to sandbox for testing: "https://api-m.sandbox.paypal.com"
const PAYPAL_API = Deno.env.get("PAYPAL_API_URL") || "https://api-m.paypal.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getPayPalToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { server_id } = await req.json();
    if (!server_id) {
      return new Response(JSON.stringify({ error: "Missing server_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the PayPal subscription ID
    const { data: srv, error: fetchErr } = await supabase
      .from("servers")
      .select("paypal_subscription_id, owner_id")
      .eq("id", server_id)
      .single();

    if (fetchErr || !srv?.paypal_subscription_id) {
      return new Response(JSON.stringify({ error: "No active PayPal subscription found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Cancel the subscription in PayPal
    const token = await getPayPalToken();
    const cancelRes = await fetch(
      `${PAYPAL_API}/v1/billing/subscriptions/${srv.paypal_subscription_id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: "Cancelled by server owner from RaidScout dashboard" }),
      }
    );

    if (!cancelRes.ok) {
      const errData = await cancelRes.text();
      console.error("[cancel-subscription] PayPal cancel failed:", errData);
      return new Response(JSON.stringify({ error: "PayPal cancellation failed" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Clear the PayPal subscription ID from our DB (subscription won't renew)
    const { error: clearErr } = await supabase
      .from("servers")
      .update({ paypal_subscription_id: null })
      .eq("id", server_id);

    if (clearErr) {
      console.error("[cancel-subscription] Failed to clear subscription ID:", clearErr);
    }

    console.log(`[cancel-subscription] Cancelled subscription for server ${server_id}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[cancel-subscription] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
