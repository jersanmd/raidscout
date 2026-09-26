// reconcile-paypal-payments.mjs — Find PayPal payments that were captured but
// never credited, and (with --apply) credit them.
//
// Background: from 2026-06-22 until the paypal-ipn fix, every Smart Button
// activation failed after PayPal had already taken the money, and PayPal's IPN
// retries were rejected with 401. PayPal stops retrying an IPN after a few
// days, so older payments will never arrive on their own — this script finds
// them in PayPal's transaction history instead.
//
// Crediting goes through record_paypal_payment, the same idempotent RPC the
// edge function uses, keyed on the capture id. Re-running the script, or an IPN
// arriving for a payment the script already credited, never double-credits.
//
// NOT covered by that guard: servers an admin extended by hand from the Admin
// Panel while payments were broken. Those comps wrote no payments row, so the
// script checks admin_audit_log for a subscription_extend on the server from
// an hour before the payment onward, and reports such payments as COMPED
// instead of MISSING. --apply skips them unless their capture id is in --only.
//
// Requires the live REST app to have "Transaction search" enabled (PayPal
// developer dashboard → app → Features). Transactions can take up to ~3 hours
// to appear in search.
//
// Usage (dry run — reads only):
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/reconcile-paypal-payments.mjs --since 2026-06-21
// Credit everything the dry run listed as MISSING:
//   ... node scripts/reconcile-paypal-payments.mjs --since 2026-06-21 --apply
// Credit only some captures:
//   ... node scripts/reconcile-paypal-payments.mjs --since 2026-06-21 --apply --only 1AB23456CD789012E,3FG...

import { parseArgs } from "node:util";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://cjuacehmienztxrhwnlg.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = "https://api-m.paypal.com";

// Must match supabase/functions/paypal-ipn/index.ts.
const PRICE_CENTS = 999;
const DAYS_PER_PAYMENT = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const MAX_SEARCH_DAYS = 31; // Transaction Search limit per request

// Strict: a mistyped or valueless flag must stop the script, never widen --apply.
const { values: opts } = parseArgs({
  options: { since: { type: "string" }, apply: { type: "boolean" }, only: { type: "string" } },
  strict: true,
  allowPositionals: false,
});
const since = new Date(opts.since || "2026-06-21T00:00:00Z");
const apply = !!opts.apply;
const only = opts.only === undefined ? null : new Set(opts.only.split(",").map((s) => s.trim()).filter(Boolean));
if (only && only.size === 0) {
  console.error("--only was given without any capture ids");
  process.exit(1);
}

if (!SERVICE_KEY || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.error("Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (Number.isNaN(since.getTime())) {
  console.error("--since must be a date, e.g. 2026-06-21");
  process.exit(1);
}

async function paypalToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function paypalGet(token, path) {
  const res = await fetch(`${PAYPAL_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PayPal GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function recordPayment(c) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_paypal_payment`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_server_id: c.serverId,
      p_order_id: c.orderId,
      p_capture_id: c.captureId,
      p_amount: c.amountCents / 100,
      p_days: DAYS_PER_PAYMENT,
      p_payer_email: c.payerEmail,
    }),
  });
  if (!res.ok) throw new Error(`record_paypal_payment failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Transaction Search wants RFC 3339 to the second.
const rfc3339 = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Every transaction PayPal reports since `since`, in 31-day windows, one per id. */
async function searchTransactions(token) {
  const byId = new Map(); // an id can appear as both a balance and a non-balance record
  const now = new Date();
  for (let start = since; start < now; start = new Date(start.getTime() + MAX_SEARCH_DAYS * DAY_MS)) {
    const end = new Date(Math.min(start.getTime() + MAX_SEARCH_DAYS * DAY_MS - 1000, now.getTime()));
    for (let page = 1, totalPages = 1; page <= totalPages; page++) {
      const qs = new URLSearchParams({
        start_date: rfc3339(start),
        end_date: rfc3339(end),
        fields: "transaction_info,payer_info",
        page_size: "500",
        page: String(page),
      });
      const data = await paypalGet(token, `/v1/reporting/transactions?${qs}`);
      totalPages = data?.total_pages || 1;
      for (const t of data?.transaction_details || []) {
        const id = t.transaction_info?.transaction_id;
        if (id && !byId.has(id)) byId.set(id, t);
      }
    }
  }
  return [...byId.values()];
}

async function main() {
  const token = await paypalToken();
  console.log(`Searching PayPal transactions since ${since.toISOString()} ...`);
  const transactions = await searchTransactions(token);

  // Incoming USD payments. Ours carry custom_id = server id; a payment of the
  // right size without one can't be attributed automatically, so show it.
  const incoming = transactions.filter((t) => {
    const amount = t.transaction_info?.transaction_amount;
    return amount?.currency_code === "USD" && Math.round(parseFloat(amount.value || "0") * 100) >= PRICE_CENTS;
  });
  const candidates = incoming.filter((t) => UUID_RE.test(t.transaction_info.custom_field || ""));
  console.log(`${transactions.length} transactions, ${candidates.length} tagged with a server id.\n`);
  for (const t of incoming.filter((t) => !candidates.includes(t))) {
    const info = t.transaction_info;
    console.warn(
      `  CHECK BY HAND: ${info.transaction_initiation_date?.slice(0, 10)} ${info.transaction_id} ` +
        `$${info.transaction_amount.value} ${t.payer_info?.email_address ?? ""} — no server id`,
    );
  }

  // The capture API is the authority on status, server, amount and order —
  // the same source the edge function trusts.
  const captures = [];
  for (const t of candidates) {
    const id = t.transaction_info.transaction_id;
    const cap = await paypalGet(token, `/v2/payments/captures/${encodeURIComponent(id)}`);
    if (!cap) {
      console.warn(`  ${id}: not a v2 capture — check by hand`);
      continue;
    }
    captures.push({
      captureId: cap.id,
      orderId: cap.supplementary_data?.related_ids?.order_id ?? null,
      serverId: cap.custom_id ?? t.transaction_info.custom_field,
      status: cap.status,
      amountCents: Math.round(parseFloat(cap.amount?.value || "0") * 100),
      currency: cap.amount?.currency_code,
      payerEmail: t.payer_info?.email_address ?? null,
      date: t.transaction_info.transaction_initiation_date,
    });
  }
  if (captures.length === 0) {
    console.log("Nothing to reconcile.");
    return;
  }

  const inList = (values) => `(${values.map((v) => `"${v}"`).join(",")})`;
  const captureIds = captures.map((c) => c.captureId);
  const orderIds = captures.map((c) => c.orderId).filter(Boolean);
  const recorded = await supabaseGet(
    `payments?select=paypal_order_id,paypal_capture_id&or=(paypal_capture_id.in.${inList(captureIds)}` +
      (orderIds.length ? `,paypal_order_id.in.${inList(orderIds)})` : ")"),
  );
  const recordedIds = new Set(recorded.flatMap((p) => [p.paypal_capture_id, p.paypal_order_id]).filter(Boolean));

  const serverIds = [...new Set(captures.map((c) => c.serverId))];
  const servers = await supabaseGet(
    `servers?select=id,name,subscription_ends_at,trial_ends_at,deleted_at&id=in.${inList(serverIds)}`,
  );
  const serverById = new Map(servers.map((s) => [s.id, s]));

  // Manual Admin Panel extends since the earliest payment, to spot comps.
  const captureTime = (c) => new Date(c.date).getTime();
  const knownTimes = captures.map(captureTime).filter((t) => !Number.isNaN(t));
  // A capture with no readable date could be as old as --since.
  const earliest = new Date(
    (knownTimes.length === captures.length ? Math.min(...knownTimes) : since.getTime()) - 3_600_000,
  );
  const adminExtends = await supabaseGet(
    `admin_audit_log?select=server_id,created_at,details&action=eq.subscription_extend` +
      `&server_id=in.${inList(serverIds)}&created_at=gte.${earliest.toISOString()}`,
  );
  const extendsSince = (serverId, time) =>
    adminExtends.filter((e) => e.server_id === serverId && new Date(e.created_at).getTime() >= time - 3_600_000);
  // An unreadable date can't be ruled out as comped, so it is never auto-credited.
  const wasComped = (c) => Number.isNaN(captureTime(c)) || extendsSince(c.serverId, captureTime(c)).length > 0;

  const missing = [];
  for (const c of captures) {
    const srv = serverById.get(c.serverId);
    const credited = recordedIds.has(c.captureId) || (c.orderId && recordedIds.has(c.orderId));
    const creditable =
      c.status === "COMPLETED" && c.currency === "USD" && c.amountCents >= PRICE_CENTS && srv && !srv.deleted_at;
    const state = credited
      ? "recorded"
      : !creditable
        ? `skip (${c.status}${srv ? "" : ", no server"}${srv?.deleted_at ? ", deleted" : ""})`
        : wasComped(c)
          ? "COMPED"
          : "MISSING";
    if (state === "MISSING" || state === "COMPED") missing.push({ ...c, comped: state === "COMPED" });
    console.log(
      [
        c.date?.slice(0, 10),
        c.captureId,
        `$${(c.amountCents / 100).toFixed(2)}`,
        state.padEnd(9),
        srv ? `"${srv.name}"` : c.serverId,
        `sub ends ${srv?.subscription_ends_at?.slice(0, 10) ?? "—"}`,
        c.payerEmail ?? "",
      ].join("  "),
    );
  }

  const comped = missing.filter((c) => c.comped).length;
  console.log(`\n${missing.length - comped} paid but uncredited (MISSING), ${comped} extended by an admin since (COMPED).`);

  // COMPED is per server: one extend marks every earlier payment on it. Show
  // how much the admin actually gave against how much was paid for.
  for (const serverId of new Set(missing.filter((c) => c.comped).map((c) => c.serverId))) {
    const compedHere = missing.filter((c) => c.serverId === serverId && c.comped);
    const autoHere = missing.filter((c) => c.serverId === serverId && !c.comped).length;
    const times = compedHere.map(captureTime);
    const first = times.some(Number.isNaN) ? -Infinity : Math.min(...times);
    const given = extendsSince(serverId, first);
    const days = given.reduce((sum, e) => sum + (Number(e.details?.days) || DAYS_PER_PAYMENT), 0);
    console.log(
      `  COMPED "${serverById.get(serverId)?.name}": ${given.length} admin extend(s) (+${days}d) ` +
        `vs ${compedHere.length} comped payment(s) (${compedHere.length * DAYS_PER_PAYMENT}d)` +
        (autoHere ? `; +${autoHere} MISSING, credited by --apply` : ""),
    );
  }
  if (!apply) {
    console.log("Dry run. Re-run with --apply to credit MISSING; add --only <captureIds> to pick, including COMPED ones.");
    return;
  }

  for (const c of missing) {
    if (only ? !only.has(c.captureId) : c.comped) continue;
    const result = await recordPayment(c);
    console.log(`  ${c.captureId} → server ${c.serverId}: credited=${result.credited}, ends ${result.subscription_ends_at}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
