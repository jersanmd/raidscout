// Supabase REST helpers

import { SUPABASE_URL, SUPABASE_KEY } from "./config";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // base delay, doubles each retry

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Retry on 5xx server errors (transient)
      if (res.status >= 500 && attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[bot] Supabase 5xx (${res.status}), retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err: any) {
      // Retry on network/fetch errors (DNS, connection refused, timeout, etc.)
      if (attempt < retries && (err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND' || err?.cause?.code === 'ETIMEDOUT' || err?.message?.includes('fetch failed'))) {
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
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
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
