/**
 * PayPal payment activation: turns a captured PayPal payment into server time.
 *
 * Deploy: supabase functions deploy paypal-ipn --no-verify-jwt
 *   PayPal's IPN POSTs carry no Supabase JWT. With verify_jwt on, the gateway
 *   rejected every one of them with 401 before this code ran, which is why the
 *   IPN never backed up the Smart Button call. Both paths below verify with
 *   PayPal itself instead, so the gateway check adds nothing.
 *
 * Requires secrets PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (the live REST app
 * whose client id the frontend uses as VITE_PAYPAL_CLIENT_ID), and
 * PAYPAL_MERCHANT_ID (the receiving account's merchant ID, PayPal → Account
 * Settings → Business information). The browser builds the order, so it could
 * name any payee; only payments made to that merchant ID are credited.
 *
 * Handles two request formats:
 * 1. JSON POST from our Smart Button onApprove, after the browser captured the
 *    order. The browser already has the money, so this is best-effort.
 * 2. URL-encoded IPN POST from PayPal for the same capture. This is the
 *    backstop: PayPal retries it until we answer 200, so a closed tab or a
 *    failed call from (1) still gets credited.
 *
 * Both resolve the payment to a completed PayPal capture through the REST API
 * and credit it via record_paypal_payment, which is idempotent on the capture
 * id: the button call, the IPN and every retry credit exactly once.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET");
// Normalized: a pasted value with a stray space or newline must not reject every payment.
const PAYPAL_MERCHANT_ID = Deno.env.get("PAYPAL_MERCHANT_ID")?.trim().toUpperCase();
const PAYPAL_CONFIGURED = !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && PAYPAL_MERCHANT_ID);

const PAYPAL_API = "https://api-m.paypal.com";
const PAYPAL_IPN_VERIFY_URL = "https://ipnpb.paypal.com/cgi-bin/webscr";

// One product: $9.99 for 30 days (PayPalSubscribeButton.tsx creates the order).
const PRICE_CENTS = 999;
const DAYS_PER_PAYMENT = 30;

// NOTE: PayPal IPN uses wildcard CORS intentionally.
// The IPN endpoint receives server-to-server callbacks from PayPal,
// and the Smart Button flow is called from our frontend.
// Both paths verify the payment with PayPal server-side.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** A completed capture, as PayPal's REST API reports it. */
interface PaidCapture {
  captureId: string;
  orderId: string | null;
  serverId: string | null;
  payeeMerchantId: string | null;
  amountCents: number;
  currency: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function toCents(value: string | undefined): number {
  return Math.round(parseFloat(value || "0") * 100);
}

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

/** GET a PayPal REST resource. Returns null on 404; throws on any other failure. */
async function paypalGet(path: string): Promise<any | null> {
  const token = await getPayPalToken();
  const res = await fetch(`${PAYPAL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`PayPal GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Look up a Smart Button order and return its capture, if it has one.
 * notFound: these credentials can't see the order at all -- which says nothing
 * about whether the buyer paid.
 */
async function getOrderCapture(
  orderId: string,
): Promise<{ capture: PaidCapture | null; captureStatus: string | null; notFound?: boolean }> {
  const order = await paypalGet(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (!order) return { capture: null, captureStatus: null, notFound: true };
  const pu = order.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];
  if (!capture) return { capture: null, captureStatus: null };
  return {
    captureStatus: capture.status,
    capture: {
      captureId: capture.id,
      orderId,
      serverId: pu.custom_id ?? capture.custom_id ?? null,
      payeeMerchantId: pu.payee?.merchant_id ?? null,
      amountCents: toCents(capture.amount?.value),
      currency: capture.amount?.currency_code || "",
    },
  };
}

/** Look up a capture by id -- an IPN's txn_id is the v2 capture id. */
async function getCapture(captureId: string): Promise<{ capture: PaidCapture | null; captureStatus: string | null }> {
  const capture = await paypalGet(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
  if (!capture) return { capture: null, captureStatus: null };
  return {
    captureStatus: capture.status,
    capture: {
      captureId: capture.id,
      orderId: capture.supplementary_data?.related_ids?.order_id ?? null,
      serverId: capture.custom_id ?? null,
      payeeMerchantId: capture.payee?.merchant_id ?? null,
      amountCents: toCents(capture.amount?.value),
      currency: capture.amount?.currency_code || "",
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a capture can't be credited, or null if it can. */
function rejectReason(c: PaidCapture): string | null {
  if (!c.serverId || !UUID_RE.test(c.serverId)) {
    return `no valid server id (custom_id) on the capture: ${c.serverId}`;
  }
  if (c.payeeMerchantId?.toUpperCase() !== PAYPAL_MERCHANT_ID) {
    return `paid to merchant ${c.payeeMerchantId}, not RaidScout`;
  }
  if (c.currency !== "USD" || c.amountCents < PRICE_CENTS) {
    return `unexpected amount ${c.amountCents / 100} ${c.currency}`;
  }
  return null;
}

/** Record the payment and credit the server, once per capture. */
async function credit(c: PaidCapture, payerEmail: string | null) {
  const { data, error } = await supabase.rpc("record_paypal_payment", {
    p_server_id: c.serverId,
    p_order_id: c.orderId,
    p_capture_id: c.captureId,
    p_amount: c.amountCents / 100,
    p_days: DAYS_PER_PAYMENT,
    p_payer_email: payerEmail,
  });
  if (error) throw error;
  console.log(
    `[paypal-ipn] capture=${c.captureId} order=${c.orderId} server=${c.serverId} ` +
      `credited=${data?.credited} ends=${data?.subscription_ends_at}`,
  );
  return data as { credited: boolean; subscription_ends_at: string | null };
}

/** Smart Button onApprove: {server_id, order_id} after the browser captured. */
async function handleSmartButton(req: Request): Promise<Response> {
  const { server_id, order_id } = await req.json();
  if (!server_id || !order_id) {
    return json({ error: "Missing server_id or order_id" }, 400);
  }

  if (!PAYPAL_CONFIGURED) {
    // The payment is safe: PayPal's IPN for it is retried until it gets through.
    console.error("[paypal-ipn] PayPal secrets not configured (PAYPAL_CLIENT_ID/SECRET/MERCHANT_ID)");
    return json({ error: "Payment verification unavailable", retryable: true }, 503);
  }

  let lookup;
  try {
    lookup = await getOrderCapture(order_id);
  } catch (err) {
    console.error("[paypal-ipn] Order lookup error:", err);
    return json({ error: "Payment verification failed", retryable: true }, 502);
  }

  if (lookup.notFound) {
    // Most likely credentials for a different PayPal app than the frontend's.
    // The buyer may well have paid, so leave it to the IPN rather than say no.
    console.error(`[paypal-ipn] Order ${order_id} not found via API (check PAYPAL_CLIENT_ID matches VITE_PAYPAL_CLIENT_ID); leaving it to the IPN`);
    return json({ error: "Payment verification unavailable", retryable: true }, 503);
  }

  // paid: false tells the button no money was taken, so it doesn't tell the
  // buyer their payment went through.
  const { capture, captureStatus } = lookup;
  if (!capture) {
    return json({ error: "Order not captured. Payment may not have gone through.", paid: false }, 400);
  }
  if (captureStatus === "PENDING") {
    // e.g. eCheck or PayPal review. PayPal sends a Completed IPN when it clears.
    return json({ success: true, pending: true });
  }
  if (captureStatus !== "COMPLETED") {
    return json({ error: `Payment ${captureStatus?.toLowerCase()}`, paid: false }, 400);
  }

  if (!capture.payeeMerchantId) {
    // Can't prove who was paid. Don't reject a possibly real payment: the IPN,
    // whose receiver_id PayPal vouches for, will credit it.
    console.error(`[paypal-ipn] Order ${order_id} has no payee merchant id; leaving it to the IPN`);
    return json({ error: "Payment verification unavailable", retryable: true }, 503);
  }
  const reason = rejectReason(capture);
  if (reason) {
    console.error(`[paypal-ipn] Rejected order ${order_id}: ${reason}`);
    return json({ error: "Invalid payment" }, 400);
  }
  // The server comes from the order PayPal verified, not from the request body,
  // so an order can only ever credit the server it was bought for.
  if (capture.serverId !== server_id) {
    console.error(`[paypal-ipn] Order ${order_id} is for server ${capture.serverId}, not ${server_id}`);
    return json({ error: "Order does not belong to this server" }, 400);
  }

  try {
    const result = await credit(capture, null);
    return json({ success: true, ...result });
  } catch (err) {
    console.error("[paypal-ipn] Failed to credit order", order_id, err);
    return json({ error: "Failed to activate access", retryable: true }, 500);
  }
}

/**
 * PayPal IPN. Answer 200 to anything we have finished with (credited, a
 * duplicate, or not ours); answer 500 only when a retry could succeed, since
 * PayPal keeps retrying until it gets a 200.
 */
async function handleIpn(req: Request): Promise<Response> {
  const body = await req.text();

  // Post back the raw body untouched: re-encoding it makes PayPal answer INVALID.
  const verifyRes = await fetch(PAYPAL_IPN_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "RaidScout-IPN-Listener/1.0",
    },
    body: "cmd=_notify-validate&" + body,
  });
  if (!verifyRes.ok) {
    console.error(`[paypal-ipn] IPN verification request failed: ${verifyRes.status}`);
    return new Response("RETRY", { status: 500, headers: CORS_HEADERS });
  }
  const verifyText = (await verifyRes.text()).trim();
  if (verifyText !== "VERIFIED") {
    console.error("[paypal-ipn] IPN verification failed:", verifyText);
    return new Response("INVALID", { status: 200, headers: CORS_HEADERS });
  }

  const params = new URLSearchParams(body);
  const paymentStatus = params.get("payment_status");
  const txnId = params.get("txn_id");
  const custom = params.get("custom");
  const payerEmail = params.get("payer_email");
  const receiverId = params.get("receiver_id");

  console.log(`[paypal-ipn] Verified IPN: txn=${txnId}, status=${paymentStatus}, custom=${custom}, receiver=${receiverId}`);

  if (paymentStatus !== "Completed" || !txnId) {
    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  }

  if (!PAYPAL_CONFIGURED) {
    // Retry later: once the secrets are set, PayPal's next retry credits it.
    console.error("[paypal-ipn] PayPal secrets not configured (PAYPAL_CLIENT_ID/SECRET/MERCHANT_ID); IPN will be retried");
    return new Response("RETRY", { status: 500, headers: CORS_HEADERS });
  }

  // The postback vouches for receiver_id: a VERIFIED IPN for a payment made to
  // someone else's account is genuine, just not ours. But when it carries a
  // server id it came through our checkout, and a mismatch more likely means
  // PAYPAL_MERCHANT_ID is wrong -- keep PayPal retrying until that's fixed.
  if (receiverId?.toUpperCase() !== PAYPAL_MERCHANT_ID) {
    if (custom && UUID_RE.test(custom)) {
      console.error(`[paypal-ipn] txn ${txnId} for server ${custom} was paid to ${receiverId}, expected ${PAYPAL_MERCHANT_ID}; will retry (check PAYPAL_MERCHANT_ID)`);
      return new Response("RETRY", { status: 500, headers: CORS_HEADERS });
    }
    console.log(`[paypal-ipn] txn ${txnId} was paid to ${receiverId}, not RaidScout; ignoring`);
    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  }

  // The IPN fields are only a pointer. Amount, currency, server and order come
  // from the capture itself.
  const { capture, captureStatus } = await getCapture(txnId);
  if (!capture) {
    // Tagged with a server id means it came from our checkout, so a miss is
    // most likely wrong credentials: keep PayPal retrying rather than drop a
    // real payment. Untagged payments aren't ours to credit.
    if (custom && UUID_RE.test(custom)) {
      console.error(`[paypal-ipn] Capture ${txnId} for server ${custom} not found via API; will retry`);
      return new Response("RETRY", { status: 500, headers: CORS_HEADERS });
    }
    console.log(`[paypal-ipn] txn ${txnId} is not a RaidScout checkout capture; ignoring`);
    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  }
  if (captureStatus !== "COMPLETED") {
    console.log(`[paypal-ipn] Capture ${txnId} is ${captureStatus}; ignoring`);
    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  }
  capture.serverId ??= custom;
  capture.payeeMerchantId ??= receiverId;

  const reason = rejectReason(capture);
  if (reason) {
    console.error(`[paypal-ipn] Rejected capture ${txnId}: ${reason}`);
    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  }

  await credit(capture, payerEmail);
  return new Response("OK", { status: 200, headers: CORS_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await handleSmartButton(req);
    }
    return await handleIpn(req);
  } catch (err) {
    console.error("[paypal-ipn] Unexpected error:", err);
    return new Response("ERROR", { status: 500, headers: CORS_HEADERS });
  }
});
