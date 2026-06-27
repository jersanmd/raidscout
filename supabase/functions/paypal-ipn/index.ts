/**
 * PayPal IPN (Instant Payment Notification) receiver + Smart Button activation.
 * 
 * Handles two request formats:
 * 1. URL-encoded IPN POST from PayPal (legacy) — verified, then processed
 * 2. JSON POST from our Smart Button onApprove — verifies order with PayPal API, then activates
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;

const PAYPAL_API = "https://api-m.paypal.com";

// NOTE: PayPal IPN uses wildcard CORS intentionally.
// The IPN endpoint receives server-to-server callbacks from PayPal,
// and the Smart Button flow is called from our frontend.
// CORS origin validation is handled by verifying the PayPal order server-side.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Get a PayPal access token for API calls */
async function getPayPalToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Verify a PayPal order was captured and extract amount/details */
async function verifyPayPalOrder(orderId: string): Promise<{ status: string; amount: number; currency: string; captureId: string } | null> {
  const token = await getPayPalToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`[paypal-ipn] Order lookup failed: ${res.status}`);
    return null;
  }
  const order = await res.json();
  const status = order.status;
  const pu = order.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];
  if (status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
    console.error(`[paypal-ipn] Order not completed: status=${status}, capture=${capture?.status}`);
    return null;
  }
  return {
    status: "COMPLETED",
    amount: parseFloat(capture.amount?.value || "0"),
    currency: capture.amount?.currency_code || "USD",
    captureId: capture.id,
  };
}

async function extendSubscription(serverId: string, subscrId: string | null, days: number) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.rpc("extend_server_subscription", {
    p_server_id: serverId,
    p_days: days,
  });

  if (error) {
    console.error("[paypal-ipn] Failed to extend subscription:", error);
    throw error;
  }

  if (subscrId) {
    const { error: updateErr } = await supabase
      .from("servers")
      .update({ paypal_subscription_id: subscrId })
      .eq("id", serverId);
    if (updateErr) {
      console.error("[paypal-ipn] Failed to store subscription ID:", updateErr);
    }
  }

  console.log(`[paypal-ipn] Extended server ${serverId} by ${days} days (sub=${subscrId})`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    // ── Smart Button JSON activation (from onApprove) ──
    if (contentType.includes("application/json")) {
      const { server_id, order_id } = await req.json();

      if (!server_id || !order_id) {
        return new Response(JSON.stringify({ error: "Missing server_id or order_id" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // ── Idempotency: skip if this order was already processed ──
      const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("paypal_order_id", order_id)
        .maybeSingle();
      if (existing) {
        console.log(`[paypal-ipn] Order ${order_id} already processed — skipping`);
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // ── Verify order with PayPal API ──
      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        console.error("[paypal-ipn] PayPal API credentials not configured");
        return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      let orderInfo;
      try {
        orderInfo = await verifyPayPalOrder(order_id);
      } catch (err) {
        console.error("[paypal-ipn] Order verification error:", err);
        return new Response(JSON.stringify({ error: "Payment verification failed" }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (!orderInfo) {
        return new Response(JSON.stringify({ error: "Order not completed. Payment may not have been captured." }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (orderInfo.currency !== "USD" || orderInfo.amount < 9.00) {
        console.error(`[paypal-ipn] Suspicious order: ${orderInfo.amount} ${orderInfo.currency}`);
        return new Response(JSON.stringify({ error: "Invalid payment amount" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      await extendSubscription(server_id, order_id, 30);

      // Record payment
      const { error: payErr } = await supabase.from("payments").insert({
        server_id,
        paypal_order_id: order_id,
        paypal_capture_id: orderInfo.captureId,
        amount: orderInfo.amount,
        days_added: 30,
        status: "completed",
      });
      if (payErr) console.error("[paypal-ipn] Failed to record payment:", payErr);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Legacy IPN verification ──
    const body = await req.text();

    // Verify with PayPal
    const verifyBody = "cmd=_notify-validate&" + body;
    const verifyRes = await fetch("https://ipnpb.paypal.com/cgi-bin/webscr", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyBody,
    });
    const verifyText = await verifyRes.text();

    if (verifyText.trim() !== "VERIFIED") {
      console.error("[paypal-ipn] IPN verification failed:", verifyText);
      return new Response("INVALID", { status: 200, headers: CORS_HEADERS });
    }

    const params = new URLSearchParams(body);
    const paymentStatus = params.get("payment_status");
    const custom = params.get("custom");
    const mcGross = params.get("mc_gross");
    const txnId = params.get("txn_id");
    const payerEmail = params.get("payer_email");
    const subscrId = params.get("subscr_id");

    console.log(`[paypal-ipn] Verified: txn=${txnId}, status=${paymentStatus}, server=${custom}, amount=${mcGross}`);

    if (paymentStatus !== "Completed") {
      console.log(`[paypal-ipn] Payment not completed: ${paymentStatus}`);
      return new Response("OK", { status: 200, headers: CORS_HEADERS });
    }

    if (!custom) {
      console.error("[paypal-ipn] Missing custom (server_id) field");
      return new Response("OK", { status: 200, headers: CORS_HEADERS });
    }

    const amount = parseFloat(mcGross || "0");
    let days = 30;
    if (amount >= 45) days = 180;
    else if (amount >= 22) days = 90;
    else if (amount >= 9) days = 30;

    await extendSubscription(custom, subscrId, days);

    // Record payment for legacy IPN path too
    const supabase2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: payErr } = await supabase2.from("payments").insert({
      server_id: custom,
      paypal_order_id: txnId,
      amount: amount,
      days_added: days,
      status: "completed",
      payer_email: payerEmail || undefined,
    });
    if (payErr) console.error("[paypal-ipn] Failed to record payment (legacy):", payErr);

    console.log(`[paypal-ipn] Extended server ${custom} by ${days} days ($${amount} from ${payerEmail}, sub=${subscrId})`);
    return new Response("OK", { status: 200, headers: CORS_HEADERS });

  } catch (err) {
    console.error("[paypal-ipn] Unexpected error:", err);
    return new Response("ERROR", { status: 500, headers: CORS_HEADERS });
  }
});
