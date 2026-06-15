/**
 * PayPal IPN (Instant Payment Notification) receiver.
 * 
 * Flow:
 * 1. PayPal POSTs IPN data to this endpoint
 * 2. We POST back to PayPal to verify (required by PayPal spec)
 * 3. If verified + payment_status = "Completed":
 *    - Parse custom field for server_id
 *    - Extend subscription_ends_at by the paid duration
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYPAL_VERIFY_URL = "https://ipnpb.paypal.com/cgi-bin/webscr"; // Live
// const PAYPAL_VERIFY_URL = "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr"; // Sandbox

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Read the raw body as URL-encoded form data (PayPal IPN format)
    const body = await req.text();

    // Step 1: Verify the IPN by posting back to PayPal with "cmd=_notify-validate" prepended
    const verifyBody = "cmd=_notify-validate&" + body;
    const verifyRes = await fetch(PAYPAL_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyBody,
    });
    const verifyText = await verifyRes.text();

    if (verifyText.trim() !== "VERIFIED") {
      console.error("[paypal-ipn] IPN verification failed:", verifyText);
      return new Response("INVALID", { status: 200, headers: CORS_HEADERS });
    }

    // Step 2: Parse the IPN data
    const params = new URLSearchParams(body);
    const paymentStatus = params.get("payment_status");
    const custom = params.get("custom"); // server_id
    const mcGross = params.get("mc_gross");
    const txnId = params.get("txn_id");
    const payerEmail = params.get("payer_email");

    console.log(`[paypal-ipn] Verified: txn=${txnId}, status=${paymentStatus}, server=${custom}, amount=${mcGross}`);

    if (paymentStatus !== "Completed") {
      console.log(`[paypal-ipn] Payment not completed: ${paymentStatus}`);
      return new Response("OK", { status: 200, headers: CORS_HEADERS });
    }

    if (!custom) {
      console.error("[paypal-ipn] Missing custom (server_id) field");
      return new Response("OK", { status: 200, headers: CORS_HEADERS });
    }

    // Step 3: Determine plan duration from amount
    const amount = parseFloat(mcGross || "0");
    let days = 30; // default
    if (amount >= 45) days = 180;
    else if (amount >= 22) days = 90;
    else if (amount >= 9) days = 30;

    // Step 4: Extend the subscription
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.rpc("extend_server_subscription", {
      p_server_id: custom,
      p_days: days,
    });

    if (error) {
      console.error("[paypal-ipn] Failed to extend subscription:", error);
      return new Response("ERROR", { status: 500, headers: CORS_HEADERS });
    }

    console.log(`[paypal-ipn] Extended server ${custom} by ${days} days ($${amount} from ${payerEmail})`);
    return new Response("OK", { status: 200, headers: CORS_HEADERS });

  } catch (err) {
    console.error("[paypal-ipn] Unexpected error:", err);
    return new Response("ERROR", { status: 500, headers: CORS_HEADERS });
  }
});
