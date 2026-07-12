// Supabase REST helpers

import { SUPABASE_URL, SUPABASE_KEY } from "./config";

// ── Structured error logging ─────────────────────────────
// All bot errors should route through here for consistent format + context.
export function logError(scope: string, message: string, detail?: any, extra?: Record<string, any>) {
  const parts = [`[${scope}]`, message];
  if (detail != null) {
    if (typeof detail === "string") {
      parts.push(detail);
    } else if (detail instanceof Error) {
      parts.push(detail.message);
      if (detail.stack) parts.push(detail.stack.split("\n").slice(0, 3).join(" ← "));
    } else {
      try { parts.push(JSON.stringify(detail)); } catch { parts.push(String(detail)); }
    }
  }
  if (extra) {
    try { parts.push(JSON.stringify(extra)); } catch { /* non-critical: log formatting */ }
  }
  console.error(parts.join(" "));
}

// Graceful wrapper: never throws, always returns null on failure
export async function safeCall<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); }
  catch (err: any) { logError("safe", `${label} failed`, err); return null; }
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // base delay, doubles each retry
const FETCH_TIMEOUT_MS = 30_000; // 30s — prevents hung requests from blocking the bot

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      // Retry on 5xx server errors (transient)
      if (res.status >= 500 && attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[bot] Supabase 5xx (${res.status}), retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      // Retry on timeout/network/abort errors
      if (attempt < retries && (err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND' || err?.cause?.code === 'ETIMEDOUT' || err?.name === 'AbortError' || err?.message?.includes('fetch failed'))) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[bot] Supabase fetch error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1}): ${err.message || err}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Fetch failed after ${retries + 1} attempts`);
}

export async function supabaseQuery<T = any>(path: string): Promise<T> {
  // Add default limit if not explicitly set — PostgREST defaults to 1000
  let url = `${SUPABASE_URL}/rest/v1/${path}`;
  if (!/[?&]limit=/.test(path)) {
    url += (path.includes("?") ? "&" : "?") + "limit=5000";
  }
  const res = await fetchWithRetry(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
  });
  if (!res.ok) {
    console.error(`Supabase query failed: ${url} -- ${res.status}`);
    throw new Error(`Database query failed (${res.status})`);
  }
  return res.json() as T;
}

export async function supabaseQuerySafe<T = any>(path: string): Promise<T[]> {
  try { return await supabaseQuery<T[]>(path); } catch (err) { console.error("[bot] supabaseQuerySafe failed:", path, err); return []; }
}

export async function supabaseInsert(table: string, record: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    console.error(`Supabase insert failed: ${table} -- ${res.status}`);
    throw new Error(`Insert failed: ${res.status}`);
  }
  return res.json();
}

export async function supabaseRpc<T = any>(fn: string, params: Record<string, any> = {}): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    console.error(`RPC ${fn} failed: ${res.status}`);
    throw new Error(`RPC failed (${res.status})`);
  }
  return res.json() as T;
}

// ── Safe write helpers — never throw, log with context ────
export async function supabasePatch(table: string, id: string, body: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { logError("db", `PATCH ${table} HTTP ${res.status}`, { id }); return false; }
    return true;
  } catch (err: any) { logError("db", `PATCH ${table} failed`, err, { id }); return false; }
}

export async function supabaseDelete(table: string, column: string, value: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
    });
    if (!res.ok) { logError("db", `DELETE ${table} HTTP ${res.status}`, { [column]: value }); return false; }
    return true;
  } catch (err: any) { logError("db", `DELETE ${table} failed`, err, { [column]: value }); return false; }
}

// ── Audit log helper for bot commands ───────────────────────
export async function writeBotAudit(params: {
  action: string;
  server_id: string;
  discord_user: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    const result = await supabaseRpc("write_audit_entry", {
      p_action: params.action,
      p_server_id: params.server_id,
      p_target_type: params.target_type || null,
      p_target_id: params.target_id || null,
      p_details: params.details || {},
      p_discord_actor: params.discord_user,
    });
    console.log("[bot-audit] OK:", params.action, "→", result);
  } catch (err: any) {
    console.error("[bot-audit] FAIL:", params.action, "—", err?.message || err);
  }
}

export async function supabasePost(table: string, body: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { logError("db", `POST ${table} HTTP ${res.status}`, { keys: Object.keys(body) }); return false; }
    return true;
  } catch (err: any) { logError("db", `POST ${table} failed`, err, { keys: Object.keys(body) }); return false; }
}
