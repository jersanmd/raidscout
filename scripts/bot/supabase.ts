// @ts-nocheck
// Supabase REST helpers

import { SUPABASE_URL, SUPABASE_KEY } from "./config";

export async function supabaseQuery(path: string): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
  });
  if (!res.ok) {
    console.error(`Supabase query failed: ${url} -- ${res.status}`);
    throw new Error(`Database query failed (${res.status})`);
  }
  return res.json();
}

export async function supabaseQuerySafe(path: string): Promise<any> {
  try { return await supabaseQuery(path); } catch { return []; }
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
